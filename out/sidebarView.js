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
exports.AutoCommiterSidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
function getNonce() {
    return Math.random().toString(36).slice(2);
}
class AutoCommiterSidebarProvider {
    context;
    outputChannel;
    static viewType = "autoCommiter.sidebar";
    currentView;
    state = {
        stage: "idle",
        statusMessage: "Ready to scan your repo and prepare commit messages.",
        commitMode: (0, config_1.getSettings)().commitMode,
        apiKeyConfigured: false,
        pendingCommits: [],
        batchReview: undefined
    };
    onCommitRequested;
    onBatchCommitRequested;
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    async resolveWebviewView(webviewView) {
        this.currentView = webviewView;
        webviewView.title = "Auto Commiter";
        webviewView.webview.options = {
            enableScripts: true
        };
        await this.refreshApiKeyState();
        this.render();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (!message || typeof message !== "object") {
                return;
            }
            const typedMessage = message;
            if (typedMessage.type === "run") {
                await vscode.commands.executeCommand("autoCommiter.runAutoCommit");
            }
            if (typedMessage.type === "set-mode" && isCommitMode(typedMessage.mode)) {
                this.state.commitMode = typedMessage.mode;
                if (this.state.stage !== "generating" && this.state.stage !== "committing") {
                    const hasDraft = typedMessage.mode === "batch"
                        ? Boolean(this.state.batchReview)
                        : this.state.pendingCommits.length > 0;
                    this.state.stage = hasDraft ? "review" : "idle";
                    this.state.statusMessage = hasDraft
                        ? "Review restored."
                        : "Ready to scan your repo and prepare commit messages.";
                }
                await (0, config_1.saveCommitMode)(typedMessage.mode);
                this.render();
            }
            if (typedMessage.type === "settings") {
                await vscode.commands.executeCommand("autoCommiter.manageSettings");
                await this.refreshApiKeyState();
                this.render();
            }
            if (typedMessage.type === "apiKey") {
                await vscode.commands.executeCommand("autoCommiter.setGroqApiKey");
                await this.refreshApiKeyState();
                this.render();
            }
            if (typedMessage.type === "output") {
                this.outputChannel.show(true);
            }
            if (typedMessage.type === "clear-review") {
                this.clearPendingCommits();
            }
            if (typedMessage.type === "commit") {
                const payload = message;
                if (Array.isArray(payload.commits) && this.onCommitRequested) {
                    await this.onCommitRequested(payload.commits);
                }
            }
            if (typedMessage.type === "commit-batch") {
                const payload = message;
                if (isBatchCommit(payload.commit) && this.onBatchCommitRequested) {
                    await this.onBatchCommitRequested(payload.commit);
                }
            }
        });
        webviewView.onDidDispose(() => {
            this.currentView = undefined;
        });
    }
    async refreshApiKeyState() {
        this.state.apiKeyConfigured = Boolean((await this.context.secrets.get(config_1.SECRET_KEY))?.trim());
        this.state.commitMode = (0, config_1.getSettings)().commitMode;
    }
    setGeneratingState(message) {
        this.state.stage = "generating";
        this.state.statusMessage = message;
        if (this.state.commitMode === "batch") {
            this.state.batchReview = undefined;
        }
        else {
            this.state.pendingCommits = [];
        }
        this.render();
    }
    setReviewState(commits, message) {
        this.state.stage = "review";
        this.state.statusMessage = message;
        this.state.pendingCommits = commits.map((commit) => ({
            ...commit,
            included: true
        }));
        this.render();
    }
    setBatchReviewState(commit, message) {
        this.state.stage = "review";
        this.state.statusMessage = message;
        this.state.batchReview = {
            message: commit.message,
            isFallback: commit.isFallback,
            files: commit.filePaths.map((filePath) => ({
                filePath,
                included: true
            }))
        };
        this.render();
    }
    setCommittingState(message) {
        this.state.stage = "committing";
        this.state.statusMessage = message;
        this.render();
    }
    setIdleState(message) {
        this.state.stage = "idle";
        this.state.statusMessage = message;
        if (this.state.commitMode === "batch") {
            this.state.batchReview = undefined;
        }
        else {
            this.state.pendingCommits = [];
        }
        this.render();
    }
    setDoneState(message) {
        this.state.stage = "done";
        this.state.statusMessage = message;
        if (this.state.commitMode === "batch") {
            this.state.batchReview = undefined;
        }
        else {
            this.state.pendingCommits = [];
        }
        this.render();
    }
    setErrorState(message) {
        this.state.stage = "error";
        this.state.statusMessage = message;
        this.render();
    }
    clearPendingCommits() {
        this.state.stage = "idle";
        this.state.statusMessage = "Review cleared. Ready for another run.";
        if (this.state.commitMode === "batch") {
            this.state.batchReview = undefined;
        }
        else {
            this.state.pendingCommits = [];
        }
        this.render();
    }
    render() {
        if (!this.currentView) {
            return;
        }
        this.currentView.webview.html = this.getHtml();
    }
    getHtml() {
        const nonce = getNonce();
        const isBatchMode = this.state.commitMode === "batch";
        const batchSelectedCount = this.state.batchReview?.files.filter((file) => file.included).length ?? 0;
        const batchTotalCount = this.state.batchReview?.files.length ?? 0;
        const singleSelectedCount = this.state.pendingCommits.filter((commit) => commit.included).length;
        const singleTotalCount = this.state.pendingCommits.length;
        const selectedCount = isBatchMode ? batchSelectedCount : singleSelectedCount;
        const totalCount = isBatchMode ? batchTotalCount : singleTotalCount;
        const canCommit = isBatchMode
            ? batchSelectedCount > 0 && Boolean(this.state.batchReview?.message.trim())
            : this.state.pendingCommits.some((commit) => commit.included);
        const modeDescription = isBatchMode
            ? "Generate one message for all selected files."
            : "Review, edit, and commit selected files.";
        const displayStatusMessage = this.state.stage === "idle" || this.state.stage === "review"
            ? modeDescription
            : this.state.statusMessage;
        const generateButtonText = this.state.stage === "generating"
            ? isBatchMode
                ? "Generating Batch Commit"
                : "Generating Commit Messages"
            : isBatchMode
                ? "Generate Batch Commit"
                : "Generate Commit Messages";
        const commitButtonText = isBatchMode
            ? `Commit Batch (${selectedCount}/${totalCount})`
            : `Commit Selected (${selectedCount}/${totalCount})`;
        const queueTitle = isBatchMode
            ? `Batch Review (${totalCount} file${totalCount === 1 ? "" : "s"})`
            : `Review Queue (${totalCount} file${totalCount === 1 ? "" : "s"})`;
        const statusTone = this.state.stage === "error"
            ? "error"
            : this.state.stage === "done"
                ? "success"
                : this.state.stage === "generating" || this.state.stage === "committing"
                    ? "busy"
                    : "ready";
        const statusLabel = (() => {
            if (this.state.stage === "review") {
                return "Ready";
            }
            if (this.state.stage === "generating") {
                return "Generating commit messages";
            }
            if (this.state.stage === "committing") {
                return `Committing ${selectedCount} selected file${selectedCount === 1 ? "" : "s"}`;
            }
            if (this.state.stage === "done") {
                return "Commit run complete";
            }
            if (this.state.stage === "error") {
                return "Action needed";
            }
            return "Ready to scan repository";
        })();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --ac-bg: var(--vscode-sideBar-background);
      --ac-top: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
      --ac-panel: var(--vscode-sideBar-background);
      --ac-card: var(--vscode-list-inactiveSelectionBackground, var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)));
      --ac-card-hover: var(--vscode-list-hoverBackground, var(--vscode-list-inactiveSelectionBackground));
      --ac-input: var(--vscode-input-background);
      --ac-border: var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
      --ac-border-strong: var(--vscode-input-border, var(--vscode-panel-border));
      --ac-text: var(--vscode-sideBar-foreground, var(--vscode-foreground));
      --ac-muted: var(--vscode-descriptionForeground);
      --ac-dim: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
      --ac-primary: var(--vscode-button-background);
      --ac-primary-hover: var(--vscode-button-hoverBackground);
      --ac-primary-soft: var(--vscode-list-activeSelectionBackground, var(--vscode-button-background));
      --ac-good: var(--vscode-testing-iconPassed, #10b981);
      --ac-warn: var(--vscode-testing-iconQueued, #f59e0b);
      --ac-error: var(--vscode-testing-iconFailed, #ffb4ab);
      --ac-radius-xs: 5px;
      --ac-radius-sm: 7px;
      --ac-radius-md: 10px;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--ac-text);
      background: var(--ac-bg);
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    button, input, textarea {
      font: inherit;
    }
    button {
      border: 0;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    ::-webkit-scrollbar {
      width: 4px;
    }
    ::-webkit-scrollbar-track {
      background: var(--ac-top);
    }
    ::-webkit-scrollbar-thumb {
      background: #3c3c3c;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #4f4f4f;
    }
    .shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100%;
      min-width: 0;
      background: var(--ac-bg);
    }
    .iconButton {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--ac-radius-xs);
      background: transparent;
      color: var(--ac-text);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }
    .svgIcon {
      width: 15px;
      height: 15px;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      flex: 0 0 auto;
    }
    .svgIconSmall {
      width: 13px;
      height: 13px;
    }
    .iconButton:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--ac-card-hover));
      color: var(--ac-text);
    }
    .content {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      padding: 8px;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 8px;
    }
    .keyDot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: ${this.state.apiKeyConfigured ? "var(--ac-good)" : "var(--ac-error)"};
      box-shadow: 0 0 4px ${this.state.apiKeyConfigured ? "rgba(16,185,129,0.5)" : "rgba(255,180,171,0.45)"};
    }
    .caps {
      color: var(--ac-muted);
      font-size: 10px;
      font-weight: 700;
      line-height: 12px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .statusPanel {
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      background: var(--ac-panel);
    }
    .statusLine {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .statusDot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--ac-good);
    }
    .statusDot[data-tone="busy"] {
      background: var(--ac-primary);
      box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.16);
    }
    .statusDot[data-tone="success"] {
      background: var(--ac-good);
    }
    .statusDot[data-tone="error"] {
      background: var(--ac-error);
    }
    .statusTitle {
      flex: 1 1 auto;
      min-width: 0;
      color: var(--ac-text);
      font-size: 12px;
      font-weight: 600;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .keyState {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--ac-muted);
    }
    .statusMessage {
      margin: 0;
      color: var(--ac-dim);
      font-size: 12px;
      line-height: 16px;
    }
    .modeSwitch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-sm);
      background: var(--ac-input);
    }
    .modeButton {
      height: 22px;
      border-radius: var(--ac-radius-xs);
      background: transparent;
      color: var(--ac-muted);
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      line-height: 16px;
      text-transform: uppercase;
    }
    .modeButton:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--ac-card-hover));
      color: var(--ac-text);
    }
    .modeButton[data-active="true"] {
      background: var(--ac-primary);
      color: var(--vscode-button-foreground);
    }
    .mainButton, .ghostButton {
      width: 100%;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border-radius: var(--ac-radius-sm);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .mainButton {
      background: var(--ac-primary);
      color: var(--vscode-button-foreground);
    }
    .mainButton:hover {
      background: var(--ac-primary-hover);
    }
    .ghostButton {
      border: 1px solid transparent;
      background: transparent;
      color: var(--ac-muted);
    }
    .ghostButton:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--ac-card-hover));
      color: var(--ac-text);
    }
    .queueSection {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0 4px;
    }
    .sectionTitle {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .selectAll {
      width: 13px;
      height: 13px;
      margin: 0;
      accent-color: var(--ac-primary);
      cursor: pointer;
    }
    .reviewList {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      display: grid;
      align-content: start;
      gap: 8px;
      padding-right: 2px;
    }
    .commitCard {
      position: relative;
      display: grid;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--ac-border);
      border-left: 2px solid var(--ac-primary-soft);
      border-radius: var(--ac-radius-sm);
      background: var(--ac-card);
      transition: background 120ms ease, opacity 120ms ease;
    }
    .commitCard:hover {
      background: var(--ac-card-hover);
    }
    .commitCard[data-included="false"] {
      opacity: 0.52;
      border-left-color: var(--ac-border-strong);
    }
    .commitTop {
      display: grid;
      grid-template-columns: 13px minmax(0, 1fr);
      align-items: flex-start;
      gap: 5px;
      min-width: 0;
    }
    .fileBody {
      flex: 1 1 auto;
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .fileMeta {
      display: flex;
      align-items: center;
      min-width: 0;
      padding-right: 42px;
    }
    .filePath {
      min-width: 0;
      color: var(--vscode-textLink-foreground);
      font-family: "SF Mono", Consolas, monospace;
      font-size: 12px;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tag {
      flex: 0 0 auto;
      padding: 0 4px;
      border-radius: 2px;
      background: var(--ac-primary-soft);
      color: var(--vscode-textLink-foreground);
      font-size: 9px;
      font-weight: 700;
      line-height: 13px;
      text-transform: uppercase;
    }
    .fallbackTag {
      background: rgba(180, 83, 9, 0.35);
      color: #fde68a;
    }
    .changeMark {
      flex: 0 0 auto;
      color: var(--ac-warn);
      font-size: 10px;
      font-weight: 700;
      opacity: 0.85;
    }
    .badgeRow {
      min-height: 13px;
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;
    }
    .cardActions {
      position: absolute;
      top: 6px;
      right: 6px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .cardIcon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--ac-radius-xs);
      background: transparent;
      color: var(--ac-dim);
      cursor: pointer;
      opacity: 0.45;
      transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
    }
    .commitCard:hover .cardIcon {
      opacity: 1;
    }
    .cardIcon:hover {
      background: var(--vscode-toolbar-hoverBackground, var(--ac-card-hover));
      color: var(--ac-text);
    }
    .removeButton:hover {
      color: var(--ac-error);
    }
    .messageWrap {
      position: relative;
    }
    .messageInput {
      width: 100%;
      height: 38px;
      resize: none;
      border: 1px solid var(--ac-border-strong);
      border-radius: var(--ac-radius-xs);
      outline: none;
      background: var(--ac-input);
      color: var(--vscode-input-foreground);
      padding: 3px 20px 3px 6px;
      font-family: "SF Mono", Consolas, monospace;
      font-size: 12px;
      line-height: 16px;
      cursor: text;
      transition: border-color 120ms ease;
    }
    .messageInput:hover {
      border-color: var(--ac-dim);
    }
    .messageInput:focus {
      border-color: var(--ac-primary);
    }
    .batchPanel {
      display: grid;
      gap: 8px;
    }
    .batchMessageCard {
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--ac-border);
      border-left: 2px solid var(--ac-primary-soft);
      border-radius: var(--ac-radius-sm);
      background: var(--ac-card);
    }
    .batchHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .batchMessageInput {
      width: 100%;
      height: 46px;
      resize: none;
      border: 1px solid var(--ac-border-strong);
      border-radius: var(--ac-radius-xs);
      outline: none;
      background: var(--ac-input);
      color: var(--vscode-input-foreground);
      padding: 4px 20px 4px 6px;
      font-family: "SF Mono", Consolas, monospace;
      font-size: 12px;
      line-height: 16px;
      cursor: text;
      transition: border-color 120ms ease;
    }
    .batchMessageInput:hover {
      border-color: var(--ac-dim);
    }
    .batchMessageInput:focus {
      border-color: var(--ac-primary);
    }
    .batchFiles {
      display: grid;
      gap: 4px;
    }
    .batchFileRow {
      min-width: 0;
      display: grid;
      grid-template-columns: 13px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border: 1px solid transparent;
      border-radius: var(--ac-radius-xs);
      background: transparent;
      color: var(--ac-text);
    }
    .batchFileRow:hover {
      background: var(--ac-card-hover);
    }
    .batchFileRow[data-included="false"] {
      opacity: 0.55;
    }
    .editMark {
      position: absolute;
      top: 5px;
      right: 6px;
      color: var(--ac-dim);
      font-size: 11px;
      opacity: 0.55;
      pointer-events: none;
    }
    .emptyState {
      margin: 0;
      padding: 2px 0;
      color: var(--ac-dim);
      font-size: 12px;
      line-height: 16px;
    }
    .footer {
      flex: 0 0 auto;
      display: grid;
      gap: 4px;
      padding: 8px;
      border-top: 1px solid var(--ac-border);
      background: var(--ac-top);
    }
    @keyframes commitSuccess {
      0% { background: var(--ac-card); }
      30% { background: rgba(16, 185, 129, 0.2); }
      100% { background: var(--ac-card); }
    }
    .committingState {
      animation: commitSuccess 0.6s ease-out forwards;
    }
  </style>
