# ================================
# Auto AI Git Commit Script (Groq)
# ================================

# Ctrl+C: quit immediately (exit 130). Catch blocks below must rethrow stop signals
# so they are not treated as API/file errors.
trap {
    $ex = $_.Exception
    if ($ex -is [System.Management.Automation.PipelineStoppedException] -or
        $ex -is [System.OperationCanceledException]) {
        Write-Host "`n[Quit] Interrupted (Ctrl+C)." -ForegroundColor Yellow
        exit 130
    }
    break
}
try { [Console]::TreatControlCAsInput = $false } catch {}

function Test-IsStoppingException {
    param([System.Exception]$Exception)
    if ($null -eq $Exception) { return $false }
    return $Exception -is [System.Management.Automation.PipelineStoppedException] -or
        $Exception -is [System.OperationCanceledException]
}

# --- Load .env (script folder first, then current directory) ---
# Tasks often set cwd to workspace root, not this script's folder.
$envCandidates = @()
if ($PSScriptRoot) {
    $envCandidates += (Join-Path $PSScriptRoot ".env")
}
$envCandidates += (Join-Path (Get-Location) ".env")

$envPath = $null
foreach ($candidate in $envCandidates) {
    if (Test-Path -LiteralPath $candidate) {
        $envPath = $candidate
        break
    }
}

if (-not $envPath) {
    Write-Host "[ERROR] .env file not found. Tried:"
    $envCandidates | ForEach-Object { Write-Host "  - $_" }
    exit
}

Get-Content $envPath | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]*)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
    }
}

$script:GROQ_API_KEY = $env:GROQ_API_KEY

if (-not $script:GROQ_API_KEY) {
    Write-Host "[ERROR] GROQ_API_KEY missing in .env"
    exit
}

$script:ValidCommitTags = @("Add:", "Update:", "Fix:", "Refactor:", "Ignore:")

# --- Load Groq model routing config ---
function Get-GroqModelRouting {
    $configCandidates = @()
    if ($PSScriptRoot) {
        $configCandidates += (Join-Path $PSScriptRoot "groq-models.json")
    }
    $configCandidates += (Join-Path (Get-Location) "groq-models.json")

    $configPath = $null
    foreach ($candidate in $configCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            $configPath = $candidate
            break
        }
    }

    if (-not $configPath) {
        Write-Host "[ERROR] groq-models.json file not found. Tried:"
        $configCandidates | ForEach-Object { Write-Host "  - $_" }
        exit
    }

    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        if (Test-IsStoppingException $_.Exception) { throw }
        Write-Host "[ERROR] Could not parse $configPath"
        Write-Host "  $($_.Exception.Message)"
        exit
    }

    $models = @()
    foreach ($model in @($config.models)) {
        if (-not $model.enabled) { continue }
        if ([string]::IsNullOrWhiteSpace([string]$model.id)) { continue }

        $maxCalls = 0
        if (-not [int]::TryParse([string]$model.maxCallsPerRun, [ref]$maxCalls)) {
            Write-Host "[WARN] Skipping model with invalid maxCallsPerRun: $($model.id)"
            continue
        }

        if ($maxCalls -le 0) {
            Write-Host "[WARN] Skipping model with non-positive maxCallsPerRun: $($model.id)"
            continue
        }

        $models += [PSCustomObject]@{
            Id          = [string]$model.id
            MaxCalls    = $maxCalls
            CallsUsed   = 0
            CostOrder   = $model.costOrder
            CostTier    = $model.costTier
        }
    }

    if ($models.Count -eq 0) {
        Write-Host "[ERROR] No enabled Groq models found in $configPath"
        exit
    }

    Write-Host "Groq model routing:"
    foreach ($model in $models) {
        Write-Host (" - {0} ({1}/{2} calls used)" -f $model.Id, $model.CallsUsed, $model.MaxCalls)
    }

    return $models
}

# --- Get modified + new files ---
$modifiedFiles = git diff --name-only
$newFiles = git ls-files --others --exclude-standard

$allFiles = @()
if ($modifiedFiles) { $allFiles += $modifiedFiles }
if ($newFiles) { $allFiles += $newFiles }

