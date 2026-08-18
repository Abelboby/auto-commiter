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

export interface BatchCommit {
  filePaths: string[];
  message: string;
  isFallback: boolean;
}

export type CommitMode = "single" | "batch";

export interface ExtensionSettingsSnapshot {
  commitMode: CommitMode;
  allowFallbackCommits: boolean;
  maxDiffCharacters: number;
  maxCommitWords: number;
  temperature: number;
  commitTagOptions: string[];
  models: ConfiguredModel[];
}
