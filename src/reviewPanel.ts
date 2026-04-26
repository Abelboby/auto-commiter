import * as vscode from "vscode";
import { CandidateCommit } from "./types";

interface ReviewDecision {
  action: "commit";
  commits: CandidateCommit[];
}

function getNonce(): string {
  return Math.random().toString(36).slice(2);
}

export async function openReviewPanel(commits: CandidateCommit[]): Promise<ReviewDecision | undefined> {
  const panel = vscode.window.createWebviewPanel(
    "autoCommiterReview",
    "Auto Commiter Review",
    vscode.ViewColumn.One,
    {
      enableScripts: true
    }
  );

  const nonce = getNonce();
  panel.webview.html = getHtml(commits, nonce);

  return new Promise<ReviewDecision | undefined>((resolve) => {
    let settled = false;

    const finalize = (value: ReviewDecision | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
      panel.dispose();
    };

    panel.onDidDispose(() => finalize(undefined));

    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const typedMessage = message as { type?: string; commits?: CandidateCommit[] };
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

function getHtml(commits: CandidateCommit[], nonce: string): string {
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