</head>
<body>
  <div class="shell">
    <main class="content">
      <section class="statusPanel">
        <div class="statusLine">
          <span class="statusDot" data-tone="${statusTone}"></span>
          <span class="statusTitle">${escapeHtml(statusLabel)}</span>
          <span class="keyState" title="${this.state.apiKeyConfigured ? "Groq API key configured" : "Groq API key missing"}">
            <span class="keyDot"></span>
            <span class="caps">${this.state.apiKeyConfigured ? "Key Set" : "No Key"}</span>
          </span>
        </div>
        <div class="modeSwitch" role="group" aria-label="Commit mode">
          <button class="modeButton" data-mode="single" data-active="${this.state.commitMode === "single"}" type="button">Single</button>
          <button class="modeButton" data-mode="batch" data-active="${this.state.commitMode === "batch"}" type="button">Batch</button>
        </div>
        <p class="statusMessage">${escapeHtml(displayStatusMessage)}</p>
        <button class="mainButton" data-action="run" ${this.state.stage === "generating" || this.state.stage === "committing" ? "disabled" : ""}>
          <span>${this.state.stage === "generating" ? iconSvg("loader") : iconSvg("sparkle")}</span>
          <span>${generateButtonText}</span>
        </button>
      </section>
      <section class="queueSection">
        <div class="sectionHeader">
          <div class="sectionTitle">
            ${totalCount === 0 ? "" : `<input id="selectAll" class="selectAll" type="checkbox" ${selectedCount > 0 && selectedCount === totalCount ? "checked" : ""} title="Select all" />`}
            <span class="caps" id="queueCount">${queueTitle}</span>
          </div>
        </div>
        ${totalCount === 0
            ? `<p class="emptyState">No files in review yet. Generate messages to start.</p>`
            : `<div class="reviewList" id="reviewList"></div>`}
      </section>
    </main>
    ${totalCount === 0
            ? ""
            : `<footer class="footer" id="footer">
          <button class="mainButton" id="commitSelected" ${canCommit ? "" : "disabled"}>
            <span>${iconSvg("check")}</span>
            <span>${commitButtonText}</span>
          </button>
          <button class="ghostButton" data-action="clear-review">
            <span>${iconSvg("trash")}</span>
            <span>Clear Review</span>
          </button>
        </footer>`}
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const commitMode = ${JSON.stringify(this.state.commitMode)};
    const commits = ${JSON.stringify(this.state.pendingCommits)};
    const batchReview = ${JSON.stringify(this.state.batchReview ?? null)};
    const activeBatchReview = commitMode === "batch" ? batchReview : null;

    function escapeHtml(value) {
      return value.replace(/[&<>"]/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      }[char]));
    }

    function renderReview() {
      const reviewList = document.getElementById("reviewList");
      if (!reviewList) {
        return;
      }

      reviewList.innerHTML = "";
      if (activeBatchReview) {
        renderBatchReview(reviewList);
        return;
      }

      if (commits.length === 0) {
        reviewList.innerHTML = '<p class="emptyState">No files in review. Generate messages to start.</p>';
        return;
      }

      commits.forEach((entry, index) => {
        const rawTag = (entry.message || "").split(":")[0] || "Update";
        const tag = rawTag.slice(0, 12);
        const changeMark = entry.isFallback ? "U" : "M";
        const card = document.createElement("div");
        card.className = "commitCard";
        card.dataset.included = String(entry.included);
        card.innerHTML = \`
          <div class="commitTop">
            <input class="selectAll" type="checkbox" data-kind="included" data-index="\${index}" \${entry.included ? "checked" : ""} />
            <div class="fileBody">
              <div class="fileMeta">
                <span class="filePath" title="\${escapeHtml(entry.filePath)}">\${escapeHtml(entry.filePath)}</span>
              </div>
              <div class="badgeRow">
                <span class="tag">\${escapeHtml(tag)}</span>
                \${entry.isFallback ? '<span class="tag fallbackTag">Fallback</span>' : ""}
                <span class="changeMark">\${changeMark}</span>
              </div>
              <div class="messageWrap">
                <textarea class="messageInput" data-kind="message" data-index="\${index}">\${escapeHtml(entry.message)}</textarea>
                <span class="editMark">${iconSvg("edit", "svgIcon svgIconSmall")}</span>
              </div>
            </div>
            <div class="cardActions">
              <button class="cardIcon" data-action="run" title="Regenerate all messages" aria-label="Regenerate all messages">${iconSvg("refresh", "svgIcon svgIconSmall")}</button>
              <button class="cardIcon removeButton" data-kind="remove" data-index="\${index}" title="Remove from review" aria-label="Remove from review">${iconSvg("x", "svgIcon svgIconSmall")}</button>
            </div>
          </div>
        \`;
        reviewList.appendChild(card);
      });

      reviewList.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", handleInput);
        input.addEventListener("change", handleInput);
      });
      reviewList.querySelectorAll("button[data-kind='remove']").forEach((button) => {
        button.addEventListener("click", handleRemove);
      });
      reviewList.querySelectorAll("button[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
          vscode.postMessage({ type: button.dataset.action });
        });
      });
    }

    function renderBatchReview(reviewList) {
      const selected = activeBatchReview.files.filter((entry) => entry.included).length;
      reviewList.innerHTML = \`
        <div class="batchPanel">
          <section class="batchMessageCard">
            <div class="batchHead">
              <span class="caps">Batch Commit Message</span>
              \${activeBatchReview.isFallback ? '<span class="tag fallbackTag">Fallback</span>' : ""}
            </div>
            <div class="messageWrap">
              <textarea class="batchMessageInput" id="batchMessage" data-kind="batch-message">\${escapeHtml(activeBatchReview.message)}</textarea>
              <span class="editMark">${iconSvg("edit", "svgIcon svgIconSmall")}</span>
            </div>
          </section>
          <section class="batchFiles">
            <div class="sectionHeader">
              <div class="sectionTitle">
                <span class="caps" id="batchFilesCount">Files Included (\${selected}/\${activeBatchReview.files.length})</span>
              </div>
            </div>
            <div id="batchFileList"></div>
          </section>
        </div>
      \`;

      const batchFileList = document.getElementById("batchFileList");
      if (!batchFileList) {
        return;
      }

      activeBatchReview.files.forEach((entry, index) => {
        const row = document.createElement("label");
        row.className = "batchFileRow";
        row.dataset.included = String(entry.included);
        row.innerHTML = \`
          <input class="selectAll" type="checkbox" data-kind="batch-included" data-index="\${index}" \${entry.included ? "checked" : ""} />
          <span class="filePath" title="\${escapeHtml(entry.filePath)}">\${escapeHtml(entry.filePath)}</span>
        \`;
        batchFileList.appendChild(row);
      });

      reviewList.querySelectorAll("input, textarea").forEach((input) => {
        input.addEventListener("input", handleInput);
        input.addEventListener("change", handleInput);
      });
    }

    function handleInput(event) {
      const target = event.target;
      const index = Number(target.dataset.index);
      if (target.dataset.kind === "included") {
        commits[index].included = target.checked;
        const card = target.closest(".commitCard");
        if (card) {
          card.dataset.included = String(target.checked);
        }
        updateSelectedState();
      }
      if (target.dataset.kind === "batch-included" && activeBatchReview) {
        activeBatchReview.files[index].included = target.checked;
        const row = target.closest(".batchFileRow");
        if (row) {
          row.dataset.included = String(target.checked);
        }
        updateSelectedState();
      }
      if (target.dataset.kind === "message") {
        commits[index].message = target.value;
      }
      if (target.dataset.kind === "batch-message" && activeBatchReview) {
        activeBatchReview.message = target.value;
        updateSelectedState();
      }
    }

    function handleRemove(event) {
      const target = event.currentTarget;
      const index = Number(target.dataset.index);
      commits.splice(index, 1);
      renderReview();
      updateSelectedState();
    }

    function updateSelectedState() {
      const selected = activeBatchReview
        ? activeBatchReview.files.filter((entry) => entry.included).length
        : commits.filter((entry) => entry.included).length;
      const total = activeBatchReview ? activeBatchReview.files.length : commits.length;
      const selectAll = document.getElementById("selectAll");
      const commitButton = document.getElementById("commitSelected");
      const footer = document.getElementById("footer");
      const queueCount = document.getElementById("queueCount");
      const batchFilesCount = document.getElementById("batchFilesCount");
      if (selectAll) {
        selectAll.checked = total > 0 && selected === total;
        selectAll.indeterminate = selected > 0 && selected < total;
        selectAll.disabled = total === 0;
      }
      if (queueCount) {
        queueCount.textContent = activeBatchReview
          ? \`Batch Review (\${total} file\${total === 1 ? "" : "s"})\`
          : \`Review Queue (\${total} file\${total === 1 ? "" : "s"})\`;
      }
      if (batchFilesCount && activeBatchReview) {
        batchFilesCount.textContent = \`Files Included (\${selected}/\${total})\`;
      }
      if (footer) {
        footer.hidden = total === 0;
      }
      if (commitButton) {
        commitButton.disabled = selected === 0 || (activeBatchReview && !activeBatchReview.message.trim());
        const label = commitButton.querySelector("span:last-child");
        if (label) {
          label.textContent = activeBatchReview
            ? \`Commit Batch (\${selected}/\${total})\`
            : \`Commit Selected (\${selected}/\${total})\`;
        }
      }
    }

    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({ type: button.dataset.action });
      });
    });

    document.querySelectorAll("button[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({ type: "set-mode", mode: button.dataset.mode });
      });
    });

    const selectAll = document.getElementById("selectAll");
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        if (activeBatchReview) {
          activeBatchReview.files.forEach((entry) => {
            entry.included = selectAll.checked;
          });
        } else {
          commits.forEach((entry) => {
            entry.included = selectAll.checked;
          });
        }
        renderReview();
        updateSelectedState();
      });
    }

    const commitButton = document.getElementById("commitSelected");
    if (commitButton) {
      commitButton.addEventListener("click", () => {
        if (activeBatchReview) {
          vscode.postMessage({
            type: "commit-batch",
            commit: {
              filePaths: activeBatchReview.files
                .filter((entry) => entry.included)
                .map((entry) => entry.filePath),
              message: activeBatchReview.message,
              isFallback: activeBatchReview.isFallback
            }
          });
          return;
        }

        document.querySelectorAll(".commitCard[data-included='true']").forEach((card) => {
          card.classList.add("committingState");
        });
        vscode.postMessage({
          type: "commit",
          commits: commits
            .filter((entry) => entry.included)
            .map(({ included, ...rest }) => rest)
        });
      });
    }

    renderReview();
    updateSelectedState();
  </script>
</body>
</html>`;
    }
}
exports.AutoCommiterSidebarProvider = AutoCommiterSidebarProvider;
function isCommitMode(value) {
    return value === "single" || value === "batch";
}
function isBatchCommit(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return Array.isArray(candidate.filePaths)
        && candidate.filePaths.every((filePath) => typeof filePath === "string")
        && typeof candidate.message === "string"
        && typeof candidate.isFallback === "boolean";
}
function escapeHtml(value) {
    return value.replace(/[&<>"]/g, (char) => {
        switch (char) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return char;
        }
    });
}
function iconSvg(name, className = "svgIcon") {
    const icons = {
        terminal: '<polyline points="4 6 8 10 4 14"></polyline><line x1="10" y1="14" x2="16" y2="14"></line>',
        key: '<circle cx="7" cy="10" r="3"></circle><path d="M10 10h7"></path><path d="M14 10v3"></path><path d="M17 10v2"></path>',
        settings: '<path d="M9.7 2h.6l.5 2.1c.5.1.9.3 1.3.5l1.8-1.1.5.5-1.1 1.8c.2.4.4.8.5 1.3l2.1.5v.8l-2.1.5c-.1.5-.3.9-.5 1.3l1.1 1.8-.5.5-1.8-1.1c-.4.2-.8.4-1.3.5l-.5 2.1h-.6l-.5-2.1c-.5-.1-.9-.3-1.3-.5l-1.8 1.1-.5-.5 1.1-1.8c-.2-.4-.4-.8-.5-1.3L4.1 10v-.8l2.1-.5c.1-.5.3-.9.5-1.3L5.6 5.6l.5-.5 1.8 1.1c.4-.2.8-.4 1.3-.5L9.7 2z"></path><circle cx="10" cy="10" r="2.8"></circle>',
        list: '<line x1="7" y1="6" x2="17" y2="6"></line><line x1="7" y1="10" x2="17" y2="10"></line><line x1="7" y1="14" x2="17" y2="14"></line><circle cx="3.5" cy="6" r="0.5"></circle><circle cx="3.5" cy="10" r="0.5"></circle><circle cx="3.5" cy="14" r="0.5"></circle>',
        sparkle: '<path d="M10 2l1.6 5.2L17 9l-5.4 1.8L10 16l-1.6-5.2L3 9l5.4-1.8L10 2z"></path>',
        loader: '<path d="M10 3a7 7 0 0 1 7 7"></path><path d="M10 17a7 7 0 0 1-7-7"></path>',
        check: '<path d="M4 10.5l4 4L16 6"></path>',
        trash: '<path d="M4 6h12"></path><path d="M8 6V4h4v2"></path><path d="M6 6l1 11h6l1-11"></path><path d="M9 9v5"></path><path d="M11 9v5"></path>',
        refresh: '<path d="M16 7a6 6 0 1 0 1.4 6"></path><path d="M16 3v4h-4"></path>',
        edit: '<path d="M4 14.5V17h2.5L15 8.5 12.5 6 4 14.5z"></path><path d="M11.5 7l2.5 2.5"></path>',
        x: '<path d="M5 5l10 10"></path><path d="M15 5L5 15"></path>'
    };
    return `<svg class="${className}" viewBox="0 0 20 20" aria-hidden="true">${icons[name] ?? icons.list}</svg>`;
}
//# sourceMappingURL=sidebarView.js.map