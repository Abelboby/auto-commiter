# Auto Commiter

Auto Commiter is a Visual Studio Code extension that looks at your changed and untracked files, asks Groq for short per-file commit messages, lets you review or edit those messages, and then creates one git commit per file.

It is built for people who want a smoother commit workflow inside VS Code without depending on a local PowerShell script.

## What it does

- Adds an Activity Bar entry so the extension is always easy to reach
- Detects modified and untracked files in the current git repository
- Sends each file diff or file content to Groq
- Tries your configured models in order until one returns a valid commit message
- Lets you review, edit, or skip files before committing
- Stores the Groq API key in VS Code secret storage
- Ships with free-tier-friendly default models from `groq-models.json`
- Lets users edit model limits or add their own models later

## Commands

- `Auto Commiter: Generate and Commit Changes`
- `Auto Commiter: Manage Models and Settings`
- `Auto Commiter: Set Groq API Key`
- `Auto Commiter: Open Output`

## First-time setup

1. Install the extension.
2. Run `Auto Commiter: Manage Models and Settings`.
3. Paste your Groq API key.
4. Review the default models and settings.
5. Save.
6. Open the Auto Commiter icon in the Activity Bar.
7. Open a git repo with changes.
8. Click `Generate And Commit Changes`.

## Review flow

When you run the commit command:

1. The extension finds changed files.
2. It generates a commit message for each file.
3. It opens a review panel.
4. You can edit any message or uncheck any file.
5. Press `Commit Selected`.

## Settings users can control

- Groq API key
- Model list
- Per-model call limits
- Enabled or disabled models
- Commit tag prefixes
- Max diff size
- Max commit words
- Temperature
- Whether fallback commit messages are allowed

## Notes

- The extension commits files one by one, because that is the workflow defined by the original script.
- Fallback messages are marked in the review UI.
- The extension does not use `.env` or PowerShell at runtime.

## Updating the extension later

Use the built-in scripts when you want to ship a new version:

```powershell
npm.cmd run compile
npm.cmd run package:vsix
npm.cmd run publish:patch
```

You can also use `publish:minor` or `publish:major` depending on the type of release.

## Development

```powershell
npm.cmd install
npm.cmd run compile
```

Press `F5` in VS Code to launch the Extension Development Host.
