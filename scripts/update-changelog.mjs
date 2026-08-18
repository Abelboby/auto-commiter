import fs from "node:fs";

const [, , versionArg, notesPath = "release-notes.md", changelogPath = "CHANGELOG.md", releaseNotesOutputPath] = process.argv;

if (!versionArg) {
  throw new Error("Usage: node scripts/update-changelog.mjs <version> [notes-path] [changelog-path] [release-notes-output-path]");
}

const version = versionArg.replace(/^v/i, "");
const notes = fs.readFileSync(notesPath, "utf8");
const currentChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf8") : "# Change Log\n";
const releaseNotes = await normalizeReleaseNotes(notes);
const entry = `## ${version}\n\n${releaseNotes}`;
const nextChangelog = upsertChangelogEntry(currentChangelog, version, entry);

fs.writeFileSync(changelogPath, nextChangelog, "utf8");
if (releaseNotesOutputPath) {
  fs.writeFileSync(releaseNotesOutputPath, `${releaseNotes}\n`, "utf8");
}

async function normalizeReleaseNotes(value) {
  const prBodyBullets = await getPullRequestBodyBullets(value);
  const bulletLines = prBodyBullets.length > 0 ? prBodyBullets : value
    .replace(/\r\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .split("\n")
    .filter((line) => !line.trim().match(/^\*\*Full Changelog\*\*/i))
    .filter((line) => !line.trim().match(/^#{2,}\s+What's Changed\s*$/i))
    .map(toChangelogBullet)
    .filter(Boolean);

  const trimmed = trimBlankLines(bulletLines).join("\n").trim();
  return trimmed || "- Release maintenance updates.";
}

async function getPullRequestBodyBullets(value) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumbers = extractPullRequestNumbers(value);

  if (!token || !repository || prNumbers.length === 0) {
    return [];
  }

  const bullets = [];
  for (const prNumber of prNumbers) {
    const pullRequest = await fetchPullRequest(repository, prNumber, token);
    bullets.push(...extractDescriptionBullets(pullRequest.body || ""));
  }

  return uniqueLines(bullets);
}

function extractPullRequestNumbers(value) {
  const numbers = [];
  const seen = new Set();
  const regex = /\/pull\/(?<number>\d+)\b/g;

  for (const match of value.matchAll(regex)) {
    const number = match.groups?.number;
    if (number && !seen.has(number)) {
      seen.add(number);
      numbers.push(number);
    }
  }

  return numbers;
}

async function fetchPullRequest(repository, prNumber, token) {
  const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "auto-commiter-release-notes",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not read pull request #${prNumber}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function extractDescriptionBullets(body) {
  const lines = body.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").split("\n");
  const descriptionStart = lines.findIndex((line) => line.trim().match(/^##\s+Description\s*$/i));
  if (descriptionStart === -1) {
    return [];
  }

  const bullets = [];
  for (const line of lines.slice(descriptionStart + 1)) {
    if (line.trim().match(/^#{2,}\s+/)) {
      break;
    }
    const bullet = toChangelogBullet(line);
    if (bullet) {
      bullets.push(bullet);
    }
  }

  return bullets;
}

function toChangelogBullet(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.match(/^[-*]\s+/)) {
    return trimmed;
  }

  let text = trimmed
    .replace(/^[-*]\s+/, "")
    .replace(/\s+by\s+@[A-Za-z0-9-]+\s+in\s+https:\/\/github\.com\/\S+$/i, "")
    .replace(/\s+\(#\d+\)$/i, "")
    .replace(/^([a-z]+)(?:\([^)]+\))?:\s+/i, "")
    .trim();

  if (!text) {
    return "";
  }

  text = toReleaseNoteSentence(text);
  return `- ${text}`;
}

function toReleaseNoteSentence(value) {
  const text = value.trim();
  const replacements = [
    ["add", "Added"],
    ["adjust", "Adjusted"],
    ["copy", "Copied"],
    ["correct", "Corrected"],
    ["create", "Created"],
    ["fix", "Fixed"],
    ["generate", "Generated"],
    ["implement", "Implemented"],
    ["modify", "Modified"],
    ["refresh", "Refreshed"],
    ["remove", "Removed"],
    ["replace", "Replaced"],
    ["revise", "Revised"],
    ["simplify", "Simplified"],
    ["update", "Updated"],
  ];

  for (const [from, to] of replacements) {
    if (text.toLowerCase() === from) {
      return to;
    }
    if (text.toLowerCase().startsWith(`${from} `)) {
      return normalizeReleaseSentence(`${to}${text.slice(from.length)}`);
    }
  }

  return normalizeReleaseSentence(text[0].toUpperCase() + text.slice(1));
}

function normalizeReleaseSentence(value) {
  return value
    .replace(/\band add\b/g, "and added")
    .replace(/\band adjust\b/g, "and adjusted")
    .replace(/\band create\b/g, "and created")
    .replace(/\band fix\b/g, "and fixed")
    .replace(/\band generate\b/g, "and generated")
    .replace(/\band implement\b/g, "and implemented")
    .replace(/\band refresh\b/g, "and refreshed")
    .replace(/\band remove\b/g, "and removed")
    .replace(/\band update\b/g, "and updated")
    .replace(/\.$/, "");
}

function upsertChangelogEntry(changelog, versionToWrite, entryToWrite) {
  const text = changelog.replace(/\r\n/g, "\n").trimEnd();
  const headings = Array.from(text.matchAll(/^##\s+(.+)$/gm));
  const targetIndex = headings.findIndex((heading) => normalizeVersionHeading(heading[1]) === versionToWrite);

  if (targetIndex !== -1) {
    const start = headings[targetIndex].index;
    const end = targetIndex + 1 < headings.length ? headings[targetIndex + 1].index : text.length;
    return joinSections(text.slice(0, start), entryToWrite, text.slice(end));
  }

  const firstVersionHeading = headings[0]?.index ?? text.length;
  return joinSections(text.slice(0, firstVersionHeading), entryToWrite, text.slice(firstVersionHeading));
}

function normalizeVersionHeading(value) {
  return value.trim().replace(/^v/i, "").trim();
}

function joinSections(...sections) {
  return `${sections.map((section) => section.trim()).filter(Boolean).join("\n\n")}\n`;
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function uniqueLines(lines) {
  const seen = new Set();
  const unique = [];

  for (const line of lines) {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(line);
    }
  }

  return unique;
}
