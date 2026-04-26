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
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    async resolveWebviewView(webviewView) {
        webviewView.webview.options = {
            enableScripts: true
        };
        const render = async () => {
            const apiKeyConfigured = Boolean((await this.context.secrets.get(config_1.SECRET_KEY))?.trim());
            webviewView.webview.html = this.getHtml(apiKeyConfigured);
        };
        await render();
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
    getHtml(apiKeyConfigured) {
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
exports.AutoCommiterSidebarProvider = AutoCommiterSidebarProvider;
//# sourceMappingURL=sidebarView.js.map