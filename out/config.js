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
exports.SECRET_KEY = void 0;
exports.getSettings = getSettings;
exports.saveCommitMode = saveCommitMode;
exports.saveModels = saveModels;
exports.saveSimpleSettings = saveSimpleSettings;
const vscode = __importStar(require("vscode"));
const defaults_1 = require("./defaults");
const SECTION = "autoCommiter";
exports.SECRET_KEY = "autoCommiter.groqApiKey";
function normalizeModels(models) {
    const source = Array.isArray(models) ? models : defaults_1.DEFAULT_MODELS;
    return source
        .map((model) => ({
        id: String(model.id ?? "").trim(),
        enabled: Boolean(model.enabled),
        maxCallsPerRun: Number(model.maxCallsPerRun ?? 0),
        costOrder: Number(model.costOrder ?? 0) || undefined,
        costTier: String(model.costTier ?? "").trim() || undefined
    }))
        .filter((model) => model.id.length > 0 && model.maxCallsPerRun > 0);
}
function normalizeCommitMode(value) {
    return value === "batch" ? "batch" : "single";
}
function getSettings() {
    const config = vscode.workspace.getConfiguration(SECTION);
    return {
        commitMode: normalizeCommitMode(config.get("commitMode", "single")),
        allowFallbackCommits: config.get("allowFallbackCommits", true),
        maxDiffCharacters: config.get("maxDiffCharacters", 4000),
        maxCommitWords: config.get("maxCommitWords", 10),
        temperature: config.get("temperature", 0.2),
        commitTagOptions: config.get("commitTagOptions", defaults_1.DEFAULT_COMMIT_TAGS),
        models: normalizeModels(config.get("models", defaults_1.DEFAULT_MODELS))
    };
}
async function saveCommitMode(mode) {
    await vscode.workspace
        .getConfiguration(SECTION)
        .update("commitMode", normalizeCommitMode(mode), vscode.ConfigurationTarget.Global);
}
async function saveModels(models) {
    await vscode.workspace
        .getConfiguration(SECTION)
        .update("models", normalizeModels(models), vscode.ConfigurationTarget.Global);
}
async function saveSimpleSettings(input) {
    const config = vscode.workspace.getConfiguration(SECTION);
    await config.update("allowFallbackCommits", input.allowFallbackCommits, vscode.ConfigurationTarget.Global);
    await config.update("maxDiffCharacters", input.maxDiffCharacters, vscode.ConfigurationTarget.Global);
    await config.update("maxCommitWords", input.maxCommitWords, vscode.ConfigurationTarget.Global);
    await config.update("temperature", input.temperature, vscode.ConfigurationTarget.Global);
    await config.update("commitTagOptions", input.commitTagOptions, vscode.ConfigurationTarget.Global);
}
//# sourceMappingURL=config.js.map