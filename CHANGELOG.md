# Change Log

## 0.1.10

- Added release workflow automation to write generated release notes into `CHANGELOG.md`
- Added a changelog update script that normalizes GitHub release notes into plain bullet entries

## 0.1.9

- Added fast mode to the PR helper for quicker pull request creation
- Added a final confirmation prompt before creating a pull request

## 0.1.8

- Refreshed the README with clearer installation and usage instructions

## 0.1.7

- Released maintenance updates without user-facing feature changes

## 0.1.6

- Fixed Windows update installation by resolving the correct command for CLI execution
- Added a PowerShell PR helper for creating GitHub pull requests from branch commits

## 0.1.5

- Added update checking and install flow inside the settings panel
- Added commit mode configuration and settings persistence
- Refreshed sidebar and settings state after key, config, and settings changes
- Updated packaging output handling and install instructions for GitHub Releases

## 0.1.4

- Added GitHub Actions workflow support for building and publishing VSIX releases
- Added in-extension update checking and installation commands
- Added batch commit mode and sidebar integration for committing selected files together
- Updated Groq request handling for OSS models and refreshed default model routing
- Simplified the sidebar UI and adjusted spacing

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
