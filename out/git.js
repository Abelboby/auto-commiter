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
exports.getWorkspaceRoot = getWorkspaceRoot;
exports.getRepositoryRoot = getRepositoryRoot;
exports.collectChanges = collectChanges;
exports.commitFile = commitFile;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const fs = __importStar(require("node:fs/promises"));
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function runGit(args, cwd) {
    try {
        const { stdout } = await execFileAsync("git", args, {
            cwd,
            maxBuffer: 1024 * 1024 * 8
        });
        return stdout.trim();
    }
    catch (error) {
        throw new Error(`Git command failed: git ${args.join(" ")}\n${String(error)}`);
    }
}
async function getWorkspaceRoot() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error("Open a workspace folder before running Auto Commiter.");
    }
    return folder.uri.fsPath;
}
async function getRepositoryRoot(cwd) {
    const repoRoot = await runGit(["rev-parse", "--show-toplevel"], cwd);
    if (!repoRoot) {
        throw new Error("This workspace does not appear to be inside a git repository.");
    }
    return repoRoot;
}
async function getTrackedDiffs(repoRoot) {
    const output = await runGit(["diff", "--name-only"], repoRoot);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
}
async function getUntrackedFiles(repoRoot) {
    const output = await runGit(["ls-files", "--others", "--exclude-standard"], repoRoot);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
}
async function collectChanges(repoRoot, maxDiffCharacters) {
    const tracked = await getTrackedDiffs(repoRoot);
    const untracked = await getUntrackedFiles(repoRoot);
    const filePaths = [...new Set([...tracked, ...untracked])];
    if (filePaths.length === 0) {
        return [];
    }
    const changes = [];
    for (const filePath of filePaths) {
        const promptContent = await getFileDiffOrContent(repoRoot, filePath, maxDiffCharacters);
        if (promptContent.trim().length > 0) {
            changes.push({ filePath, promptContent });
        }
    }
    return changes;
}
async function getFileDiffOrContent(repoRoot, filePath, maxDiffCharacters) {
    const diff = await runGit(["diff", "--", filePath], repoRoot);
    if (diff) {
        return diff.slice(0, maxDiffCharacters);
    }
    const fullPath = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), filePath).fsPath;
    try {
        const contents = await fs.readFile(fullPath, "utf8");
        return contents.slice(0, maxDiffCharacters);
    }
    catch {
        return "";
    }
}
async function commitFile(repoRoot, filePath, message) {
    await runGit(["add", "--", filePath], repoRoot);
    await runGit(["commit", "-m", message], repoRoot);
}
//# sourceMappingURL=git.js.map