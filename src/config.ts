import * as vscode from "vscode";
import { DEFAULT_COMMIT_TAGS, DEFAULT_MODELS } from "./defaults";
import { ConfiguredModel, ExtensionSettingsSnapshot } from "./types";

const SECTION = "autoCommiter";

export const SECRET_KEY = "autoCommiter.groqApiKey";

function normalizeModels(models: unknown): ConfiguredModel[] {
  const source = Array.isArray(models) ? models : DEFAULT_MODELS;
  return source
    .map((model) => ({
      id: String((model as ConfiguredModel).id ?? "").trim(),
      enabled: Boolean((model as ConfiguredModel).enabled),
      maxCallsPerRun: Number((model as ConfiguredModel).maxCallsPerRun ?? 0),
      costOrder: Number((model as ConfiguredModel).costOrder ?? 0) || undefined,
      costTier: String((model as ConfiguredModel).costTier ?? "").trim() || undefined
    }))
    .filter((model) => model.id.length > 0 && model.maxCallsPerRun > 0);
}

export function getSettings(): ExtensionSettingsSnapshot {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    allowFallbackCommits: config.get<boolean>("allowFallbackCommits", true),
    maxDiffCharacters: config.get<number>("maxDiffCharacters", 4000),
    maxCommitWords: config.get<number>("maxCommitWords", 10),
    temperature: config.get<number>("temperature", 0.2),
    commitTagOptions: config.get<string[]>("commitTagOptions", DEFAULT_COMMIT_TAGS),
    models: normalizeModels(config.get<ConfiguredModel[]>("models", DEFAULT_MODELS))
  };
}

export async function saveModels(models: ConfiguredModel[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update("models", normalizeModels(models), vscode.ConfigurationTarget.Global);
}

export async function saveSimpleSettings(input: {
  allowFallbackCommits: boolean;
  maxDiffCharacters: number;
  maxCommitWords: number;
  temperature: number;
  commitTagOptions: string[];
}): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  await config.update("allowFallbackCommits", input.allowFallbackCommits, vscode.ConfigurationTarget.Global);
  await config.update("maxDiffCharacters", input.maxDiffCharacters, vscode.ConfigurationTarget.Global);
  await config.update("maxCommitWords", input.maxCommitWords, vscode.ConfigurationTarget.Global);
  await config.update("temperature", input.temperature, vscode.ConfigurationTarget.Global);
  await config.update("commitTagOptions", input.commitTagOptions, vscode.ConfigurationTarget.Global);
}
