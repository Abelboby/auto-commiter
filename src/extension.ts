import * as vscode from "vscode";
import { getSettings, SECRET_KEY } from "./config";
import { collectChanges, commitFile, commitFiles, getRepositoryRoot, getWorkspaceRoot } from "./git";
import { generateBatchCommitMessage, generateCommitMessage } from "./groq";
import { AutoCommiterSidebarProvider } from "./sidebarView";
import { openSettingsPanel } from "./settingsPanel";
import { BatchCommit, CandidateCommit } from "./types";

const OUTPUT_CHANNEL = vscode.window.createOutputChannel("Auto Commiter");

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(OUTPUT_CHANNEL);
  const sidebarProvider = new AutoCommiterSidebarProvider(context, OUTPUT_CHANNEL);
  sidebarProvider.onCommitRequested = async (commits) => {
    await commitFromSidebar(context, sidebarProvider, commits);
  };
  sidebarProvider.onBatchCommitRequested = async (commit) => {
    await commitBatchFromSidebar(context, sidebarProvider, commit);
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AutoCommiterSidebarProvider.viewType,
      sidebarProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("autoCommiter.setGroqApiKey", async () => {
      const value = await vscode.window.showInputBox({
        prompt: "Enter your Groq API key",
        password: true,
        ignoreFocusOut: true,
        placeHolder: "gsk_..."
      });

      if (typeof value !== "string" || value.trim().length === 0) {
        vscode.window.showWarningMessage("Groq API key was not changed.");
        return;
      }

      await context.secrets.store(SECRET_KEY, value.trim());
      vscode.window.showInformationMessage("Groq API key saved in VS Code secret storage.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("autoCommiter.manageSettings", async () => {
      await openSettingsPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("autoCommiter.openOutput", async () => {
      OUTPUT_CHANNEL.show(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("autoCommiter.runAutoCommit", async () => {
      await runAutoCommit(context, sidebarProvider);
    })
  );
}

async function runAutoCommit(
  context: vscode.ExtensionContext,
  sidebarProvider: AutoCommiterSidebarProvider
): Promise<void> {
  try {
    OUTPUT_CHANNEL.clear();
    OUTPUT_CHANNEL.show(true);
    await sidebarProvider.refreshApiKeyState();

    const apiKey = await ensureApiKey(context);
    if (!apiKey) {
      sidebarProvider.setErrorState("Add a Groq API key before generating commit messages.");
      return;
    }

    const settings = getSettings();
    if (settings.commitMode === "batch") {
      await runBatchAutoCommit(apiKey, sidebarProvider);
      return;
    }

    const workspaceRoot = await getWorkspaceRoot();
    const repoRoot = await getRepositoryRoot(workspaceRoot);
    OUTPUT_CHANNEL.appendLine(`Repository root: ${repoRoot}`);
    sidebarProvider.setGeneratingState("Scanning the repository and generating commit suggestions.");

    const changes = await collectChanges(repoRoot, settings.maxDiffCharacters);
    if (changes.length === 0) {
      sidebarProvider.setIdleState("No changed or untracked files were found in this repository.");
      vscode.window.showInformationMessage("No changed or untracked files found.");
      return;
    }

    const commits: CandidateCommit[] = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Auto Commiter is generating commit messages",
        cancellable: false
      },
      async (progress) => {
        for (let index = 0; index < changes.length; index += 1) {
          const change = changes[index];
          progress.report({
            increment: 100 / changes.length,
            message: change.filePath
          });

          const result = await generateCommitMessage({
            apiKey,
            filePath: change.filePath,
            promptContent: change.promptContent,
            settings: {
              models: settings.models,
              validTags: settings.commitTagOptions,
              maxWords: settings.maxCommitWords,
              temperature: settings.temperature
            }
          });

          result.auditTrail.forEach((entry) => OUTPUT_CHANNEL.appendLine(`[${change.filePath}] ${entry}`));

          commits.push({
            filePath: change.filePath,
            message: result.text,
            isFallback: result.isFallback
          });
        }
      }
    );

    const fallbackCount = commits.filter((item) => item.isFallback).length;
    if (fallbackCount > 0 && !settings.allowFallbackCommits) {
      const filtered = commits.filter((item) => !item.isFallback);
      if (filtered.length === 0) {
        sidebarProvider.setErrorState("All generated messages were fallbacks, and fallback commits are disabled.");
        vscode.window.showWarningMessage("All generated messages were fallback messages and fallback commits are disabled.");
        return;
      }
      commits.length = 0;
      commits.push(...filtered);
    }

    sidebarProvider.setReviewState(
      commits,
      "Review the generated messages below. You can edit any text, deselect files, and commit from this sidebar."
    );
    vscode.window.showInformationMessage("Commit messages are ready. Review and commit them from the Auto Commiter sidebar.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    OUTPUT_CHANNEL.appendLine(message);
    sidebarProvider.setErrorState(message);
    vscode.window.showErrorMessage(`Auto Commiter failed: ${message}`);
  }
}

async function runBatchAutoCommit(
  apiKey: string,
  sidebarProvider: AutoCommiterSidebarProvider
): Promise<void> {
  const settings = getSettings();
  const workspaceRoot = await getWorkspaceRoot();
  const repoRoot = await getRepositoryRoot(workspaceRoot);
  OUTPUT_CHANNEL.appendLine(`Repository root: ${repoRoot}`);
  sidebarProvider.setGeneratingState("Generating one commit message for the full changeset.");

  const changes = await collectChanges(repoRoot, settings.maxDiffCharacters);
  if (changes.length === 0) {
    sidebarProvider.setIdleState("No changed or untracked files were found in this repository.");
    vscode.window.showInformationMessage("No changed or untracked files found.");
    return;
  }

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Auto Commiter is generating a batch commit message",
      cancellable: false
    },
    async () => generateBatchCommitMessage({
      apiKey,
      changes,
      settings: {
        models: settings.models,
        validTags: settings.commitTagOptions,
        maxWords: settings.maxCommitWords,
        temperature: settings.temperature
      }
    })
  );

  result.auditTrail.forEach((entry) => OUTPUT_CHANNEL.appendLine(`[batch] ${entry}`));

  if (result.isFallback && !settings.allowFallbackCommits) {
    sidebarProvider.setErrorState("The generated batch message was a fallback, and fallback commits are disabled.");
    vscode.window.showWarningMessage("The generated batch message was a fallback and fallback commits are disabled.");
    return;
  }

  sidebarProvider.setBatchReviewState(
    {
      filePaths: changes.map((change) => change.filePath),
      message: result.text,
      isFallback: result.isFallback
    },
    "Review the batch message and selected files before committing."
  );
  vscode.window.showInformationMessage("Batch commit message is ready. Review and commit it from the Auto Commiter sidebar.");
}

async function commitFromSidebar(
  context: vscode.ExtensionContext,
  sidebarProvider: AutoCommiterSidebarProvider,
  commits: CandidateCommit[]
): Promise<void> {
  try {
    if (commits.length === 0) {
      vscode.window.showWarningMessage("No files were selected for commit.");
      return;
    }

    const workspaceRoot = await getWorkspaceRoot();
    const repoRoot = await getRepositoryRoot(workspaceRoot);
    sidebarProvider.setCommittingState("Creating commits for the selected files.");

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Auto Commiter is creating commits",
        cancellable: false
      },
      async (progress) => {
        for (let index = 0; index < commits.length; index += 1) {
          const commit = commits[index];
          progress.report({
            increment: 100 / commits.length,
            message: commit.filePath
          });
          OUTPUT_CHANNEL.appendLine(`Committing ${commit.filePath} with message: ${commit.message}`);
          await commitFile(repoRoot, commit.filePath, commit.message);
        }
      }
    );

    sidebarProvider.setDoneState(`Committed ${commits.length} file(s) successfully. You can run another pass whenever you are ready.`);
    vscode.window.showInformationMessage(`Committed ${commits.length} file(s) successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    OUTPUT_CHANNEL.appendLine(message);
    sidebarProvider.setErrorState(message);
    vscode.window.showErrorMessage(`Auto Commiter failed: ${message}`);
  }
}

async function commitBatchFromSidebar(
  context: vscode.ExtensionContext,
  sidebarProvider: AutoCommiterSidebarProvider,
  commit: BatchCommit
): Promise<void> {
  try {
    if (commit.filePaths.length === 0) {
      vscode.window.showWarningMessage("No files were selected for the batch commit.");
      return;
    }

    const message = commit.message.trim();
    if (!message) {
      vscode.window.showWarningMessage("Enter a batch commit message before committing.");
      return;
    }

    const workspaceRoot = await getWorkspaceRoot();
    const repoRoot = await getRepositoryRoot(workspaceRoot);
    sidebarProvider.setCommittingState(`Creating one commit for ${commit.filePaths.length} selected file(s).`);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Auto Commiter is creating a batch commit",
        cancellable: false
      },
      async (progress) => {
        progress.report({
          increment: 50,
          message: `${commit.filePaths.length} file(s)`
        });
        OUTPUT_CHANNEL.appendLine(`Batch committing ${commit.filePaths.length} file(s) with message: ${message}`);
        commit.filePaths.forEach((filePath) => OUTPUT_CHANNEL.appendLine(`- ${filePath}`));
        await commitFiles(repoRoot, commit.filePaths, message);
        progress.report({ increment: 50 });
      }
    );

    sidebarProvider.setDoneState(`Committed ${commit.filePaths.length} file(s) in one batch commit. You can run another pass whenever you are ready.`);
    vscode.window.showInformationMessage(`Committed ${commit.filePaths.length} file(s) in one batch commit.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    OUTPUT_CHANNEL.appendLine(message);
    sidebarProvider.setErrorState(message);
    vscode.window.showErrorMessage(`Auto Commiter failed: ${message}`);
  }
}

async function ensureApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const existing = await context.secrets.get(SECRET_KEY);
  if (existing?.trim()) {
    return existing.trim();
  }

  const answer = await vscode.window.showInformationMessage(
    "Auto Commiter needs a Groq API key before it can generate commit messages.",
    "Set API Key",
    "Open Settings"
  );

  if (answer === "Set API Key") {
    await vscode.commands.executeCommand("autoCommiter.setGroqApiKey");
  }

  if (answer === "Open Settings") {
    await openSettingsPanel(context);
  }

  return (await context.secrets.get(SECRET_KEY))?.trim();
}

export function deactivate(): void {}