$allFiles = $allFiles | Sort-Object -Unique

if (-not $allFiles -or $allFiles.Count -eq 0) {
    Write-Host "[OK] No changes to commit"
    exit
}

Write-Host "Files detected:"
$allFiles | ForEach-Object { Write-Host " - $_" }

$script:GroqModels = @(Get-GroqModelRouting)

# --- Function: Call Groq ---
function Invoke-GroqOnce($modelId, $apiKey, $promptText) {
    $uri = "https://api.groq.com/openai/v1/chat/completions"
    $headers = @{
        Authorization = "Bearer $apiKey"
    }
    $bodyObj = @{
        model       = $modelId
        messages    = @(
            @{
                role    = "system"
                content = "You write concise git commit messages."
            },
            @{
                role    = "user"
                content = $promptText
            }
        )
        temperature = 0.2
        max_tokens  = 64
    }
    $jsonBody = $bodyObj | ConvertTo-Json -Depth 10

    try {
        $response = Invoke-RestMethod -Method POST -Uri $uri `
            -Headers $headers `
            -ContentType "application/json; charset=utf-8" `
            -Body $jsonBody -ErrorAction Stop

        $text = [string]$response.choices[0].message.content
        if ([string]::IsNullOrWhiteSpace($text)) {
            return @{ Ok = $false; Code = $null; Error = "Empty response" }
        }

        return @{ Ok = $true; Text = $text.Trim() }
    }
    catch {
        if (Test-IsStoppingException $_.Exception) { throw }
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        return @{ Ok = $false; Code = $code; Error = $_.Exception.Message }
    }
}

# --- Function: Validate AI commit message shape ---
function Test-ValidCommitMessage($msg) {
    if ([string]::IsNullOrWhiteSpace($msg)) { return $false }

    foreach ($tag in $script:ValidCommitTags) {
        if ($msg.Trim().StartsWith($tag)) {
            return $true
        }
    }

    return $false
}

# --- Function: Call Groq with model limits and fallback routing ---
function Get-CommitMessage($fileName, $diff) {

    if ($diff.Length -gt 4000) { $diff = $diff.Substring(0, 4000) }

    $prompt = @"
Generate ONE git commit message for this file change.
Rules: max 10 words, start with exactly one of: Add:, Update:, Fix:, Refactor:, Ignore:
Output only the commit message, nothing else.

File: $fileName

Diff:
$diff
"@

    $lastCandidate = $null

    foreach ($model in $script:GroqModels) {
        if ($model.CallsUsed -ge $model.MaxCalls) {
            Write-Host "[INFO] Groq ($($model.Id)) call limit reached for this run - trying next"
            continue
        }

        $model.CallsUsed++
        Write-Host ("[INFO] Groq model: {0} ({1}/{2})" -f $model.Id, $model.CallsUsed, $model.MaxCalls)

        $result = Invoke-GroqOnce $model.Id $script:GROQ_API_KEY $prompt
        if ($result.Ok) {
            $lastCandidate = $result.Text

            if (Test-ValidCommitMessage $result.Text) {
                return [PSCustomObject]@{
                    Text         = $result.Text
                    UsedFallback = $false
                }
            }

            Write-Host "[WARN] Groq ($($model.Id)) returned an invalid commit message - trying next"
            continue
        }

        Write-Host "[WARN] Groq ($($model.Id)) error $($result.Code): $($result.Error)"
    }

    Write-Host "[WARN] All Groq models failed or returned invalid messages - using normalizer fallback"
    return [PSCustomObject]@{
        Text         = $lastCandidate
        UsedFallback = $true
    }
}

# --- Function: Normalize commit message ---
function Get-NormalizedCommitMessage($msg, $fileName) {

    if (-not $msg) {
        return "Update: modify $fileName"
    }

    $words = $msg.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)

    if ($words.Count -gt 10) {
        $msg = ($words[0..9] -join " ")
    }

    $hasValidTag = $false
    foreach ($tag in $script:ValidCommitTags) {
        if ($msg.StartsWith($tag)) {
            $hasValidTag = $true
            break
        }
    }

    if (-not $hasValidTag) {
        return "Update: modify $fileName"
    }

    return $msg
}

# --- Build proposed commit per file (AI + normalize) ---
$pendingCommits = New-Object System.Collections.ArrayList

foreach ($file in $allFiles) {

    Write-Host "`nProcessing: $file"

    $diff = git diff $file

    if (-not $diff) {
        try {
            $diff = Get-Content $file -Raw
        } catch {
            if (Test-IsStoppingException $_.Exception) { throw }
            $diff = ""
        }
    }

    if (-not $diff) {
        Write-Host "[WARN] Skipping empty file"
        continue
    }

    $aiResult = Get-CommitMessage $file $diff
    $finalMessage = Get-NormalizedCommitMessage $aiResult.Text $file

    [void]$pendingCommits.Add([PSCustomObject]@{
        FilePath   = $file
        Message    = $finalMessage
        IsFallback = $aiResult.UsedFallback
    })
}

if ($pendingCommits.Count -eq 0) {
    Write-Host "[WARN] No files with content to commit"
    exit
}

# --- Decide whether fallback-only files should be committed ---
$fallbackCommits = @($pendingCommits | Where-Object { $_.IsFallback })
if ($fallbackCommits.Count -gt 0) {
    Write-Host ""
    Write-Host "----- Fallback messages detected -----"
    foreach ($entry in $fallbackCommits) {
        Write-Host (" - {0}" -f $entry.FilePath)
        Write-Host ("   {0}" -f $entry.Message)
    }
    Write-Host "--------------------------------------"
    Write-Host "Press Enter to include fallback messages and commit everything."
    Write-Host "Type anything to commit only AI-generated messages and leave fallback files untouched."
    $fallbackChoice = Read-Host "Fallback choice"

    if (-not [string]::IsNullOrWhiteSpace($fallbackChoice)) {
        $generatedCommits = New-Object System.Collections.ArrayList
        foreach ($entry in $pendingCommits) {
            if (-not $entry.IsFallback) {
                [void]$generatedCommits.Add($entry)
            }
        }

        $pendingCommits = $generatedCommits
        Write-Host "[INFO] Fallback files will be left untouched."

        if ($pendingCommits.Count -eq 0) {
            Write-Host "[WARN] No AI-generated commit messages available to commit"
            exit
        }
    }
}

# --- Review / edit messages (empty Enter = commit) ---
do {
    Write-Host ""
    Write-Host "----- Commit messages (review) -----"
    for ($i = 0; $i -lt $pendingCommits.Count; $i++) {
        $n = $i + 1
        $entry = $pendingCommits[$i]
        $fallbackLabel = ""
        if ($entry.IsFallback) { $fallbackLabel = " [fallback]" }
        Write-Host ("  {0}) {1}{2}" -f $n, $entry.FilePath, $fallbackLabel)
        Write-Host ("     {0}" -f $entry.Message)
    }
    Write-Host "------------------------------------"
    Write-Host "Enter item number to change its message."
    Write-Host "Press Enter to commit all as listed."
    $choice = Read-Host "Choice"

    if ([string]::IsNullOrWhiteSpace($choice)) {
        break
    }

    $parsed = 0
    if (-not [int]::TryParse($choice.Trim(), [ref]$parsed)) {
        Write-Host "[WARN] Enter a valid number or empty Enter."
        continue
    }

    if ($parsed -lt 1 -or $parsed -gt $pendingCommits.Count) {
        Write-Host "[WARN] Number must be between 1 and $($pendingCommits.Count)."
        continue
    }

    $idx = $parsed - 1
    $target = $pendingCommits[$idx]
    Write-Host ("Editing: {0}" -f $target.FilePath)
    $newMsg = Read-Host "New commit message (empty = keep current)"

    if (-not [string]::IsNullOrWhiteSpace($newMsg)) {
        $target.Message = Get-NormalizedCommitMessage $newMsg $target.FilePath
    }
} while ($true)

# --- Stage and commit each file ---
foreach ($entry in $pendingCommits) {
    git add -- $entry.FilePath
    git commit -m "$($entry.Message)" | Out-Null
}

Write-Host "`n[OK] All files committed successfully"
