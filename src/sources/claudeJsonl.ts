import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { readJsonlRecordLines } from "../jsonl.js";
import type {
  AgentLensEvent,
  AgentLensSourceAdapter,
  SourceOptions,
  SourceThread,
  TimeRange,
} from "../types.js";
import { getString, inRange, isRecord, rangesOverlap, timestampMillis, toIsoTimestamp } from "../utils.js";

type ClaudeIndexEntry = {
  sessionId?: string;
  fullPath?: string;
  projectPath?: string;
  created?: unknown;
  modified?: unknown;
  fileMtime?: unknown;
  gitBranch?: string;
  messageCount?: number;
  isSidechain?: boolean;
  summary?: string;
};

type ClaudeSessionSummary = {
  sessionId: string;
  cwd?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  title?: string | undefined;
};

export class ClaudeJsonlSourceAdapter implements AgentLensSourceAdapter {
  id = "claude-jsonl";
  label = "Claude JSONL";

  async discover(range: TimeRange, options: SourceOptions): Promise<SourceThread[]> {
    if (options.includeClaude === false) return [];
    const explicitPath = options.claudePath;
    const files = explicitPath ? [explicitPath] : await walkJsonlFiles(claudeProjectsRoot(options));
    const indexCache = new Map<string, Map<string, ClaudeIndexEntry>>();
    const threads: SourceThread[] = [];

    for (const filePath of files) {
      const sessionId = path.basename(filePath, ".jsonl");
      if (options.claudeSessionId && sessionId !== options.claudeSessionId) continue;

      let stats;
      try {
        stats = await stat(filePath);
      } catch {
        continue;
      }

      const fileUpdatedAt = stats.mtime.toISOString();
      const indexEntry = explicitPath ? undefined : await indexedSession(filePath, indexCache);
      const indexedStart = toIsoTimestamp(indexEntry?.created);
      const indexedEnd = toIsoTimestamp(indexEntry?.modified) ?? toIsoTimestamp(indexEntry?.fileMtime);
      const indexedRangeStart = indexedStart ?? indexedEnd ?? undefined;
      const indexedRangeEnd = indexedEnd ?? indexedStart ?? undefined;
      if (!explicitPath && indexEntry && !rangesOverlap(indexedRangeStart, indexedRangeEnd, range)) {
        continue;
      }
      if (!explicitPath && !indexEntry && isDefinitelyBeforeRange(fileUpdatedAt, range)) continue;
      if (options.claudeCwd && indexEntry?.projectPath && indexEntry.projectPath !== options.claudeCwd) continue;

      const summary = await readClaudeSessionSummary(filePath, sessionId);
      const cwd = summary.cwd ?? indexEntry?.projectPath;
      if (options.claudeCwd && cwd !== options.claudeCwd) continue;
      const createdAt = summary.createdAt ?? indexedStart ?? fileUpdatedAt;
      const updatedAt = summary.updatedAt ?? indexedEnd ?? fileUpdatedAt;
      if (!rangesOverlap(createdAt, updatedAt, range)) continue;

      threads.push({
        id: `claude:${summary.sessionId}`,
        source: "claude",
        label: summary.title ?? `Claude ${summary.sessionId.slice(0, 8)}`,
        sessionId: summary.sessionId,
        cwd,
        createdAt,
        updatedAt,
        status: "session-file",
        metadata: {
          path: filePath,
          projectPath: indexEntry?.projectPath,
          gitBranch: indexEntry?.gitBranch,
          messageCount: indexEntry?.messageCount,
          isSidechain: indexEntry?.isSidechain,
        },
      });
    }

    return threads.sort((a, b) => (a.createdAt ?? a.updatedAt ?? "").localeCompare(b.createdAt ?? b.updatedAt ?? ""));
  }

  async load(thread: SourceThread, range: TimeRange): Promise<AgentLensEvent[]> {
    const filePath = getString(thread.metadata?.path);
    if (!filePath) return [];
    const records = await readJsonlRecordLines(filePath);
    const events: AgentLensEvent[] = [];
    let sequence = 0;

    for (const { record, lineNumber } of records) {
      const event = normalizeClaudeRecord(record, {
        lineNumber,
        sequence: sequence++,
        thread,
      });
      if (!event) continue;
      if (!inRange(event.timestamp, range)) continue;
      events.push(event);
    }

    return events;
  }
}

function claudeProjectsRoot(options: SourceOptions): string {
  return options.claudeRoot ?? path.join(homedir(), ".claude", "projects");
}

