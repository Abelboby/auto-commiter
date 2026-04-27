import * as vscode from "vscode";
import * as https from "https";
import { DEFAULT_MODELS } from "./defaults";
import { getSettings, saveModels, saveSimpleSettings, SECRET_KEY } from "./config";
import { ConfiguredModel } from "./types";

function getNonce(): string {
  return Math.random().toString(36).slice(2);
}

export async function openSettingsPanel(context: vscode.ExtensionContext): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "autoCommiterSettings",
    "Auto Commiter Settings",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media", "codicons")]
    }
  );

  const render = async () => {
    const nonce = getNonce();
    const settings = getSettings();
    const apiKey = (await context.secrets.get(SECRET_KEY)) ?? "";
    const codiconCssUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "codicons", "codicon.css")
    );
    panel.webview.html = getHtml({
      nonce,
      apiKey,
      settings,
      codiconCssUri: codiconCssUri.toString(),
      cspSource: panel.webview.cspSource
    });
  };

  await render();

  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!message || typeof message !== "object") {
      return;
    }

    const typedMessage = message as {
      type?: string;
      apiKey?: string;
      models?: ConfiguredModel[];
      settings?: {
        allowFallbackCommits: boolean;
        maxDiffCharacters: number;
        maxCommitWords: number;
        temperature: number;
        commitTagOptions: string[];
      };
    };

    if (typedMessage.type === "verify-api-key") {
      const result = await verifyGroqApiKey(typedMessage.apiKey?.trim() ?? "");
      await panel.webview.postMessage({ type: "api-key-verified", ...result });
      return;
    }

    if (typedMessage.type === "save" && typedMessage.models && typedMessage.settings) {
      await context.secrets.store(SECRET_KEY, typedMessage.apiKey?.trim() ?? "");
      await saveModels(typedMessage.models);
      await saveSimpleSettings(typedMessage.settings);
      vscode.window.showInformationMessage("Auto Commiter settings saved.");
      await render();
    }

    if (typedMessage.type === "reset-models") {
      await saveModels(DEFAULT_MODELS);
      vscode.window.showInformationMessage("Model list reset to the bundled defaults.");
      await render();
    }
  });
}

async function verifyGroqApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey) {
    return { ok: false, message: "Enter a Groq API key first." };
  }

  return new Promise((resolve) => {
    const request = https.request(
      "https://api.groq.com/openai/v1/models",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        },
        timeout: 8000
      },
      (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ ok: true, message: "Key verified" });
          return;
        }

        if (response.statusCode === 401 || response.statusCode === 403) {
          resolve({ ok: false, message: "Groq rejected this key." });
          return;
        }

        resolve({ ok: false, message: `Groq returned HTTP ${response.statusCode ?? "unknown"}.` });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, message: "Verification timed out." });
    });
    request.on("error", (error) => {
      resolve({ ok: false, message: error.message || "Verification failed." });
    });
    request.end();
  });
}

