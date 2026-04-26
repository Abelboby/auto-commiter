import * as vscode from "vscode";
import { SECRET_KEY } from "./config";

function getNonce(): string {
  return Math.random().toString(36).slice(2);
}

export class AutoCommiterSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "autoCommiter.sidebar";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    webviewView.webview.options = {
      enableScripts: true
    };

    const render = async () => {
      const apiKeyConfigured = Boolean((await this.context.secrets.get(SECRET_KEY))?.trim());
      webviewView.webview.html = this.getHtml(apiKeyConfigured);
    };

    await render();

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
        await render();
      }
      if (typedMessage.type === "apiKey") {
        await vscode.commands.executeCommand("autoCommiter.setGroqApiKey");
        await render();
      }
      if (typedMessage.type === "output") {
        this.outputChannel.show(true);
      }
    });
  }

  private getHtml(apiKeyConfigured: boolean): string {
    const nonce = getNonce();
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
      gap: 12px;
    }
    .panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 10px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 90%, var(--vscode-editor-inactiveSelectionBackground) 10%);
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
      background: ${apiKeyConfigured ? "var(--vscode-testing-iconPassed)" : "var(--vscode-testing-iconFailed)"};
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 6px;
      padding: 10px 12px;
      cursor: pointer;
      font: inherit;
      text-align: left;
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
  </style>
</head>
<body>
  <div class="stack">
    <div class="panel">
      <h2>Auto Commiter</h2>
      <p class="muted">Run commits, manage models, and keep the whole workflow one click away from the Activity Bar.</p>
      <div class="status">
        <span class="dot"></span>
        <span>${apiKeyConfigured ? "Groq API key configured" : "Groq API key not configured"}</span>
      </div>
    </div>
    <div class="panel">
      <button class="primary" data-action="run">Generate And Commit Changes</button>
      <button class="secondary" data-action="settings">Manage Models And Settings</button>
      <button class="secondary" data-action="apiKey">Set Groq API Key</button>
      <button class="secondary" data-action="output">Open Output Log</button>
    </div>
    <div class="panel tiny">
      <p class="muted">Future updates are simple: bump the version and rebuild the VSIX. The package scripts now include dedicated release commands for patch, minor, and major updates.</p>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({ type: button.dataset.action });
      });
    });
  </script>
</body>
</html>`;
  }
}
