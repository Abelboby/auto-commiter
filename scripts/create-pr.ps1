param(
    [string]$Base = "main",
    [switch]$DryRun,
    [switch]$SkipChecks,
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Title)

    Write-Host ""
    Write-Host "===================================================="
    Write-Host "  $Title"
    Write-Host "===================================================="
}

function Test-CommandExists {
    param([string]$Command)

    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Invoke-Checked {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Write-Host "> $Command $($Arguments -join ' ')"
    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command exited with code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

function Invoke-Capture {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [switch]$AllowFailure
    )

    Push-Location $WorkingDirectory
    try {
        $output = & $Command @Arguments 2>&1
        $code = $LASTEXITCODE
        if ($code -ne 0 -and -not $AllowFailure) {
            $text = ($output | Out-String).Trim()
            throw "$Command $($Arguments -join ' ') failed with code $code. $text"
        }
        return [pscustomobject]@{
            ExitCode = $code
            Text = (($output | Out-String).Trim())
        }
    } finally {
        Pop-Location
    }
}

function Read-YesNo {
    param(
        [string]$Question,
        [bool]$DefaultYes = $true
    )

    $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
    $answer = (Read-Host "$Question $suffix").Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $DefaultYes
    }
    if ($answer -eq "y" -or $answer -eq "yes") {
        return $true
    }
    if ($answer -eq "n" -or $answer -eq "no") {
        return $false
    }
    return $DefaultYes
}

function Read-WithDefault {
    param(
        [string]$Label,
        [string]$DefaultValue
    )

    $answer = Read-Host "$Label [$DefaultValue]"
    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $DefaultValue
    }
    return $answer.Trim()
}

function Get-GithubRepo {
    param([string]$RemoteUrl)

    $value = $RemoteUrl.Trim()
    if ($value -match "^git@github\.com:(?<owner>[^/]+)/(?<repo>.+?)(\.git)?$") {
        return "$($Matches.owner)/$($Matches.repo -replace '\.git$', '')"
    }
    if ($value -match "^https://github\.com/(?<owner>[^/]+)/(?<repo>.+?)(\.git)?$") {
        return "$($Matches.owner)/$($Matches.repo -replace '\.git$', '')"
    }
    throw "Could not parse GitHub owner/repo from origin remote: $RemoteUrl"
}

function Resolve-BaseRef {
    param(
        [string]$ProjectRoot,
        [string]$BaseBranch
    )

    foreach ($candidate in @($BaseBranch, "origin/$BaseBranch")) {
        $check = Invoke-Capture git @("rev-parse", "--verify", "$candidate^{commit}") $ProjectRoot -AllowFailure
        if ($check.ExitCode -eq 0) {
            return $candidate
        }
    }

    $fetch = Invoke-Capture git @("fetch", "origin", $BaseBranch) $ProjectRoot -AllowFailure
    if ($fetch.ExitCode -eq 0) {
        $check = Invoke-Capture git @("rev-parse", "--verify", "origin/$BaseBranch^{commit}") $ProjectRoot -AllowFailure
        if ($check.ExitCode -eq 0) {
            return "origin/$BaseBranch"
        }
    }

    throw "Could not resolve base branch '$BaseBranch'."
}