function getHtml(input: {
  nonce: string;
  apiKey: string;
  settings: ReturnType<typeof getSettings>;
  codiconCssUri: string;
  cspSource: string;
}): string {
  return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${input.cspSource} 'unsafe-inline'; font-src ${input.cspSource}; script-src 'nonce-${input.nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auto Commiter Settings</title>
  <link href="${input.codiconCssUri}" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --primary: var(--vscode-button-background);
      --primary-hover: var(--vscode-button-hoverBackground);
      --disabled-background: var(--vscode-button-secondaryBackground);
      --disabled-foreground: var(--vscode-disabledForeground);
      --on-primary: var(--vscode-button-foreground);
      --secondary-foreground: var(--vscode-button-secondaryForeground);
      --surface: var(--vscode-editor-background);
      --surface-variant: var(--vscode-list-hoverBackground);
      --input: var(--vscode-input-background);
      --control: var(--vscode-button-secondaryBackground);
      --control-hover: var(--vscode-button-secondaryHoverBackground);
      --outline: var(--vscode-panel-border);
      --on-surface: var(--vscode-foreground);
      --on-muted: var(--vscode-descriptionForeground);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-terminal-ansiGreen);
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-pill: 999px;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--on-surface);
      background: var(--surface);
      margin: 0;
      min-width: 560px;
      -webkit-font-smoothing: antialiased;
    }
    body::-webkit-scrollbar {
      width: 10px;
    }
    body::-webkit-scrollbar-track {
      background: var(--surface);
    }
    body::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
    }
    body::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }
    .topbar {
      align-items: center;
      background: var(--surface);
      border-bottom: 1px solid var(--outline);
      display: flex;
      height: 35px;
      justify-content: space-between;
      left: 0;
      padding: 0 16px;
      position: fixed;
      right: 0;
      top: 0;
      z-index: 10;
    }
    .title {
      color: var(--on-surface);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0;
      white-space: nowrap;
    }
    .top-actions {
      align-items: center;
      display: flex;
      gap: 8px;
      min-width: 0;
    }
    .layout {
      max-width: 896px;
      margin: 0 auto;
      padding: 35px 32px 64px;
    }
    .section {
      border-bottom: 1px solid var(--outline);
      display: grid;
      gap: 16px;
      padding: 24px 0;
    }
    h2 {
      color: var(--on-muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      line-height: 12px;
      margin: 0;
      text-transform: uppercase;
    }
    .row {
      display: grid;
      gap: 8px;
    }
    .inline {
      align-items: center;
      display: flex;
      gap: 8px;
    }
    .field-line {
      display: flex;
      gap: 8px;
    }
    .field-line .input-wrap {
      flex: 1;
    }
    .grid {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    label {
      color: var(--on-surface);
      font-size: 12px;
      line-height: 16px;
    }
    .vs-input,
    input[type="text"],
    input[type="password"],
    input[type="number"] {
      background: var(--input);
      border: 1px solid transparent;
      color: var(--on-surface);
      font: inherit;
      font-size: 13px;
      height: 28px;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      transition: border-color 0.15s ease, background-color 0.15s ease, outline-color 0.15s ease;
      width: 100%;
    }
    input:focus {
      border-color: transparent;
      outline: 1px solid var(--primary);
      outline-offset: 1px;
    }
    input[type="range"] {
      accent-color: var(--primary);
      cursor: pointer;
      width: 100%;
    }
    button {
      background: var(--control);
      border: 0;
      border-radius: var(--radius-sm);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 13px;
      height: 28px;
      padding: 0 12px;
      transition: background-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
    }
    button:hover {
      background: var(--control-hover);
    }
    button:active {
      transform: translateY(1px);
    }
    button:disabled {
      background: var(--disabled-background);
      color: var(--disabled-foreground);
      cursor: not-allowed;
    }
    .primary {
      background: var(--primary);
      color: var(--on-primary);
    }
    .primary:hover {
      background: var(--primary-hover);
    }
    .danger {
      color: var(--danger);
    }
    .action-button {
      background: var(--primary);
      color: var(--on-primary);
      font-weight: 600;
    }
    .action-button:hover {
      background: var(--primary-hover);
    }
    .reset-button {
      background: var(--control);
      color: var(--secondary-foreground);
      font-weight: 600;
    }
    .reset-button:hover {
      background: var(--control-hover);
      color: var(--secondary-foreground);
      text-decoration: none;
    }
    .reset-button.danger {
      background: color-mix(in srgb, var(--danger) 16%, var(--control));
      color: var(--danger);
    }
    .reset-button.danger:hover {
      background: color-mix(in srgb, var(--danger) 24%, var(--control-hover));
      color: var(--danger);
    }
    .muted {
      color: var(--on-muted);
      font-size: 11px;
      line-height: 16px;
      margin: 0;
    }
    .code {
      font-family: "SF Mono", "Cascadia Code", Consolas, monospace;
    }
    .input-wrap {
      position: relative;
    }
    .password-toggle {
      align-items: center;
      background: transparent;
      color: var(--on-muted);
      display: inline-flex;
      font: inherit;
      height: 24px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 4px;
      top: 2px;
      width: 36px;
      border-radius: var(--radius-sm);
    }
    .password-toggle:hover {
      background: var(--surface-variant);
    }
    .password-toggle .codicon,
    .icon-button .codicon {
      font-size: 16px;
      line-height: 1;
    }
    .api-input {
      padding-right: 44px;
    }
    .status {
      align-items: center;
      display: flex;
      gap: 8px;
      min-height: 16px;
      padding-left: 1px;
    }
    .dot {
      background: var(--on-muted);
      border-radius: var(--radius-pill);
      display: inline-block;
      height: 8px;
      width: 8px;
    }
    .status.ok {
      color: var(--success);
    }
    .status.ok .dot {
      background: var(--success);
    }
    .status.error {
      color: var(--danger);
    }
    .status.error .dot {
      background: var(--danger);
    }
    .models {
      display: grid;
      gap: 2px;
      margin-bottom: 16px;
    }
    .model-row {
      align-items: center;
      border-radius: var(--radius-md);
      display: grid;
      gap: 16px;
      grid-template-columns: 18px minmax(170px, 1fr) 112px 34px 28px;
      min-height: 40px;
      padding: 6px 8px;
      transition: background-color 0.15s ease, outline-color 0.15s ease, opacity 0.15s ease;
    }
    .model-row:hover {
      background: var(--surface-variant);
    }
    .model-row.drag-over {
      outline: 1px solid var(--primary);
      outline-offset: -1px;
    }
    .model-row.dragging {
      opacity: 0.55;
    }
    .drag {
      cursor: grab;
      height: 20px;
      opacity: 0.75;
      position: relative;
      user-select: none;
      width: 18px;
    }
    .drag:active {
      cursor: grabbing;
    }
    .drag::before {
      background:
        radial-gradient(circle, var(--on-muted) 1px, transparent 1.5px) 0 0 / 6px 6px;
      content: "";
      display: block;
      height: 18px;
      margin: 2px auto 0;
      width: 12px;
    }
    .toggle {
      background: var(--input);
      border: 0;
      border-radius: var(--radius-pill);
      cursor: pointer;
      height: 18px;
      padding: 0;
      position: relative;
      transition: background-color 0.2s;
      width: 34px;
    }
    .toggle::after {
      background: var(--on-primary);
      border-radius: var(--radius-pill);
      content: "";
      height: 14px;
      left: 2px;
      position: absolute;
      top: 2px;
      transition: transform 0.2s;
      width: 14px;
    }
    .toggle.active {
      background: var(--primary);
    }
    .toggle.active::after {
      transform: translateX(16px);
    }
    .max-calls {
      align-items: center;
      display: flex;
      gap: 8px;
    }
    .max-calls label {
      color: var(--on-muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .max-calls input {
      text-align: center;
      width: 48px;
    }
    .icon-button {
      align-items: center;
      background: transparent;
      color: var(--on-muted);
      display: inline-flex;
      justify-content: center;
      padding: 0;
      position: relative;
      border-radius: var(--radius-sm);
      width: 28px;
    }
    .icon-button:hover {
      background: transparent;
      color: var(--danger);
    }
    .section-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 4px;
    }
    .chips {
      align-items: center;
      background: var(--input);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 32px;
      padding: 6px;
    }
    .chips:focus-within {
      outline: 1px solid var(--primary);
    }
    .chip {
      align-items: center;
      background: var(--surface-variant);
      border: 1px solid var(--outline);
      border-radius: var(--radius-sm);
      display: inline-flex;
      font-size: 11px;
      gap: 6px;
      line-height: 16px;
      padding: 2px 8px;
    }
    .chip button {
      background: transparent;
      border-radius: var(--radius-sm);
      color: var(--on-muted);
      font-size: 12px;
      height: 16px;
      padding: 0;
      width: 14px;
    }
    .chip-input {
      background: transparent !important;
      border: 0 !important;
      flex: 1;
      font-size: 11px !important;
      height: 20px !important;
      min-width: 90px;
      outline: 0 !important;
      padding: 0 !important;
    }
    .range-head {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }
    .range-value {
      color: var(--primary);
      font-family: "SF Mono", "Cascadia Code", Consolas, monospace;
      font-size: 11px;
    }
    .fallback {
      align-items: flex-start;
      display: flex;
      gap: 16px;
    }
    .footer {
      align-items: center;
      background: var(--surface);
      border-top: 1px solid var(--outline);
      bottom: 0;
      display: flex;
      gap: 24px;
      height: 32px;
      left: 0;
      padding: 0 24px;
      position: fixed;
      right: 0;
      z-index: 10;
    }
    .footer .left {
      flex: 1;
    }
    .footer-link,
    .modified {
      color: var(--on-muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .footer-link {
      background: var(--control);
      border-radius: var(--radius-sm);
      height: 22px;
      padding: 0 12px;
    }
    .footer-link:hover {
      background: var(--control-hover);
      color: var(--secondary-foreground);
      text-decoration: none;
    }
    .footer .primary {
      font-size: 11px;
      font-weight: 700;
      height: 22px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    @media (max-width: 760px) {
      body {
        min-width: 0;
      }
      .topbar {
        align-items: flex-start;
        flex-direction: column;
        height: auto;
        gap: 8px;
        padding: 8px 12px;
      }
      .layout {
        padding: 35px 16px 72px;
      }
      .model-row {
        grid-template-columns: 18px minmax(0, 1fr) 104px 34px 28px;
      }
      .field-line,
      .fallback {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="title">AUTO COMMITER - Settings</div>
  </header>
  <div class="layout">
    <div class="section">
      <h2>Groq API Key</h2>
      <div class="row">
        <div class="field-line">
          <div class="input-wrap">
            <input class="api-input code" id="apiKey" type="password" value="${escapeHtml(input.apiKey)}" placeholder="gsk_..." />
            <button class="password-toggle" id="toggleApiKey" title="Show API key" type="button" aria-label="Show API key">
              <span class="codicon codicon-eye" id="toggleApiKeyIcon" aria-hidden="true"></span>
            </button>
          </div>
          <button class="action-button" id="verifyApiKey" type="button">Verify</button>
        </div>
        <div class="status ${input.apiKey ? "ok" : ""}" id="apiKeyStatus">
          <span class="dot"></span>
          <span>${input.apiKey ? "Key saved" : "Key not configured"}</span>
        </div>
      </div>
    </div>

    <div class="section" data-section="models">
      <h2>Models</h2>
      <div class="models" id="models"></div>
      <div class="section-actions">
        <button class="action-button" id="addModel" type="button">+ Add Model</button>
        <button class="reset-button danger" id="resetModels" type="button">Reset to Defaults</button>
      </div>
    </div>

    <div class="section" data-section="commit rules">
      <h2>Commit Rules</h2>
      <div class="row">
        <label for="tagInput">Allowed Message Tags</label>
        <div class="chips" id="commitTags"></div>
      </div>
      <div class="grid">
        <label class="row">
          <span>Max diff characters</span>
          <input id="maxDiffCharacters" type="number" value="${input.settings.maxDiffCharacters}" min="500" />
        </label>
        <label class="row">
          <span>Max commit words</span>
          <input id="maxCommitWords" type="number" value="${input.settings.maxCommitWords}" min="3" />
        </label>
      </div>
      <div class="row">
        <div class="range-head">
          <label for="temperature">Temperature (0.0 - 1.0)</label>
          <span class="range-value" id="temperatureValue">${input.settings.temperature}</span>
        </div>
        <input id="temperature" max="1" min="0" step="0.1" type="range" value="${input.settings.temperature}" />
      </div>
    </div>

    <div class="section" data-section="fallback behaviour">
      <h2>Fallback Behaviour</h2>
      <div class="fallback">
        <button class="toggle ${input.settings.allowFallbackCommits ? "active" : ""}" id="allowFallbackCommits" type="button" aria-pressed="${input.settings.allowFallbackCommits ? "true" : "false"}"></button>
      <div>
          <label>Allow fallback commits when all models fail</label>
          <p class="muted">If the AI models are unreachable or quota-limited, the extension will attempt to generate a generic commit message based on modified filenames only.</p>
        </div>
      </div>
    </div>
  </div>
  <footer class="footer">
    <div class="left"><span class="modified" id="dirtyLabel">No unsaved changes</span></div>
    <button class="footer-link reset-button" id="resetAll" type="button">Reset All Settings</button>
    <button class="primary" id="saveButton" type="button" disabled>Save Changes</button>
  </footer>
  <script nonce="${input.nonce}">
    const vscode = acquireVsCodeApi();
    const models = ${JSON.stringify(input.settings.models)};
    const defaultModels = ${JSON.stringify(DEFAULT_MODELS)};
    let tags = ${JSON.stringify(input.settings.commitTagOptions)};
    let allowFallbackCommits = ${JSON.stringify(input.settings.allowFallbackCommits)};
    let dirty = false;
    const modelContainer = document.getElementById("models");
    const tagContainer = document.getElementById("commitTags");
    const saveButton = document.getElementById("saveButton");
    const dirtyLabel = document.getElementById("dirtyLabel");
    let draggedModelIndex = null;

    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      }[char]));
    }

    function markDirty() {
      dirty = true;
      saveButton.disabled = false;
      dirtyLabel.textContent = "Modified settings";
    }

    function setStatus(ok, message) {
      const status = document.getElementById("apiKeyStatus");
      status.className = "status " + (ok ? "ok" : "error");
      status.querySelector("span:last-child").textContent = message;
    }

    function refreshModelOrder() {
      models.forEach((model, index) => {
        model.costOrder = index + 1;
      });
    }

    function moveModel(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return;
      }
      const [model] = models.splice(fromIndex, 1);
      models.splice(toIndex, 0, model);
      refreshModelOrder();
      markDirty();
      renderModels();
    }

    function clearModelDragState() {
      document.querySelectorAll(".model-row.drag-over, .model-row.dragging").forEach((node) => {
        node.classList.remove("drag-over", "dragging");
      });
    }

    function getModelRowAtPoint(x, y) {
      const element = document.elementFromPoint(x, y);
      return element ? element.closest(".model-row") : null;
    }

    function startModelPointerDrag(event, index) {
      event.preventDefault();
      draggedModelIndex = index;
      let dropIndex = index;
      const sourceRow = document.querySelector('.model-row[data-index="' + index + '"]');
      if (sourceRow) {
        sourceRow.classList.add("dragging");
      }

      const handlePointerMove = (moveEvent) => {
        const row = getModelRowAtPoint(moveEvent.clientX, moveEvent.clientY);
        if (!row) {
          return;
        }
        const nextIndex = Number(row.dataset.index);
        if (!Number.isFinite(nextIndex)) {
          return;
        }
        dropIndex = nextIndex;
        clearModelDragState();
        if (sourceRow) {
          sourceRow.classList.add("dragging");
        }
        row.classList.add("drag-over");
      };

      const finishPointerDrag = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", finishPointerDrag);
        clearModelDragState();
        const fromIndex = draggedModelIndex;
        draggedModelIndex = null;
        moveModel(Number(fromIndex), dropIndex);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", finishPointerDrag);
    }

    function renderModels() {
      modelContainer.innerHTML = "";
      models.forEach((model, index) => {
        const row = document.createElement("div");
        row.className = "model-row";
        row.dataset.index = String(index);

        const drag = document.createElement("span");
        drag.className = "drag";
        drag.title = "Drag handle";
        drag.addEventListener("pointerdown", (event) => startModelPointerDrag(event, index));

        const toggle = document.createElement("button");
        toggle.className = "toggle" + (model.enabled ? " active" : "");
        toggle.type = "button";
        toggle.setAttribute("aria-pressed", model.enabled ? "true" : "false");
        toggle.addEventListener("click", () => {
          model.enabled = !model.enabled;
          markDirty();
          renderModels();
        });

        const id = document.createElement("input");
        id.className = "code";
        id.dataset.index = String(index);
        id.dataset.field = "id";
        id.type = "text";
        id.value = model.id || "";

        const calls = document.createElement("div");
        calls.className = "max-calls";
        const callsLabel = document.createElement("label");
        callsLabel.textContent = "Max calls:";
        const callsInput = document.createElement("input");
        callsInput.dataset.index = String(index);
        callsInput.dataset.field = "maxCallsPerRun";
        callsInput.type = "number";
        callsInput.min = "1";
        callsInput.value = String(Number(model.maxCallsPerRun || 1));
        calls.append(callsLabel, callsInput);

        const remove = document.createElement("button");
        remove.className = "icon-button delete-button";
        remove.title = "Remove model";
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove model");
        const removeIcon = document.createElement("span");
        removeIcon.className = "codicon codicon-trash";
        removeIcon.setAttribute("aria-hidden", "true");
        remove.appendChild(removeIcon);
        remove.addEventListener("click", () => {
          models.splice(index, 1);
          markDirty();
          renderModels();
        });

        row.append(drag, id, calls, toggle, remove);
        modelContainer.appendChild(row);
      });

      modelContainer.querySelectorAll("input").forEach((node) => {
        node.addEventListener("input", handleModelInput);
      });
    }

    function handleModelInput(event) {
      const target = event.target;
      const index = Number(target.dataset.index);
      const field = target.dataset.field;
      if (field === "maxCallsPerRun") {
        models[index][field] = Number(target.value);
      } else {
        models[index][field] = target.value;
      }
      refreshModelOrder();
      markDirty();
    }

    function renderTags() {
      tagContainer.innerHTML = "";
      tags.forEach((tag, index) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.append(document.createTextNode(tag));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "x";
        remove.addEventListener("click", () => {
          tags.splice(index, 1);
          markDirty();
          renderTags();
        });
        chip.append(remove);
        tagContainer.appendChild(chip);
      });

      const input = document.createElement("input");
      input.className = "chip-input";
      input.id = "tagInput";
      input.placeholder = "Add tag...";
      input.type = "text";
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== ",") {
          return;
        }
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          return;
        }
        tags.push(value);
        input.value = "";
        markDirty();
        renderTags();
      });
      tagContainer.appendChild(input);
    }

    document.getElementById("addModel").addEventListener("click", () => {
      models.push({
        id: "",
        enabled: true,
        maxCallsPerRun: 10,
        costOrder: models.length + 1
      });
      markDirty();
      renderModels();
    });

    document.getElementById("resetModels").addEventListener("click", () => {
      vscode.postMessage({ type: "reset-models" });
    });

    document.getElementById("resetAll").addEventListener("click", () => {
      models.splice(0, models.length, ...defaultModels.map((model) => ({ ...model })));
      tags = ["Add:", "Update:", "Fix:", "Refactor:", "Ignore:"];
      document.getElementById("maxDiffCharacters").value = "4000";
      document.getElementById("maxCommitWords").value = "10";
      document.getElementById("temperature").value = "0.2";
      document.getElementById("temperatureValue").textContent = "0.2";
      allowFallbackCommits = true;
      document.getElementById("allowFallbackCommits").classList.add("active");
      document.getElementById("allowFallbackCommits").setAttribute("aria-pressed", "true");
      markDirty();
      renderModels();
      renderTags();
    });

    function saveSettings() {
      refreshModelOrder();
      vscode.postMessage({
        type: "save",
        apiKey: document.getElementById("apiKey").value,
        models,
        settings: {
          allowFallbackCommits,
          maxDiffCharacters: Number(document.getElementById("maxDiffCharacters").value),
          maxCommitWords: Number(document.getElementById("maxCommitWords").value),
          temperature: Number(document.getElementById("temperature").value),
          commitTagOptions: tags.map((item) => item.trim()).filter(Boolean)
        }
      });
    }

    document.getElementById("saveButton").addEventListener("click", saveSettings);
    document.getElementById("verifyApiKey").addEventListener("click", () => {
      setStatus(false, "Verifying...");
      vscode.postMessage({ type: "verify-api-key", apiKey: document.getElementById("apiKey").value });
    });

    document.getElementById("toggleApiKey").addEventListener("click", () => {
      const input = document.getElementById("apiKey");
      input.type = input.type === "password" ? "text" : "password";
      const button = document.getElementById("toggleApiKey");
      const icon = document.getElementById("toggleApiKeyIcon");
      const isVisible = input.type === "text";
      button.classList.toggle("is-visible", isVisible);
      button.setAttribute("aria-label", isVisible ? "Hide API key" : "Show API key");
      button.title = isVisible ? "Hide API key" : "Show API key";
      icon.className = "codicon " + (isVisible ? "codicon-eye-closed" : "codicon-eye");
    });

    document.getElementById("allowFallbackCommits").addEventListener("click", () => {
      allowFallbackCommits = !allowFallbackCommits;
      const toggle = document.getElementById("allowFallbackCommits");
      toggle.classList.toggle("active", allowFallbackCommits);
      toggle.setAttribute("aria-pressed", allowFallbackCommits ? "true" : "false");
      markDirty();
    });

    document.getElementById("temperature").addEventListener("input", (event) => {
      document.getElementById("temperatureValue").textContent = event.target.value;
      markDirty();
    });

    ["apiKey", "maxDiffCharacters", "maxCommitWords"].forEach((id) => {
      document.getElementById(id).addEventListener("input", markDirty);
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || message.type !== "api-key-verified") {
        return;
      }
      setStatus(Boolean(message.ok), String(message.message || "Verification finished."));
    });

    renderTags();
    renderModels();
  </script>
</body>
</html>`;
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
