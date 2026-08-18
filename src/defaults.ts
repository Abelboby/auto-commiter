import { ConfiguredModel } from "./types";

export const DEFAULT_MODELS: ConfiguredModel[] = [
  {
    id: "openai/gpt-oss-20b",
    enabled: true,
    maxCallsPerRun: 12,
    costOrder: 1,
    costTier: "primary"
  },
  {
    id: "qwen/qwen3.6-27b",
    enabled: true,
    maxCallsPerRun: 6,
    costOrder: 2,
    costTier: "backup"
  },
  {
    id: "openai/gpt-oss-120b",
    enabled: true,
    maxCallsPerRun: 12,
    costOrder: 3,
    costTier: "quality-fallback"
  },
  {
    id: "groq/compound-mini",
    enabled: true,
    maxCallsPerRun: 10,
    costOrder: 4,
    costTier: "fast-fallback"
  },
  {
    id: "groq/compound",
    enabled: true,
    maxCallsPerRun: 4,
    costOrder: 5,
    costTier: "final-fallback"
  },
  {
    id: "allam-2-7b",
    enabled: true,
    maxCallsPerRun: 10,
    costOrder: 6,
    costTier: "language-fallback"
  }
];

export const DEFAULT_COMMIT_TAGS = [
  "Add:",
  "Update:",
  "Fix:",
  "Refactor:",
  "Ignore:"
];
