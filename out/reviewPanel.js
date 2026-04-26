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
exports.openReviewPanel = openReviewPanel;
const vscode = __importStar(require("vscode"));
function getNonce() {
    return Math.random().toString(36).slice(2);
}
async function openReviewPanel(commits) {
    const panel = vscode.window.createWebviewPanel("autoCommiterReview", "Auto Commiter Review", vscode.ViewColumn.One, {
        enableScripts: true
    });
    const nonce = getNonce();
    panel.webview.html = getHtml(commits, nonce);
    return new Promise((resolve) => {
        let settled = false;
        const finalize = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
            panel.dispose();
        };
        panel.onDidDispose(() => finalize(undefined));
        panel.webview.onDidReceiveMessage((message) => {
            if (!message || typeof message !== "object") {
                return;
            }
            const typedMessage = message;
            if (typedMessage.type === "commit" && Array.isArray(typedMessage.commits)) {
                finalize({
                    action: "commit",
                    commits: typedMessage.commits
                });
            }
            if (typedMessage.type === "cancel") {
                finalize(undefined);
            }
        });
    });
}
function getHtml(commits, nonce) {
    const safePayload = JSON.stringify(commits);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Review Commit Messages</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 24px;
    }
    .layout {
      max-width: 1000px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .header {
      display: grid;
      gap: 6px;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px;
      display: grid;
      gap: 12px;
    }
    .row {
      display: grid;
      gap: 8px;
    }
    .topline {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 10px 12px;
    }
    button {
      border: 0;
      border-radius: 6px;
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .pill {
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      border: 1px solid var(--vscode-panel-border);
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="header">
      <h1>Review commit messages</h1>
      <p class="muted">Edit anything you want, uncheck anything you do not want committed, then commit the selected files.</p>
    </div>
    <div id="list"></div>
    <div class="actions">
      <button class="secondary" id="cancelButton">Cancel</button>
      <button class="primary" id="commitButton">Commit Selected</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const commits = ${safePayload}.map((entry) => ({ ...entry, included: true }));
    const list = document.getElementById("list");

    function render() {
      list.innerHTML = "";
      commits.forEach((entry, index) => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = \`
          <div class="topline">
            <label>
              <input type="checkbox" data-kind="included" data-index="\${index}" \${entry.included ? "checked" : ""} />
              <strong>\${escapeHtml(entry.filePath)}</strong>
            </label>
            \${entry.isFallback ? '<span class="pill">fallback</span>' : ""}
          </div>
          <div class="row">
            <input type="text" value="\${escapeAttr(entry.message)}" data-kind="message" data-index="\${index}" />
          </div>
        \`;
        list.appendChild(card);
      });

      list.querySelectorAll("input").forEach((input) => {
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

    function escapeHtml(value) {
      return value.replace(/[&<>"]/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    document.getElementById("commitButton").addEventListener("click", () => {
      const selected = commits
        .filter((entry) => entry.included)
        .map(({ included, ...rest }) => rest);
      vscode.postMessage({ type: "commit", commits: selected });
    });

    document.getElementById("cancelButton").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    render();
  </script>
</body>
</html>`;
}
//# sourceMappingURL=reviewPanel.js.map