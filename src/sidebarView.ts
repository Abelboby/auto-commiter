import * as vscode from "vscode";
import { SECRET_KEY } from "./config";
import { CandidateCommit } from "./types";

function getNonce(): string {
  return Math.random().toString(36).slice(2);
}

type SidebarStage = "idle" | "generating" | "review" | "committing" | "done" | "error";

interface SidebarDraftCommit extends CandidateCommit {
  included: boolean;
}

interface SidebarState {
  stage: SidebarStage;
  statusMessage: string;
  apiKeyConfigured: boolean;
  pendingCommits: SidebarDraftCommit[];
}

export class AutoCommiterSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "autoCommiter.sidebar";
  private currentView: vscode.WebviewView | undefined;
  private readonly state: SidebarState = {
    stage: "idle",
    statusMessage: "Ready to scan your repo and prepare commit messages.",
    apiKeyConfigured: false,
    pendingCommits: []
  };
  public onCommitRequested: ((commits: CandidateCommit[]) => Promise<void>) | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.currentView = webviewView;
    webviewView.title = " ";
    webviewView.webview.options = {
      enableScripts: true
    };

    await this.refreshApiKeyState();
    this.render();

    webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const typedMessage = message as { type?: string };
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
        const payload = message as { commits?: CandidateCommit[] };
        if (Array.isArray(payload.commits) && this.onCommitRequested) {
          await this.onCommitRequested(payload.commits);
        }
      }
    });

    webviewView.onDidDispose(() => {
      this.currentView = undefined;
    });
  }

  async refreshApiKeyState(): Promise<void> {
    this.state.apiKeyConfigured = Boolean((await this.context.secrets.get(SECRET_KEY))?.trim());
  }

  setGeneratingState(message: string): void {
    this.state.stage = "generating";
    this.state.statusMessage = message;
    this.state.pendingCommits = [];
    this.render();
  }

  setReviewState(commits: CandidateCommit[], message: string): void {
    this.state.stage = "review";
    this.state.statusMessage = message;
    this.state.pendingCommits = commits.map((commit) => ({
      ...commit,
      included: true
    }));
    this.render();
  }

  setCommittingState(message: string): void {
    this.state.stage = "committing";
    this.state.statusMessage = message;
    this.render();
  }

  setIdleState(message: string): void {
    this.state.stage = "idle";
    this.state.statusMessage = message;
    this.state.pendingCommits = [];
    this.render();
  }

  setDoneState(message: string): void {
    this.state.stage = "done";
    this.state.statusMessage = message;
    this.render();
  }

  setErrorState(message: string): void {
    this.state.stage = "error";
    this.state.statusMessage = message;
    this.render();
  }

  clearPendingCommits(): void {
    this.state.stage = "idle";
    this.state.statusMessage = "Review cleared. Ready for another run.";
    this.state.pendingCommits = [];
    this.render();
  }

  private render(): void {
    if (!this.currentView) {
      return;
    }
    this.currentView.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const nonce = getNonce();
    const canCommit = this.state.pendingCommits.some((commit) => commit.included);
    const selectedCount = this.state.pendingCommits.filter((commit) => commit.included).length;
    const totalCount = this.state.pendingCommits.length;
    const statusTone = this.state.stage === "error"
      ? "error"
      : this.state.stage === "done"
        ? "success"
        : this.state.stage === "generating" || this.state.stage === "committing"
          ? "busy"
          : "ready";
    const statusLabel = (() => {
      if (this.state.stage === "review") {
        return `Ready - ${totalCount} file${totalCount === 1 ? "" : "s"} changed`;
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
      --ac-bg: #131313;
      --ac-top: #1e1e1e;
      --ac-nav: #252526;
      --ac-panel: #202020;
      --ac-card: #252526;
      --ac-card-hover: #313131;
      --ac-input: #3c3c3c;
      --ac-border: #303031;
      --ac-border-strong: #404751;
      --ac-text: #e5e2e1;
      --ac-muted: #c0c7d3;
      --ac-dim: #969696;
      --ac-primary: #007acc;
      --ac-primary-hover: #0062a3;
      --ac-primary-soft: #00497d;
      --ac-good: #10b981;
      --ac-warn: #f59e0b;
      --ac-error: #ffb4ab;
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
    .topBar {
      height: 36px;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 10px;
      border-bottom: 1px solid var(--ac-border);
      background: var(--ac-top);
    }
    .brand {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #cccccc;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .brandIcon {
      color: var(--ac-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 17px;
      height: 17px;
    }
    .iconActions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .iconButton {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--ac-radius-xs);
      background: transparent;
      color: #cccccc;
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
      background: #2a2d2e;
      color: #ffffff;
    }
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      height: 32px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--ac-border);
      background: var(--ac-nav);
    }
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ac-dim);
      font-size: 12px;
      cursor: default;
      transition: background 120ms ease, color 120ms ease;
    }
    .tabActive {
      position: relative;
      background: color-mix(in srgb, #2a2d2e 88%, var(--ac-primary) 12%);
      color: #ffffff;
    }
    .tabActive::after {
      content: "";
      position: absolute;
      left: 28%;
      right: 28%;
      bottom: 0;
      height: 2px;
      border-radius: 999px 999px 0 0;
      background: var(--ac-primary);
    }
    .content {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
      display: grid;
      align-content: start;
      gap: 12px;
    }
    .statusPill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-md);
      background: #1b1b1c;
    }
    .keyDot {
      width: 8px;
      height: 8px;
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
    .statusCard {
      display: grid;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--ac-border);
      border-radius: var(--ac-radius-md);
      background: var(--ac-panel);
    }
    .statusLine {
      display: flex;
      align-items: center;
      gap: 8px;
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
      min-width: 0;
      color: var(--ac-text);
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .statusMessage {
      margin: 0;
      color: var(--ac-dim);
      font-size: 12px;
      line-height: 16px;
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
      color: #ffffff;
    }
    .mainButton:hover {
      background: var(--ac-primary-hover);
    }
    .ghostButton {
      border: 1px solid transparent;
      background: transparent;
      color: #cccccc;
    }
    .ghostButton:hover {
      background: #2a2d2e;
      color: #ffffff;
    }
    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 4px;
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
    .sectionActionIcon {
      color: var(--ac-dim);
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .reviewList {
      display: grid;
      gap: 4px;
    }
    .commitCard {
      display: grid;
      gap: 4px;
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
      display: flex;
      align-items: flex-start;
      gap: 4px;
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
      gap: 7px;
      min-width: 0;
    }
    .filePath {
      min-width: 0;
      color: #9fcaff;
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
      color: #9fcaff;
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
    .cardIcon {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
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
      background: #2a2d2e;
      color: #ffffff;
    }
    .removeButton:hover {
      color: var(--ac-error);
    }
    .messageWrap {
      position: relative;
    }
    .messageInput {
      width: 100%;
      height: 48px;
      resize: none;
      border: 1px solid var(--ac-border-strong);
      border-radius: var(--ac-radius-sm);
      outline: none;
      background: var(--ac-input);
      color: var(--ac-text);
      padding: 4px 22px 4px 6px;
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
      padding: 12px 8px;
      border: 1px dashed var(--ac-border-strong);
      border-radius: var(--ac-radius-md);
      color: var(--ac-dim);
      font-size: 12px;
      line-height: 16px;
      background: rgba(37, 37, 38, 0.55);
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
    <header class="topBar">
      <div class="brand">
        <span class="brandIcon">${iconSvg("terminal")}</span>
        <span>AUTO COMMITER</span>
      </div>
      <div class="iconActions">
        <button class="iconButton" data-action="apiKey" title="API Key" aria-label="API Key">${iconSvg("key")}</button>
        <button class="iconButton" data-action="settings" title="Settings" aria-label="Settings">${iconSvg("settings")}</button>
        <button class="iconButton" data-action="output" title="Output Log" aria-label="Output Log">${iconSvg("list")}</button>
      </div>
    </header>
    <nav class="tabs" aria-label="Auto Commiter sections">
      <div class="tab tabActive">Review</div>
      <div class="tab" title="History is not stored yet">History</div>
    </nav>
    <main class="content">
      <section class="statusPill">
        <span class="keyDot"></span>
        <span class="caps">${this.state.apiKeyConfigured ? "Groq API Key Configured" : "Groq API Key Missing"}</span>
      </section>
      <section class="statusCard">
        <div class="statusLine">
          <span class="statusDot" data-tone="${statusTone}"></span>
          <span class="statusTitle">${escapeHtml(statusLabel)}</span>
        </div>
        <p class="statusMessage">${escapeHtml(this.state.statusMessage)}</p>
        <button class="mainButton" data-action="run" ${this.state.stage === "generating" || this.state.stage === "committing" ? "disabled" : ""}>
          <span>${this.state.stage === "generating" ? iconSvg("loader") : iconSvg("sparkle")}</span>
          <span>${this.state.stage === "generating" ? "Generating Commit Messages" : "Generate Commit Messages"}</span>
        </button>
      </section>
      <section>
        <div class="sectionHeader">
          <div class="sectionTitle">
            <input id="selectAll" class="selectAll" type="checkbox" ${selectedCount > 0 && selectedCount === totalCount ? "checked" : ""} ${totalCount === 0 ? "disabled" : ""} title="Select all" />
            <span class="caps">Review Queue (${totalCount} file${totalCount === 1 ? "" : "s"})</span>
          </div>
          <span class="sectionActionIcon" aria-hidden="true">${iconSvg("chevronDown", "svgIcon svgIconSmall")}</span>
        </div>
        ${
          totalCount === 0
            ? `<p class="emptyState">Generate commit messages and the review queue will appear here. You can edit messages, deselect files, and commit without leaving the sidebar.</p>`
            : `<div class="reviewList" id="reviewList"></div>`
        }
      </section>
    </main>
    <footer class="footer">
      <button class="mainButton" id="commitSelected" ${canCommit ? "" : "disabled"}>
        <span>${iconSvg("check")}</span>
        <span>Commit Selected (${selectedCount}/${totalCount})</span>
      </button>
      <button class="ghostButton" data-action="clear-review" ${totalCount === 0 ? "disabled" : ""}>
        <span>${iconSvg("trash")}</span>
        <span>Clear Review</span>
      </button>
    </footer>
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
                <span class="tag">\${escapeHtml(tag)}</span>
                \${entry.isFallback ? '<span class="tag fallbackTag">Fallback</span>' : ""}
                <span class="changeMark">\${changeMark}</span>
                <button class="cardIcon" data-action="run" title="Regenerate all messages" aria-label="Regenerate all messages">${iconSvg("refresh", "svgIcon svgIconSmall")}</button>
              </div>
              <div class="messageWrap">
                <textarea class="messageInput" data-kind="message" data-index="\${index}">\${escapeHtml(entry.message)}</textarea>
                <span class="editMark">${iconSvg("edit", "svgIcon svgIconSmall")}</span>
              </div>
            </div>
            <button class="cardIcon removeButton" data-kind="remove" data-index="\${index}" title="Remove from review" aria-label="Remove from review">${iconSvg("x", "svgIcon svgIconSmall")}</button>
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
      if (target.dataset.kind === "message") {
        commits[index].message = target.value;
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
      const selected = commits.filter((entry) => entry.included).length;
      const total = commits.length;
      const selectAll = document.getElementById("selectAll");
      const commitButton = document.getElementById("commitSelected");
      if (selectAll) {
        selectAll.checked = total > 0 && selected === total;
        selectAll.indeterminate = selected > 0 && selected < total;
        selectAll.disabled = total === 0;
      }
      if (commitButton) {
        commitButton.disabled = selected === 0;
        const label = commitButton.querySelector("span:last-child");
        if (label) {
          label.textContent = \`Commit Selected (\${selected}/\${total})\`;
        }
      }
    }

    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({ type: button.dataset.action });
      });
    });

    const selectAll = document.getElementById("selectAll");
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        commits.forEach((entry) => {
          entry.included = selectAll.checked;
        });
        renderReview();
        updateSelectedState();
      });
    }

    const commitButton = document.getElementById("commitSelected");
    if (commitButton) {
      commitButton.addEventListener("click", () => {
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

function escapeHtml(value: string): string {
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

function iconSvg(name: string, className = "svgIcon"): string {
  const icons: Record<string, string> = {
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
    x: '<path d="M5 5l10 10"></path><path d="M15 5L5 15"></path>',
    chevronDown: '<path d="M5 7.5l5 5 5-5"></path>'
  };
  return `<svg class="${className}" viewBox="0 0 20 20" aria-hidden="true">${icons[name] ?? icons.list}</svg>`;
}
