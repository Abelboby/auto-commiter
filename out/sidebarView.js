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
        apiKeyConfigured: false,
        pendingCommits: []
    };
    onCommitRequested;
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    async resolveWebviewView(webviewView) {
        this.currentView = webviewView;
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
        });
        webviewView.onDidDispose(() => {
            this.currentView = undefined;
        });
    }
    async refreshApiKeyState() {
        this.state.apiKeyConfigured = Boolean((await this.context.secrets.get(config_1.SECRET_KEY))?.trim());
    }
    setGeneratingState(message) {
        this.state.stage = "generating";
        this.state.statusMessage = message;
        this.state.pendingCommits = [];
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
    setCommittingState(message) {
        this.state.stage = "committing";
        this.state.statusMessage = message;
        this.render();
    }
    setIdleState(message) {
        this.state.stage = "idle";
        this.state.statusMessage = message;
        this.state.pendingCommits = [];
        this.render();
    }
    setDoneState(message) {
        this.state.stage = "done";
        this.state.statusMessage = message;
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
        this.state.pendingCommits = [];
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
        const canCommit = this.state.pendingCommits.some((commit) => commit.included);
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0;
      padding: 14px;
    }
    .stack {
      display: grid;
      gap: 14px;
    }
    .panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 14px;
      display: grid;
      gap: 12px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-editor-inactiveSelectionBackground) 12%);
    }
    h2, p {
      margin: 0;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: ${this.state.apiKeyConfigured ? "var(--vscode-testing-iconPassed)" : "var(--vscode-testing-iconFailed)"};
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      font: inherit;
      text-align: left;
      transition: filter 120ms ease, transform 120ms ease;
    }
    button:hover {
      filter: brightness(1.05);
    }
    button:active {
      transform: translateY(1px);
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .tiny {
      font-size: 12px;
    }
    .hero {
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-button-background) 42%, transparent) 0, transparent 42%),
        linear-gradient(160deg, color-mix(in srgb, var(--vscode-button-background) 18%, var(--vscode-sideBar-background) 82%), var(--vscode-sideBar-background));
    }
    .heroTitle {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .chipRow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: color-mix(in srgb, var(--vscode-sideBar-background) 75%, var(--vscode-editor-inactiveSelectionBackground) 25%);
    }
    .actions {
      display: grid;
      gap: 10px;
    }
    .splitActions {
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
    }
    .reviewHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .badge {
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
    }
    .reviewList {
      display: grid;
      gap: 10px;
      max-height: 420px;
      overflow-y: auto;
      padding-right: 2px;
    }
    .commitCard {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 10px;
      display: grid;
      gap: 8px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 78%, var(--vscode-editor-inactiveSelectionBackground) 22%);
    }
    .commitTop {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
    }
    .pathLabel {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      line-height: 1.35;
      word-break: break-word;
    }
    .pathText {
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    .checkbox {
      margin-top: 2px;
    }
    .messageInput {
      width: 100%;
      box-sizing: border-box;
      border-radius: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 9px 10px;
      font: inherit;
    }
    .statusPanel {
      border-left: 3px solid var(--vscode-button-background);
      padding-left: 10px;
    }
    .emptyState {
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div class="stack">
    <div class="panel hero">
      <div class="chipRow">
        <span class="chip">Groq powered</span>
        <span class="chip">Per-file commits</span>
        <span class="chip">Sidebar workflow</span>
      </div>
      <div class="heroTitle">Auto Commiter</div>
      <p class="muted">Generate, review, edit, and commit from one compact workspace instead of bouncing between prompts.</p>
      <div class="status">
        <span class="dot"></span>
        <span>${this.state.apiKeyConfigured ? "Groq API key configured" : "Groq API key not configured"}</span>
      </div>
    </div>
    <div class="panel">
      <div class="statusPanel">
        <div class="badge">${this.state.stage.toUpperCase()}</div>
        <p class="muted">${escapeHtml(this.state.statusMessage)}</p>
      </div>
      <div class="actions">
        <button class="primary" data-action="run">${this.state.stage === "generating" ? "Generating Commit Messages..." : "Generate Commit Messages"}</button>
        <div class="splitActions">
          <button class="secondary" data-action="settings">Settings</button>
          <button class="secondary" data-action="apiKey">API Key</button>
        </div>
        <button class="secondary" data-action="output">Open Output Log</button>
      </div>
    </div>
    <div class="panel">
      <div class="reviewHeader">
        <h2>Review Queue</h2>
        <span class="badge">${this.state.pendingCommits.length} file(s)</span>
      </div>
      ${this.state.pendingCommits.length === 0
            ? `<p class="emptyState">Generate commit messages and the full review step will appear here. You can edit message text, deselect files, and commit the chosen ones without leaving the sidebar.</p>`
            : `<div class="reviewList" id="reviewList"></div>
             <div class="splitActions">
               <button class="secondary" data-action="clear-review">Clear Review</button>
               <button class="primary" id="commitSelected" ${canCommit ? "" : "disabled"}>Commit Selected</button>
             </div>`}
    </div>
    <div class="panel tiny">
      <p class="muted">Future updates are already wired in: bump the version, rebuild the VSIX, then publish with the package scripts whenever you are ready.</p>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const commits = ${JSON.stringify(this.state.pendingCommits)};

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
      commits.forEach((entry, index) => {
        const card = document.createElement("div");
        card.className = "commitCard";
        card.innerHTML = \`
          <div class="commitTop">
            <label class="pathLabel">
              <input class="checkbox" type="checkbox" data-kind="included" data-index="\${index}" \${entry.included ? "checked" : ""} />
              <span class="pathText">\${escapeHtml(entry.filePath)}</span>
            </label>
            \${entry.isFallback ? '<span class="badge">fallback</span>' : ""}
          </div>
          <input class="messageInput" type="text" data-kind="message" data-index="\${index}" value="\${escapeHtml(entry.message)}" />
        \`;
        reviewList.appendChild(card);
      });

      reviewList.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", handleInput);
        input.addEventListener("change", handleInput);
      });
    }

    function handleInput(event) {
      const target = event.target;
      const index = Number(target.dataset.index);
      if (target.dataset.kind === "included") {
        commits[index].included = target.checked;
      }
      if (target.dataset.kind === "message") {
        commits[index].message = target.value;
      }
    }

    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({ type: button.dataset.action });
      });
    });

    const commitButton = document.getElementById("commitSelected");
    if (commitButton) {
      commitButton.addEventListener("click", () => {
        vscode.postMessage({
          type: "commit",
          commits: commits
            .filter((entry) => entry.included)
            .map(({ included, ...rest }) => rest)
        });
      });
    }

    renderReview();
  </script>
</body>
</html>`;
    }
}
exports.AutoCommiterSidebarProvider = AutoCommiterSidebarProvider;
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
//# sourceMappingURL=sidebarView.js.map