async function walkJsonlFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(child);
      } else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".jsonl")) {
        files.push(child);
      }
    }
  }
  await walk(root);
  return files;
}

async function indexedSession(
  filePath: string,
  cache: Map<string, Map<string, ClaudeIndexEntry>>,
): Promise<ClaudeIndexEntry | undefined> {
  const projectDir = path.dirname(filePath);
  let index = cache.get(projectDir);
  if (!index) {
    index = await readSessionsIndex(projectDir);
    cache.set(projectDir, index);
  }
  return index.get(filePath) ?? index.get(path.basename(filePath, ".jsonl"));
}

async function readSessionsIndex(projectDir: string): Promise<Map<string, ClaudeIndexEntry>> {
  const result = new Map<string, ClaudeIndexEntry>();
  let records: unknown;
  try {
    const file = await readFile(path.join(projectDir, "sessions-index.json"), "utf8");
    records = JSON.parse(file);
  } catch {
    return result;
  }
  if (!isRecord(records) || !Array.isArray(records.entries)) return result;
  for (const entry of records.entries) {
    if (!isRecord(entry)) continue;
    const normalized: ClaudeIndexEntry = {
      created: entry.created,
      modified: entry.modified,
      fileMtime: entry.fileMtime,
    };
    const sessionId = getString(entry.sessionId);
    const fullPath = getString(entry.fullPath);
    const projectPath = getString(entry.projectPath);
    const gitBranch = getString(entry.gitBranch);
    const summary = getString(entry.summary);
    if (sessionId) normalized.sessionId = sessionId;
    if (fullPath) normalized.fullPath = fullPath;
    if (projectPath) normalized.projectPath = projectPath;
    if (gitBranch) normalized.gitBranch = gitBranch;
    if (typeof entry.messageCount === "number") normalized.messageCount = entry.messageCount;
    if (typeof entry.isSidechain === "boolean") normalized.isSidechain = entry.isSidechain;
    if (summary) normalized.summary = summary;
    if (normalized.fullPath) result.set(normalized.fullPath, normalized);
    if (normalized.sessionId) result.set(normalized.sessionId, normalized);
  }
  return result;
}

function isDefinitelyBeforeRange(timestamp: string, range: TimeRange): boolean {
  const since = timestampMillis(range.since);
  const value = timestampMillis(timestamp);
  return since !== null && value !== null && value < since;
}

async function readClaudeSessionSummary(filePath: string, fallbackSessionId: string): Promise<ClaudeSessionSummary> {
  const records = await readJsonlRecordLines(filePath);
  let sessionId = fallbackSessionId;
  let cwd: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let title: string | undefined;

  for (const { record } of records) {
    sessionId = getString(record.sessionId) ?? sessionId;
    cwd = cwd ?? getString(record.cwd) ?? undefined;
    const timestamp = toIsoTimestamp(record.timestamp);
    if (timestamp) {
      createdAt = createdAt ?? timestamp;
      updatedAt = timestamp;
    }
    if (record.type === "custom-title") title = getString(record.customTitle) ?? title;
    if (record.type === "ai-title") title = title ?? getString(record.aiTitle) ?? undefined;
  }

  return { sessionId, cwd, createdAt, updatedAt, title };
}

function normalizeClaudeRecord(
  record: Record<string, unknown>,
  context: { lineNumber: number; sequence: number; thread: SourceThread },
): AgentLensEvent | null {
  const timestamp = toIsoTimestamp(record.timestamp);
  if (!timestamp) return null;
  if (record.type !== "user" && record.type !== "assistant") return null;
  if (!isRecord(record.message)) return null;
  const rawRole = getString(record.message.role);
  if (rawRole !== "user" && rawRole !== "assistant") return null;
  const text = rawRole === "user" ? extractClaudeUserText(record.message.content) : extractClaudeAssistantText(record.message.content);
  if (!text.trim()) return null;
  const idBase = getString(record.uuid) ?? `${context.thread.sessionId}:line:${context.lineNumber}`;

  return {
    id: `claude:${context.thread.sessionId}:${idBase}`,
    source: "claude",
    sessionId: context.thread.sessionId,
    cwd: context.thread.cwd,
    timestamp,
    sequence: context.sequence,
    role: rawRole,
    kind: "message",
    text,
    title: rawRole === "user" ? "User message" : "Assistant message",
    metadata: {
      parentUuid: record.parentUuid,
      requestId: record.requestId,
    },
  };
}

function extractClaudeUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

function extractClaudeAssistantText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}
