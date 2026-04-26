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
const reviewPanel_1 = require("./reviewPanel");
const settingsPanel_1 = require("./settingsPanel");
const OUTPUT_CHANNEL = vscode.window.createOutputChannel("Auto Commiter");
function activate(context) {
    context.subscriptions.push(OUTPUT_CHANNEL);
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
        vscode.window.showInformationMessage("Groq API key saved in VS Code secret storage.");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.manageSettings", async () => {
        await (0, settingsPanel_1.openSettingsPanel)(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("autoCommiter.runAutoCommit", async () => {
        await runAutoCommit(context);
    }));
}
async function runAutoCommit(context) {
    try {
        OUTPUT_CHANNEL.clear();
        OUTPUT_CHANNEL.show(true);
        const apiKey = await ensureApiKey(context);
        if (!apiKey) {
            return;
        }
        const settings = (0, config_1.getSettings)();
        const workspaceRoot = await (0, git_1.getWorkspaceRoot)();
        const repoRoot = await (0, git_1.getRepositoryRoot)(workspaceRoot);
        OUTPUT_CHANNEL.appendLine(`Repository root: ${repoRoot}`);
        const changes = await (0, git_1.collectChanges)(repoRoot, settings.maxDiffCharacters);
        if (changes.length === 0) {
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
                vscode.window.showWarningMessage("All generated messages were fallback messages and fallback commits are disabled.");
                return;
            }
            commits.length = 0;
            commits.push(...filtered);
        }
        const review = await (0, reviewPanel_1.openReviewPanel)(commits);
        if (!review || review.commits.length === 0) {
            vscode.window.showWarningMessage("No files were selected for commit.");
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Auto Commiter is creating commits",
            cancellable: false
        }, async (progress) => {
            for (let index = 0; index < review.commits.length; index += 1) {
                const commit = review.commits[index];
                progress.report({
                    increment: 100 / review.commits.length,
                    message: commit.filePath
                });
                OUTPUT_CHANNEL.appendLine(`Committing ${commit.filePath} with message: ${commit.message}`);
                await (0, git_1.commitFile)(repoRoot, commit.filePath, commit.message);
            }
        });
        vscode.window.showInformationMessage(`Committed ${review.commits.length} file(s) successfully.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        OUTPUT_CHANNEL.appendLine(message);
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
        await (0, settingsPanel_1.openSettingsPanel)(context);
    }
    return (await context.secrets.get(config_1.SECRET_KEY))?.trim();
}
function deactivate() { }
//# sourceMappingURL=extension.js.map