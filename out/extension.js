"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const git_1 = require("./git");
const groq_1 = require("./groq");
const sidebarView_1 = require("./sidebarView");
const settingsPanel_1 = require("./settingsPanel");
const updater_1 = require("./updater");
const OUTPUT_CHANNEL = vscode.window.createOutputChannel("Auto Commiter");
function activate(context) {
    context.subscriptions.push(OUTPUT_CHANNEL);
    const sidebarProvider = new sidebarView_1.AutoCommiterSidebarProvider(context, OUTPUT_CHANNEL);
    sidebarProvider.onCommitRequested = async (commits) => {
        await commitFromSidebar(context, sidebarProvider, commits);
    };
    sidebarProvider.onBatchCommitRequested = async (commit) => {
        await commitBatchFromSidebar(context, sidebarProvider, commit);
    };
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarView_1.AutoCommiterSidebarProvider.viewType, sidebarProvider));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.setGroqApiKey", async () => {
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
        await context.secrets.store(config_1.SECRET_KEY, value.trim());
        await sidebarProvider.refreshSettingsState();
        vscode.window.showInformationMessage("Groq API key saved in VS Code secret storage.");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.manageSettings", async () => {
        await (0, settingsPanel_1.openSettingsPanel)(context, OUTPUT_CHANNEL, async () => {
            await sidebarProvider.refreshSettingsState();
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.openOutput", async () => {
        OUTPUT_CHANNEL.show(true);
    }));
    let latestUpdate;
    const performUpdateCheck = async (showResult) => {
        sidebarProvider.setUpdateChecking();
        latestUpdate = await (0, updater_1.checkForUpdate)(context);
        sidebarProvider.setUpdateState(latestUpdate);
        OUTPUT_CHANNEL.appendLine(`Update check: ${latestUpdate.message}`);
        if (showResult) {
            if (latestUpdate.status === "available") {
                vscode.window.showInformationMessage(latestUpdate.message);
            }
            else if (latestUpdate.status === "current") {
                vscode.window.showInformationMessage(latestUpdate.message);
            }
            else if (latestUpdate.status === "error") {
                vscode.window.showWarningMessage(`Auto Commiter update check failed: ${latestUpdate.message}`);
            }
        }
        return latestUpdate;
    };
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.checkForUpdates", async () => {
        await performUpdateCheck(true);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.installUpdate", async () => {
        const update = latestUpdate?.status === "available"
            ? latestUpdate
            : await performUpdateCheck(false);
        if (update.status !== "available") {
            vscode.window.showInformationMessage(update.message);
            return;
        }
        try {
            sidebarProvider.setUpdateInstalling(update);
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Installing Auto Commiter update",
                cancellable: false
            }, async () => {
                await (0, updater_1.installUpdate)(context, update, OUTPUT_CHANNEL);
            });
            const reload = await vscode.window.showInformationMessage(`Auto Commiter v${update.latestVersion} was installed. Reload VS Code to use it.`, "Reload Window");
            if (reload === "Reload Window") {
                await vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            OUTPUT_CHANNEL.appendLine(`Update install failed: ${message}`);
            sidebarProvider.setUpdateState({
                ...update,
                status: "error",
                message
            });
            vscode.window.showErrorMessage(`Auto Commiter update failed: ${message}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.runAutoCommit", async () => {
        await runAutoCommit(context, sidebarProvider);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("autoCommiter.commitMode")) {
            void sidebarProvider.refreshSettingsState();
        }
    }));
    void performUpdateCheck(false);
}
async function runAutoCommit(context, sidebarProvider) {
    try {
        OUTPUT_CHANNEL.clear();
        OUTPUT_CHANNEL.show(true);
        await sidebarProvider.refreshApiKeyState();
        const apiKey = await ensureApiKey(context);
        if (!apiKey) {
            sidebarProvider.setErrorState("Add a Groq API key before generating commit messages.");
            return;
        }
        const settings = (0, config_1.getSettings)();
        if (settings.commitMode === "batch") {
            await runBatchAutoCommit(apiKey, sidebarProvider);
            return;
        }
        const workspaceRoot = await (0, git_1.getWorkspaceRoot)();
        const repoRoot = await (0, git_1.getRepositoryRoot)(workspaceRoot);
        OUTPUT_CHANNEL.appendLine(`Repository root: ${repoRoot}`);
        sidebarProvider.setGeneratingState("Scanning the repository and generating commit suggestions.");
        const changes = await (0, git_1.collectChanges)(repoRoot, settings.maxDiffCharacters);
        if (changes.length === 0) {
            sidebarProvider.setIdleState("No changed or untracked files were found in this repository.");
            vscode.window.showInformationMessage("No changed or untracked files found.");
            return;
        }
        const commits = [];
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Auto Commiter is generating commit messages",
            cancellable: false
        }, async (progress) => {
            for (let index = 0; index < changes.length; index += 1) {
                const change = changes[index];
                progress.report({
                    increment: 100 / changes.length,
                    message: change.filePath
                });
                const result = await (0, groq_1.generateCommitMessage)({
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
        });
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
        sidebarProvider.setReviewState(commits, "Review the generated messages below. You can edit any text, deselect files, and commit from this sidebar.");
        vscode.window.showInformationMessage("Commit messages are ready. Review and commit them from the Auto Commiter sidebar.");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        OUTPUT_CHANNEL.appendLine(message);
        sidebarProvider.setErrorState(message);
        vscode.window.showErrorMessage(`Auto Commiter failed: ${message}`);
    }
}
async function runBatchAutoCommit(apiKey, sidebarProvider) {
    const settings = (0, config_1.getSettings)();
    const workspaceRoot = await (0, git_1.getWorkspaceRoot)();
    const repoRoot = await (0, git_1.getRepositoryRoot)(workspaceRoot);
    OUTPUT_CHANNEL.appendLine(`Repository root: ${repoRoot}`);
    sidebarProvider.setGeneratingState("Generating one commit message for the full changeset.");
    const changes = await (0, git_1.collectChanges)(repoRoot, settings.maxDiffCharacters);
    if (changes.length === 0) {
        sidebarProvider.setIdleState("No changed or untracked files were found in this repository.");
        vscode.window.showInformationMessage("No changed or untracked files found.");
        return;
    }
    const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Auto Commiter is generating a batch commit message",
        cancellable: false
    }, async () => (0, groq_1.generateBatchCommitMessage)({
        apiKey,
        changes,
        settings: {
            models: settings.models,
            validTags: settings.commitTagOptions,
            maxWords: settings.maxCommitWords,
            temperature: settings.temperature
        }
    }));
    result.auditTrail.forEach((entry) => OUTPUT_CHANNEL.appendLine(`[batch] ${entry}`));
    if (result.isFallback && !settings.allowFallbackCommits) {
        sidebarProvider.setErrorState("The generated batch message was a fallback, and fallback commits are disabled.");
        vscode.window.showWarningMessage("The generated batch message was a fallback and fallback commits are disabled.");
        return;
    }
    sidebarProvider.setBatchReviewState({
        filePaths: changes.map((change) => change.filePath),
        message: result.text,
        isFallback: result.isFallback
    }, "Review the batch message and selected files before committing.");
    vscode.window.showInformationMessage("Batch commit message is ready. Review and commit it from the Auto Commiter sidebar.");
}
async function commitFromSidebar(context, sidebarProvider, commits) {
    try {
        if (commits.length === 0) {
            vscode.window.showWarningMessage("No files were selected for commit.");
            return;
        }
        const workspaceRoot = await (0, git_1.getWorkspaceRoot)();
        const repoRoot = await (0, git_1.getRepositoryRoot)(workspaceRoot);
        sidebarProvider.setCommittingState("Creating commits for the selected files.");
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Auto Commiter is creating commits",
            cancellable: false
        }, async (progress) => {
            for (let index = 0; index < commits.length; index += 1) {
                const commit = commits[index];
                progress.report({
                    increment: 100 / commits.length,
                    message: commit.filePath
                });
                OUTPUT_CHANNEL.appendLine(`Committing ${commit.filePath} with message: ${commit.message}`);
                await (0, git_1.commitFile)(repoRoot, commit.filePath, commit.message);
            }
        });
        sidebarProvider.setDoneState(`Committed ${commits.length} file(s) successfully. You can run another pass whenever you are ready.`);
        vscode.window.showInformationMessage(`Committed ${commits.length} file(s) successfully.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        OUTPUT_CHANNEL.appendLine(message);
        sidebarProvider.setErrorState(message);
        vscode.window.showErrorMessage(`Auto Commiter failed: ${message}`);
    }
}
async function commitBatchFromSidebar(context, sidebarProvider, commit) {
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
        const workspaceRoot = await (0, git_1.getWorkspaceRoot)();
        const repoRoot = await (0, git_1.getRepositoryRoot)(workspaceRoot);
        sidebarProvider.setCommittingState(`Creating one commit for ${commit.filePaths.length} selected file(s).`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Auto Commiter is creating a batch commit",
            cancellable: false
        }, async (progress) => {
            progress.report({
                increment: 50,
                message: `${commit.filePaths.length} file(s)`
            });
            OUTPUT_CHANNEL.appendLine(`Batch committing ${commit.filePaths.length} file(s) with message: ${message}`);
            commit.filePaths.forEach((filePath) => OUTPUT_CHANNEL.appendLine(`- ${filePath}`));
            await (0, git_1.commitFiles)(repoRoot, commit.filePaths, message);
            progress.report({ increment: 50 });
        });
        sidebarProvider.setDoneState(`Committed ${commit.filePaths.length} file(s) in one batch commit. You can run another pass whenever you are ready.`);
        vscode.window.showInformationMessage(`Committed ${commit.filePaths.length} file(s) in one batch commit.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        OUTPUT_CHANNEL.appendLine(message);
        sidebarProvider.setErrorState(message);
        vscode.window.showErrorMessage(`Auto Commiter failed: ${message}`);
    }
}
async function ensureApiKey(context) {
    const existing = await context.secrets.get(config_1.SECRET_KEY);
    if (existing?.trim()) {
        return existing.trim();
    }
    const answer = await vscode.window.showInformationMessage("Auto Commiter needs a Groq API key before it can generate commit messages.", "Set API Key", "Open Settings");
    if (answer === "Set API Key") {
        await vscode.commands.executeCommand("autoCommiter.setGroqApiKey");
    }
    if (answer === "Open Settings") {
        await (0, settingsPanel_1.openSettingsPanel)(context, OUTPUT_CHANNEL);
    }
    return (await context.secrets.get(config_1.SECRET_KEY))?.trim();
}
function deactivate() { }
//# sourceMappingURL=extension.js.map