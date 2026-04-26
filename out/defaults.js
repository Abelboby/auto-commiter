"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_COMMIT_TAGS = exports.DEFAULT_MODELS = void 0;
exports.DEFAULT_MODELS = [
    {
        id: "llama-3.1-8b-instant",
        enabled: true,
        maxCallsPerRun: 20,
        costOrder: 1,
        costTier: "lowest"
    },
    {
        id: "openai/gpt-oss-20b",
        enabled: true,
        maxCallsPerRun: 18,
        costOrder: 2,
        costTier: "low"
    },
    {
        id: "meta-llama/llama-4-scout-17b-16e-instruct",
        enabled: true,
        maxCallsPerRun: 15,
        costOrder: 3,
        costTier: "medium-low"
    },
    {
        id: "openai/gpt-oss-120b",
        enabled: true,
        maxCallsPerRun: 12,
        costOrder: 4,
        costTier: "medium"
    },
    {
        id: "qwen/qwen3-32b",
        enabled: true,
        maxCallsPerRun: 35,
        costOrder: 5,
        costTier: "medium-high"
    },
    {
        id: "llama-3.3-70b-versatile",
        enabled: true,
        maxCallsPerRun: 10,
        costOrder: 6,
        costTier: "highest"
    }
];
exports.DEFAULT_COMMIT_TAGS = [
    "Add:",
    "Update:",
    "Fix:",
    "Refactor:",
    "Ignore:"
];
//# sourceMappingURL=defaults.js.map