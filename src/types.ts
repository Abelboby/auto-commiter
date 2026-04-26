export interface ConfiguredModel {
  id: string;
  enabled: boolean;
  maxCallsPerRun: number;
  costOrder?: number;
  costTier?: string;
}

export interface ActiveModel extends ConfiguredModel {
  callsUsed: number;
}

export interface CandidateCommit {
  filePath: string;
  message: string;
  isFallback: boolean;
}

export interface ExtensionSettingsSnapshot {
  allowFallbackCommits: boolean;
  maxDiffCharacters: number;
  maxCommitWords: number;
  temperature: number;
  commitTagOptions: string[];
  models: ConfiguredModel[];
}
