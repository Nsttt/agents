#!/usr/bin/env bun

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { env, exit, stderr, stdin, stdout } from "node:process";

const DEFAULT_DAILY_DIR = "/Users/nsttt/Documents/Nsttt Vault/06 - Journal/Daily";
const DEFAULT_SESSION_DIR = "/Users/nsttt/Documents/Nsttt Vault/06 - Journal/Agent Sessions";

type Args = {
  dailyDir?: string;
  sessionDir?: string;
  date?: string;
  heading?: string;
  summary?: string;
  content?: string;
  filename?: string;
  dryRun: boolean;
};

function usage(): string {
  return [
    "Usage:",
    "  bun create_session_note.ts [--daily-dir PATH] [--session-dir PATH] [--date YYYY-MM-DD]",
    "                             --heading TEXT --summary TEXT [--content TEXT]",
    "                             [--filename NAME.md] [--dry-run]",
    "",
    "Notes:",
    "  - --heading should be a short session title (3-7 words).",
    "  - --summary should be one short descriptive sentence.",
    "  - Reads done items from --content or STDIN (one item per line).",
    "  - Creates one session note and adds backlink to the daily note.",
  ].join("\n");
}

function fail(message: string): never {
  stderr.write(`Error: ${message}\n`);
  exit(1);
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--daily-dir":
        args.dailyDir = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--session-dir":
        args.sessionDir = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--date":
        args.date = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--heading":
        args.heading = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--content":
        args.content = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--summary":
        args.summary = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--filename":
        args.filename = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        stdout.write(`${usage()}\n`);
        exit(0);
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (!args.heading?.trim()) {
    fail("--heading is required and must be a short session title.");
  }
  if (!args.summary?.trim()) {
    fail("--summary is required and should be a short description.");
  }
  if (args.filename && !args.filename.trim()) {
    fail("--filename cannot be empty");
  }
  return args;
}

function parseDate(raw?: string): Date {
  if (!raw) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail(`Invalid --date format: ${raw}. Use YYYY-MM-DD.`);
  }
  const [year, month, day] = raw.split("-").map((part) => Number(part));
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    fail(`Invalid calendar date: ${raw}`);
  }
  return parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

async function readContent(contentArg?: string): Promise<string> {
  if (contentArg && contentArg.trim()) {
    return contentArg.trim();
  }

  if (stdin.isTTY) {
    fail("Provide note body with --content or piped STDIN.");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const piped = Buffer.concat(chunks).toString("utf8").trim();
  if (!piped) {
    fail("STDIN is empty. Provide content to write.");
  }
  return piped;
}

function normalizeDoneItems(raw: string): string[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    fail("No done items found. Provide at least one done item.");
  }
  return lines.map((line) => (line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`));
}

function toPosixPath(pathValue: string): string {
  return pathValue.split("\\").join("/");
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureMarkdownExtension(value: string): string {
  return value.toLowerCase().endsWith(".md") ? value : `${value}.md`;
}

function buildSessionFileName(args: Args, dateText: string): string {
  if (args.filename) {
    const trimmed = args.filename.trim();
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      fail("--filename must be a file name only, not a path.");
    }
    const normalized = sanitizeFilenameSegment(trimmed);
    if (!normalized) {
      fail("--filename is invalid after sanitization.");
    }
    return ensureMarkdownExtension(normalized);
  }

  const headingPart = sanitizeFilenameSegment(args.heading ?? "") || "Session";
  return `${headingPart} - ${dateText}.md`;
}

function commonAncestor(paths: string[]): string {
  if (paths.length === 0) {
    fail("Cannot determine common ancestor from empty paths.");
  }
  let ancestor = dirname(resolve(paths[0]));
  while (!paths.every((value) => {
    const resolved = resolve(value);
    return resolved === ancestor || resolved.startsWith(`${ancestor}/`);
  })) {
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      fail("Unable to determine common ancestor for daily/session paths.");
    }
    ancestor = parent;
  }
  return ancestor;
}

function toWikiLink(dailyNotePath: string, sessionNotePath: string): string {
  const root = commonAncestor([dailyNotePath, sessionNotePath]);
  const vaultRelative = toPosixPath(relative(root, dailyNotePath)).replace(/\.md$/i, "");
  if (!vaultRelative) {
    fail("Failed to build daily note wikilink.");
  }
  return `[[${vaultRelative}]]`;
}

function ensureDailyNote(dailyNotePath: string, dateText: string): void {
  if (existsSync(dailyNotePath)) {
    return;
  }
  mkdirSync(dirname(dailyNotePath), { recursive: true });
  writeFileSync(dailyNotePath, `# ${dateText}\n\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targetDate = parseDate(args.date);
  const dateText = formatDate(targetDate);

  const dailyDir = resolve(args.dailyDir ?? env.OBSIDIAN_DAILY_DIR ?? DEFAULT_DAILY_DIR);
  const sessionDir = resolve(
    args.sessionDir ?? env.OBSIDIAN_SESSION_DIR ?? DEFAULT_SESSION_DIR,
  );

  const dailyNotePath = resolve(dailyDir, `${dateText}.md`);
  const sessionFileName = buildSessionFileName(args, dateText);
  const sessionNotePath = resolve(sessionDir, sessionFileName);

  const summary = args.summary!.trim();
  const doneItems = normalizeDoneItems(await readContent(args.content));
  const backlink = toWikiLink(dailyNotePath, sessionNotePath);
  const noteText = [
    "---",
    "tags:",
    "  - agent-session",
    `date: "${dateText}"`,
    "---",
    "",
    `Daily note: ${backlink}`,
    "",
    summary,
    "",
    doneItems.join("\n"),
    "",
  ].join("\n");

  if (args.dryRun) {
    stdout.write(`Session note: ${sessionNotePath}\n`);
    stdout.write(`Backlink target: ${dailyNotePath}\n`);
    stdout.write("---\n");
    stdout.write(noteText);
    return;
  }

  ensureDailyNote(dailyNotePath, dateText);
  mkdirSync(sessionDir, { recursive: true });
  if (existsSync(sessionNotePath)) {
    fail(`Session note already exists: ${sessionNotePath}`);
  }
  writeFileSync(sessionNotePath, noteText, "utf8");

  stdout.write(`Created session note: ${sessionNotePath}\n`);
  stdout.write(`Backlink target: ${dailyNotePath}\n`);
}

void main();
