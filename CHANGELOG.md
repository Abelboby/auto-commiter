# Change Log

## 0.1.10

- Generate release notes and update changelog

## 0.1.3

- Updated default model routing to match the six-model Groq setup with adjusted per-run call limits

## 0.1.2

- Fixed GPT-OSS commit message generation by using hidden low-effort reasoning and a larger completion budget
- Updated default model routing to the current Groq model list used for commit message generation

## 0.1.1

- Added an Activity Bar sidebar with quick actions for running commits, opening settings, setting the API key, and viewing logs
- Added packaging and publish scripts to make future updates easier
- Moved the file review and commit-selection flow into the sidebar itself
- Refined the sidebar UI to feel more like a dedicated tool surface

## 0.1.0

- Initial VS Code extension implementation
- Replaced the PowerShell runtime flow with a cross-device TypeScript extension
- Added secret storage for the Groq API key
- Added model and settings management UI
- Added per-file review before commit
