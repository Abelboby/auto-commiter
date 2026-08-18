import fs from "node:fs";

const [, , versionArg, notesPath = "release-notes.md", changelogPath = "CHANGELOG.md"] = process.argv;

if (!versionArg) {
  throw new Error("Usage: node scripts/update-changelog.mjs <version> [notes-path] [changelog-path]");
}

const version = versionArg.replace(/^v/i, "");
const notes = fs.readFileSync(notesPath, "utf8");
const currentChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf8") : "# Change Log\n";
const entry = `## ${version}\n\n${normalizeReleaseNotes(notes)}`;
const nextChangelog = upsertChangelogEntry(currentChangelog, version, entry);

fs.writeFileSync(changelogPath, nextChangelog, "utf8");

function normalizeReleaseNotes(value) {
  const bulletLines = value
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

  text = text[0].toUpperCase() + text.slice(1);
  return `- ${text}`;
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
