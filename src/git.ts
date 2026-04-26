import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface ChangeInput {
  filePath: string;
  promptContent: string;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 1024 * 1024 * 8
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Git command failed: git ${args.join(" ")}\n${String(error)}`);
  }
}

export async function getWorkspaceRoot(): Promise<string> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error("Open a workspace folder before running Auto Commiter.");
  }
  return folder.uri.fsPath;
}

export async function getRepositoryRoot(cwd: string): Promise<string> {
  const repoRoot = await runGit(["rev-parse", "--show-toplevel"], cwd);
  if (!repoRoot) {
    throw new Error("This workspace does not appear to be inside a git repository.");
  }
  return repoRoot;
}

async function getTrackedDiffs(repoRoot: string): Promise<string[]> {
  const output = await runGit(["diff", "--name-only"], repoRoot);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

async function getUntrackedFiles(repoRoot: string): Promise<string[]> {
  const output = await runGit(["ls-files", "--others", "--exclude-standard"], repoRoot);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

export async function collectChanges(repoRoot: string, maxDiffCharacters: number): Promise<ChangeInput[]> {
  const tracked = await getTrackedDiffs(repoRoot);
  const untracked = await getUntrackedFiles(repoRoot);
  const filePaths = [...new Set([...tracked, ...untracked])];

  if (filePaths.length === 0) {
    return [];
  }

  const changes: ChangeInput[] = [];
  for (const filePath of filePaths) {
    const promptContent = await getFileDiffOrContent(repoRoot, filePath, maxDiffCharacters);
    if (promptContent.trim().length > 0) {
      changes.push({ filePath, promptContent });
    }
  }

  return changes;
}

async function getFileDiffOrContent(repoRoot: string, filePath: string, maxDiffCharacters: number): Promise<string> {
  const diff = await runGit(["diff", "--", filePath], repoRoot);
  if (diff) {
    return diff.slice(0, maxDiffCharacters);
  }

  const fullPath = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), filePath).fsPath;
  try {
    const contents = await fs.readFile(fullPath, "utf8");
    return contents.slice(0, maxDiffCharacters);
  } catch {
    return "";
  }
}

export async function commitFile(repoRoot: string, filePath: string, message: string): Promise<void> {
  await runGit(["add", "--", filePath], repoRoot);
  await runGit(["commit", "-m", message], repoRoot);
}
