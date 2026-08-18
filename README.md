# Auto Commiter

For when your code is good, your git status is dramatic, and your brain can only offer "final final changes v3".

Auto Commiter is the aggressively helpful VS Code extension for devs who ship features at 2 AM and then stare at `git diff` like it owes them money. It scans your changed and untracked files, asks Groq for short commit messages, lets you review the results, and commits from inside the sidebar.

It can create one commit per file or one batch commit for the selected changes. Basically: less "what did I even change?" and more "clean commits, main-character energy".

## Install from GitHub Releases

Pick the one-liner that matches your setup.

### Windows PowerShell

```powershell
curl.exe -L -o auto-commiter.vsix https://github.com/Abelboby/auto-commiter/releases/latest/download/auto-commiter.vsix; if ($LASTEXITCODE -eq 0) { code --install-extension auto-commiter.vsix --force }
```

### macOS or Linux

```bash
curl -L -o auto-commiter.vsix https://github.com/Abelboby/auto-commiter/releases/latest/download/auto-commiter.vsix && code --install-extension auto-commiter.vsix --force
```

### GitHub CLI

```bash
gh release download --repo Abelboby/auto-commiter --pattern auto-commiter.vsix --output auto-commiter.vsix && code --install-extension auto-commiter.vsix --force
```

After installing, reload VS Code if it asks.

## Daily Workflow

1. Make changes in a git repo.
2. Open the Auto Commiter sidebar.
3. Generate commit messages.
4. Edit anything that needs a human touch.
5. Commit selected files in `Single` or `Batch` mode.

Choose your chaos level. Tiny file-by-file commits, or one clean "ship it" batch.

## What it does

- Turns changed files into reviewable Groq-generated commit messages
- Lets you edit, skip, and commit from one VS Code sidebar
- Supports `Single` commits and `Batch` commits
- Stores your API key safely in VS Code Secret Storage

## First-Time Setup

1. Open VS Code.
2. Open the Auto Commiter icon in the Activity Bar.
3. Click the settings icon.
4. Add your Groq API key.
5. Choose `Single` or `Batch`.
6. Generate, review, and commit.

Congrats. Your commit workflow now has fewer side quests.

## Update Behavior

Auto Commiter checks the latest GitHub Release and shows update actions in the sidebar when a newer VSIX is available. The update installer downloads the release asset and installs it through the VS Code CLI, because manually refreshing release pages is not a personality trait.

You can also reinstall manually at any time with one of the commands above.

## Notes

- Generated fallback messages are marked in review so you can decide whether to use them.
- Always review AI-generated commit messages before committing. Future-you is the actual target audience, and future-you has receipts.
