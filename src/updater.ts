import * as cp from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const OWNER = "Abelboby";
const REPO = "auto-commiter";
const LATEST_RELEASE_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const USER_AGENT = "auto-commiter-vscode-extension";

export type UpdateCheckStatus = "checking" | "available" | "current" | "error";

export interface UpdateCheckResult {
  readonly status: UpdateCheckStatus;
  readonly currentVersion: string;
  readonly latestVersion?: string;
  readonly releaseUrl?: string;
  readonly assetName?: string;
  readonly assetDownloadUrl?: string;
  readonly message: string;
}

interface GitHubReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

interface GitHubRelease {
  readonly tag_name: string;
  readonly html_url: string;
  readonly assets: ReadonlyArray<GitHubReleaseAsset>;
}

interface HttpResponse {
  readonly statusCode: number;
  readonly body: string;
}

export async function checkForUpdate(context: vscode.ExtensionContext): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion(context);

  try {
    const response = await getJson<GitHubRelease>(LATEST_RELEASE_API);
    const latestVersion = normalizeVersion(response.tag_name);
    const vsixAsset = response.assets.find((asset) => asset.name.toLowerCase().endsWith(".vsix"));

    if (!latestVersion) {
      return {
        status: "error",
        currentVersion,
        message: "Latest GitHub release does not have a valid version tag."
      };
    }

    if (!vsixAsset) {
      return {
        status: "error",
        currentVersion,
        latestVersion,
        releaseUrl: response.html_url,
        message: `Release v${latestVersion} does not include a VSIX asset.`
      };
    }

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return {
        status: "current",
        currentVersion,
        latestVersion,
        releaseUrl: response.html_url,
        assetName: vsixAsset.name,
        assetDownloadUrl: vsixAsset.browser_download_url,
        message: `Auto Commiter is up to date at v${currentVersion}.`
      };
    }

    return {
      status: "available",
      currentVersion,
      latestVersion,
      releaseUrl: response.html_url,
      assetName: vsixAsset.name,
      assetDownloadUrl: vsixAsset.browser_download_url,
      message: `Update available: v${currentVersion} -> v${latestVersion}.`
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function installUpdate(
  context: vscode.ExtensionContext,
  update: UpdateCheckResult,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  if (update.status !== "available" || !update.assetDownloadUrl || !update.assetName || !update.latestVersion) {
    throw new Error("No downloadable update is available.");
  }

  const updatesDirectory = path.join(context.globalStorageUri.fsPath, "updates");
  await fs.promises.mkdir(updatesDirectory, { recursive: true });

  const vsixPath = path.join(updatesDirectory, update.assetName);
  outputChannel.appendLine(`Downloading Auto Commiter ${update.latestVersion} from GitHub Releases.`);
  await downloadFile(update.assetDownloadUrl, vsixPath);

  outputChannel.appendLine(`Installing VSIX: ${vsixPath}`);
  const cliPath = await resolveCodeCliPath();
  await runCodeCli(cliPath, ["--install-extension", vsixPath, "--force"], outputChannel);
}

function getCurrentVersion(context: vscode.ExtensionContext): string {
  const packageJson = context.extension.packageJSON as { version?: unknown };
  return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
}

function normalizeVersion(value: string): string | undefined {
  const match = value.trim().match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
  return match?.[1];
}

function compareVersions(a: string, b: string): number {
  const [aMain] = a.split(/[-+]/);
  const [bMain] = b.split(/[-+]/);
  const aParts = aMain.split(".").map(Number);
  const bParts = bMain.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await requestText(url);

  if (response.statusCode === 404) {
    throw new Error("Could not find a public GitHub Release for Auto Commiter.");
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`GitHub release check failed with HTTP ${response.statusCode}.`);
  }

  return JSON.parse(response.body) as T;
}

async function requestText(url: string, redirectCount = 0): Promise<HttpResponse> {
  if (redirectCount > 5) {
    throw new Error("Too many redirects while requesting GitHub Releases.");
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": USER_AGENT
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (location && statusCode >= 300 && statusCode < 400) {
          response.resume();
          const nextUrl = new URL(location, url).toString();
          requestText(nextUrl, redirectCount + 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(15_000, () => {
      request.destroy(new Error("GitHub release check timed out."));
    });
  });
}

async function downloadFile(url: string, destinationPath: string, redirectCount = 0): Promise<void> {
  if (redirectCount > 5) {
    throw new Error("Too many redirects while downloading the VSIX.");
  }

  await new Promise<void>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (location && statusCode >= 300 && statusCode < 400) {
          response.resume();
          const nextUrl = new URL(location, url).toString();
          downloadFile(nextUrl, destinationPath, redirectCount + 1).then(resolve, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`VSIX download failed with HTTP ${statusCode}.`));
          return;
        }

        const output = fs.createWriteStream(destinationPath);
        response.pipe(output);
        output.on("finish", () => {
          output.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        output.on("error", reject);
      }
    );

    request.on("error", reject);
    request.setTimeout(60_000, () => {
      request.destroy(new Error("VSIX download timed out."));
    });
  });
}

async function resolveCodeCliPath(): Promise<string> {
  const appName = vscode.env.appName.toLowerCase();
  const commandNames = appName.includes("insiders") ? ["code-insiders", "code"] : ["code", "code-insiders"];
  const extension = process.platform === "win32" ? ".cmd" : "";
  const absoluteCandidates = [
    process.env.VSCODE_CLI,
    ...commandNames.map((command) => path.join(path.dirname(process.execPath), "bin", `${command}${extension}`)),
    ...commandNames.map((command) => path.join(path.dirname(path.dirname(process.execPath)), "bin", `${command}${extension}`))
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of absoluteCandidates) {
    if (path.isAbsolute(candidate)) {
      try {
        await fs.promises.access(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  }

  return `${commandNames[0]}${extension}`;
}

async function runCodeCli(
  cliPath: string,
  args: ReadonlyArray<string>,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = cp.spawn(cliPath, [...args], {
      cwd: os.homedir(),
      windowsHide: true
    });

    child.stdout.on("data", (chunk: Buffer) => outputChannel.append(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => outputChannel.append(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`VS Code CLI exited with code ${code ?? "unknown"}.`));
    });
  });
}
