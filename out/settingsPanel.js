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
exports.openSettingsPanel = openSettingsPanel;
const vscode = __importStar(require("vscode"));
const defaults_1 = require("./defaults");
const config_1 = require("./config");
function getNonce() {
    return Math.random().toString(36).slice(2);
}
async function openSettingsPanel(context) {
    const panel = vscode.window.createWebviewPanel("autoCommiterSettings", "Auto Commiter Settings", vscode.ViewColumn.One, {
        enableScripts: true
    });
    const render = async () => {
        const nonce = getNonce();
        const settings = (0, config_1.getSettings)();
        const apiKey = (await context.secrets.get(config_1.SECRET_KEY)) ?? "";
        panel.webview.html = getHtml({
            nonce,
            apiKey,
            settings
        });
    };
    await render();
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message !== "object") {
            return;
        }
        const typedMessage = message;
        if (typedMessage.type === "save" && typedMessage.models && typedMessage.settings) {
            await context.secrets.store(config_1.SECRET_KEY, typedMessage.apiKey?.trim() ?? "");
            await (0, config_1.saveModels)(typedMessage.models);
            await (0, config_1.saveSimpleSettings)(typedMessage.settings);
            vscode.window.showInformationMessage("Auto Commiter settings saved.");
            await render();
        }
        if (typedMessage.type === "reset-models") {
            await (0, config_1.saveModels)(defaults_1.DEFAULT_MODELS);
            vscode.window.showInformationMessage("Model list reset to the bundled defaults.");
            await render();
        }
    });
}
function getHtml(input) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${input.nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Commiter Settings</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 24px;
    }
    .layout {
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .section {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px;
      display: grid;
      gap: 14px;
    }
    .row {
      display: grid;
      gap: 8px;
    }
    .grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    input {
      width: 100%;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 10px 12px;
      font: inherit;
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
      justify-content: flex-end;
      gap: 12px;
    }
    .modelCard {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="section">
      <div>
        <h1>Auto Commiter settings</h1>
        <p class="muted">This is the easiest place to set your Groq API key, tune commit rules, and manage the model list users can customize later.</p>
      </div>
      <div class="row">
        <label for="apiKey">Groq API key</label>
        <input id="apiKey" type="password" value="${escapeHtml(input.apiKey)}" placeholder="gsk_..." />
      </div>
      <div class="grid">
        <label class="row">
          <span>Allow fallback commits</span>
          <input id="allowFallbackCommits" type="checkbox" ${input.settings.allowFallbackCommits ? "checked" : ""} />
        </label>
        <label class="row">
          <span>Max diff characters</span>
          <input id="maxDiffCharacters" type="number" value="${input.settings.maxDiffCharacters}" min="500" />
        </label>
        <label class="row">
          <span>Max commit words</span>
          <input id="maxCommitWords" type="number" value="${input.settings.maxCommitWords}" min="3" />
        </label>
        <label class="row">
          <span>Temperature</span>
          <input id="temperature" type="number" value="${input.settings.temperature}" min="0" max="2" step="0.1" />
        </label>
      </div>
      <div class="row">
        <label for="commitTags">Allowed commit tags, comma separated</label>
        <input id="commitTags" type="text" value="${escapeHtml(input.settings.commitTagOptions.join(", "))}" />
      </div>
    </div>

    <div class="section">
      <div>
        <h2>Model routing</h2>
        <p class="muted">These start with your free-tier defaults from the bundled JSON. Users can disable models, change call limits, or add new model IDs.</p>
      </div>
      <div id="models"></div>
      <div class="actions">
        <button class="secondary" id="addModel">Add Model</button>
        <button class="secondary" id="resetModels">Reset To Defaults</button>
      </div>
    </div>

    <div class="actions">
      <button class="primary" id="saveButton">Save Settings</button>
    </div>
  </div>
  <script nonce="${input.nonce}">
    const vscode = acquireVsCodeApi();
    const models = ${JSON.stringify(input.settings.models)};
    const modelContainer = document.getElementById("models");

    function escapeHtml(value) {
      return value.replace(/[&<>"]/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      }[char]));
    }

    function renderModels() {
      modelContainer.innerHTML = "";
      models.forEach((model, index) => {
        const card = document.createElement("div");
        card.className = "modelCard";
        card.innerHTML = \`
          <label class="row">
            <span>Model ID</span>
            <input data-index="\${index}" data-field="id" type="text" value="\${escapeHtml(model.id || "")}" />
          </label>
          <div class="grid">
            <label class="row">
              <span>Enabled</span>
              <input data-index="\${index}" data-field="enabled" type="checkbox" \${model.enabled ? "checked" : ""} />
            </label>
            <label class="row">
              <span>Max calls per run</span>
              <input data-index="\${index}" data-field="maxCallsPerRun" type="number" min="1" value="\${Number(model.maxCallsPerRun || 1)}" />
            </label>
            <label class="row">
              <span>Cost order</span>
              <input data-index="\${index}" data-field="costOrder" type="number" value="\${Number(model.costOrder || 0)}" />
            </label>
            <label class="row">
              <span>Cost tier</span>
              <input data-index="\${index}" data-field="costTier" type="text" value="\${escapeHtml(model.costTier || "")}" />
            </label>
          </div>
          <div class="actions">
            <button class="secondary" data-delete="\${index}">Remove</button>
          </div>
        \`;
        modelContainer.appendChild(card);
      });

      modelContainer.querySelectorAll("input").forEach((node) => {
        node.addEventListener("input", handleModelInput);
        node.addEventListener("change", handleModelInput);
      });
      modelContainer.querySelectorAll("button[data-delete]").forEach((node) => {
        node.addEventListener("click", () => {
          const index = Number(node.dataset.delete);
          models.splice(index, 1);
          renderModels();
        });
      });
    }

    function handleModelInput(event) {
      const target = event.target;
      const index = Number(target.dataset.index);
      const field = target.dataset.field;
      if (field === "enabled") {
        models[index][field] = target.checked;
        return;
      }
      if (field === "maxCallsPerRun" || field === "costOrder") {
        models[index][field] = Number(target.value);
        return;
      }
      models[index][field] = target.value;
    }

    document.getElementById("addModel").addEventListener("click", () => {
      models.push({
        id: "",
        enabled: true,
        maxCallsPerRun: 10,
        costOrder: models.length + 1,
        costTier: ""
      });
      renderModels();
    });

    document.getElementById("resetModels").addEventListener("click", () => {
      vscode.postMessage({ type: "reset-models" });
    });

    document.getElementById("saveButton").addEventListener("click", () => {
      vscode.postMessage({
        type: "save",
        apiKey: document.getElementById("apiKey").value,
        models,
        settings: {
          allowFallbackCommits: document.getElementById("allowFallbackCommits").checked,
          maxDiffCharacters: Number(document.getElementById("maxDiffCharacters").value),
          maxCommitWords: Number(document.getElementById("maxCommitWords").value),
          temperature: Number(document.getElementById("temperature").value),
          commitTagOptions: document.getElementById("commitTags").value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        }
      });
    });

    renderModels();
  </script>
</body>
</html>`;
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
//# sourceMappingURL=settingsPanel.js.map