function Get-NonEmptyLines {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }
    return @($Text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-FallbackTitle {
    param(
        [string[]]$CommitSubjects,
        [string]$BranchName
    )

    if ($CommitSubjects.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($CommitSubjects[0])) {
        $title = $CommitSubjects[0].Trim()
    } else {
        $title = "Update " + (($BranchName -replace "[-_/]", " ").Trim())
    }

    if ($title.Length -gt 80) {
        return $title.Substring(0, 77).TrimEnd() + "..."
    }
    return $title
}

function New-PrBody {
    param([string[]]$CommitSubjects)

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("## Description")

    if ($CommitSubjects.Count -eq 0) {
        $lines.Add("- Update branch work.")
    } else {
        foreach ($subject in ($CommitSubjects | Select-Object -First 8)) {
            $clean = $subject.Trim()
            $clean = $clean -replace "^\s*[-*]\s+", ""
            if ([string]::IsNullOrWhiteSpace($clean)) {
                $clean = "Update branch work."
            }
            $lines.Add("- $clean")
        }
    }

    $lines.Add("")
    $lines.Add("## Review Checklist")
    $lines.Add("- [ ] Confirm the branch scope matches the intended change.")
    $lines.Add("- [ ] Confirm the extension compiles with npm.cmd run compile.")
    $lines.Add("- [ ] Review packaging or update behavior if this affects releases.")

    return ($lines -join [Environment]::NewLine)
}

function Edit-TextFile {
    param([string]$Path)

    $editor = $env:VISUAL
    if ([string]::IsNullOrWhiteSpace($editor)) {
        $editor = $env:EDITOR
    }
    if ([string]::IsNullOrWhiteSpace($editor)) {
        $editor = if ($IsWindows -or $env:OS -eq "Windows_NT") { "notepad.exe" } else { "nano" }
    }

    Write-Host "Opening editor: $editor"
    if ($editor -match "\s") {
        $parts = $editor -split "\s+"
        $exe = $parts[0]
        $args = @($parts | Select-Object -Skip 1) + @($Path)
        & $exe @args
    } else {
        & $editor $Path
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Editor exited with code $LASTEXITCODE."
    }
}

function Get-NpmCommand {
    if (($IsWindows -or $env:OS -eq "Windows_NT") -and (Test-CommandExists "npm.cmd")) {
        return "npm.cmd"
    }
    return "npm"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

if (-not (Test-Path (Join-Path $projectRoot ".git"))) {
    throw "Expected to find .git at project root: $projectRoot"
}

foreach ($requiredCommand in @("git", "gh")) {
    if (-not (Test-CommandExists $requiredCommand)) {
        throw "Required command '$requiredCommand' was not found on PATH."
    }
}

$currentBranch = (Invoke-Capture git @("branch", "--show-current") $projectRoot).Text
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    throw "Could not detect current branch."
}
if ($currentBranch -eq "main") {
    Write-Host "You are on main, so the PR helper will exit now."
    exit 0
}

$remoteUrl = (Invoke-Capture git @("remote", "get-url", "origin") $projectRoot).Text
$repo = Get-GithubRepo $remoteUrl

Write-Section "PR helper"
Write-Host "Current branch: $currentBranch"
Write-Host "Repo:          $repo"
Write-Host "===================================================="

Invoke-Checked gh @("auth", "status", "-h", "github.com") $projectRoot

if (-not (Read-YesNo "Use '$currentBranch' as the PR source branch?" $true)) {
    Write-Host "Aborted by user."
    exit 0
}

$baseBranch = Read-WithDefault "Base branch" $Base
if ([string]::IsNullOrWhiteSpace($baseBranch)) {
    throw "Base branch cannot be empty."
}

$baseRef = Resolve-BaseRef $projectRoot $baseBranch
$mergeBase = (Invoke-Capture git @("merge-base", $baseRef, "HEAD") $projectRoot).Text
$headSha = (Invoke-Capture git @("rev-parse", "HEAD") $projectRoot).Text
$commitSubjects = Get-NonEmptyLines (Invoke-Capture git @("log", "--reverse", "--no-merges", "--pretty=format:%s", "$mergeBase..HEAD") $projectRoot).Text
$changedFiles = Get-NonEmptyLines (Invoke-Capture git @("diff", "--name-only", "$mergeBase..HEAD") $projectRoot).Text
$diffStat = (Invoke-Capture git @("diff", "--stat", "$mergeBase..HEAD") $projectRoot).Text

Write-Section "Git range"
Write-Host "Source branch: $currentBranch"
Write-Host "Base branch:   $baseBranch"
Write-Host "Base ref:      $baseRef"
Write-Host "Merge base:    $mergeBase"
Write-Host "HEAD:          $headSha"
Write-Host "Commit count:  $($commitSubjects.Count)"
Write-Host "===================================================="

if ($commitSubjects.Count -eq 0) {
    Write-Host "No commits found in the selected range. Nothing to create a PR from."
    exit 0
}

$title = Get-FallbackTitle $commitSubjects $currentBranch
$body = New-PrBody $commitSubjects

Write-Section "Generated preview"
Write-Host "Title: $title"
Write-Host "Source: $currentBranch"
Write-Host "Base:   $baseBranch"
Write-Host "Commits: $($commitSubjects.Count)"
Write-Host ""
Write-Host $body
Write-Host ""
Write-Host "Changed files:"
foreach ($file in $changedFiles) {
    Write-Host "- $file"
}
if (-not [string]::IsNullOrWhiteSpace($diffStat)) {
    Write-Host ""
    Write-Host $diffStat
}
Write-Host "===================================================="

$title = Read-WithDefault "PR title" $title

$tempDir = New-Item -ItemType Directory -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "auto_commiter_pr_$([guid]::NewGuid())")) -Force
$bodyFile = Join-Path $tempDir.FullName "pr_body.md"
Set-Content -Path $bodyFile -Value $body -Encoding UTF8
if (Read-YesNo "Edit PR body now?" $true) {
    Edit-TextFile $bodyFile
    $body = (Get-Content -Path $bodyFile -Raw).TrimEnd()
    if ([string]::IsNullOrWhiteSpace($body)) {
        $body = New-PrBody $commitSubjects
    }
}

Write-Section "Final PR content"
Write-Host "Title: $title"
Write-Host "Source: $currentBranch"
Write-Host "Base:   $baseBranch"
Write-Host "Commits: $($commitSubjects.Count)"
Write-Host ""
Write-Host $body
Write-Host "===================================================="
Write-Host "Assignee: @me"
Write-Host "===================================================="

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run complete. No PR was created."
    exit 0
}

if (-not $SkipChecks) {
    Write-Section "PR checks"
    $npmCommand = Get-NpmCommand
    Invoke-Checked $npmCommand @("run", "compile") $projectRoot
}

if (-not $SkipPush) {
    $upstream = Invoke-Capture git @("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") $projectRoot -AllowFailure
    if ($upstream.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($upstream.Text)) {
        Write-Host ""
        Write-Host "The branch does not appear to have an upstream tracking branch."
        if (-not (Read-YesNo "Push '$currentBranch' to origin now?" $true)) {
            Write-Host "Aborted by user."
            exit 0
        }
        Invoke-Checked git @("push", "-u", "origin", $currentBranch) $projectRoot
    }
}

if (-not (Read-YesNo "Create the PR now?" $true)) {
    Write-Host "Aborted by user."
    exit 0
}

Set-Content -Path $bodyFile -Value $body -Encoding UTF8
$ghArgs = @(
    "pr",
    "create",
    "--base",
    $baseBranch,
    "--head",
    $currentBranch,
    "--title",
    $title,
    "--body-file",
    $bodyFile,
    "--assignee",
    "@me"
)

Write-Host ""
Write-Host "Creating PR..."
Invoke-Checked gh $ghArgs $projectRoot
