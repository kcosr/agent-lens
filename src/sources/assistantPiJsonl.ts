import { readdir, stat } from "node:fs/promises";
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
import { getString, inRange, isRecord, rangesOverlap, stableHash, toIsoTimestamp } from "../utils.js";

const PI_TIMESTAMPED_SESSION_FILE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(.+)\.jsonl$/u;

export function encodePiSessionDir(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/u, "").replace(/[\\/:]/gu, "-")}--`;
}

export function extractPiMessageText(message: Record<string, unknown>, role: "user" | "assistant"): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    if (role === "assistant" && item.type !== "text") continue;
    if (typeof item.text === "string") parts.push(item.text);
    else if (typeof item.result === "string") parts.push(item.result);
  }
  return parts.join("");
}

function piSessionsRoot(options: SourceOptions): string {
  return options.piRoot ?? path.join(process.env.PI_HOME?.trim() || path.join(homedir(), ".pi"), "agent", "sessions");
}

function timestampFromPiFilename(fileName: string): string | null {
  const match = PI_TIMESTAMPED_SESSION_FILE_RE.exec(fileName);
  if (!match) return null;
  return toIsoTimestamp(match[1]?.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/u, "T$1:$2:$3.$4Z"));
}

function sessionIdFromPiFilename(fileName: string): string | null {
  const match = PI_TIMESTAMPED_SESSION_FILE_RE.exec(fileName);
  return match?.[2] ?? null;
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

async function readSessionHeader(filePath: string): Promise<Record<string, unknown> | null> {
  const records = await readJsonlRecordLines(filePath);
  const header = records[0]?.record;
  return header && header.type === "session" ? header : null;
}

export class AssistantPiJsonlSourceAdapter implements AgentLensSourceAdapter {
  id = "assistant-pi-jsonl";
  label = "Assistant Pi JSONL";

  async discover(range: TimeRange, options: SourceOptions): Promise<SourceThread[]> {
    if (options.includeAssistant === false) return [];
    const explicitPath = options.assistantPath;
    const files = explicitPath ? [explicitPath] : await walkJsonlFiles(piSessionsRoot(options));
    const threads: SourceThread[] = [];
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const sessionId = sessionIdFromPiFilename(fileName);
      if (options.assistantSessionId && sessionId !== options.assistantSessionId) continue;

      let stats;
      try {
        stats = await stat(filePath);
      } catch {
        continue;
      }
      const fileCreatedAt = timestampFromPiFilename(fileName);
      const fileUpdatedAt = stats.mtime.toISOString();
      if (!explicitPath && !rangesOverlap(fileCreatedAt ?? fileUpdatedAt, fileUpdatedAt, range)) continue;

      let header: Record<string, unknown> | null = null;
      try {
        header = await readSessionHeader(filePath);
      } catch {
        continue;
      }
      if (!header) continue;
      const cwd = getString(header.cwd) ?? undefined;
      if (options.assistantCwd && cwd !== options.assistantCwd) continue;
      const headerSessionId = getString(header.id) ?? sessionId ?? stableHash(filePath);
      const createdAt = toIsoTimestamp(header.timestamp) ?? fileCreatedAt ?? fileUpdatedAt;
      if (!rangesOverlap(createdAt, fileUpdatedAt, range)) continue;

      threads.push({
        id: `assistant:${headerSessionId}`,
        source: "assistant",
        label: `Assistant ${headerSessionId.slice(0, 8)}`,
        sessionId: headerSessionId,
        cwd,
        createdAt,
        updatedAt: fileUpdatedAt,
        status: "session-file",
        metadata: {
          path: filePath,
          version: header.version,
          parentSession: header.parentSession,
        },
      });
    }
    return threads.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  }

  async load(thread: SourceThread, range: TimeRange): Promise<AgentLensEvent[]> {
    const filePath = getString(thread.metadata?.path);
    if (!filePath) return [];
    const records = await readJsonlRecordLines(filePath);
    const events: AgentLensEvent[] = [];
    const seen = new Set<string>();
    let sequence = 0;

    for (const { record, lineNumber } of records) {
      if (record.type === "session") continue;
      const event = normalizePiRecord(record, {
        lineNumber,
        sequence: sequence++,
        thread,
      });
      if (!event) continue;
      if (!inRange(event.timestamp, range)) continue;
      const key = piDedupeKey(event);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
    return events;
  }
}

function piDedupeKey(event: AgentLensEvent): string {
  const timestampSecond = Math.floor(Date.parse(event.timestamp) / 1000);
  return [
    event.sessionId ?? "",
    event.role,
    event.kind,
    Number.isFinite(timestampSecond) ? timestampSecond : event.timestamp,
    stableHash((event.text ?? "").replace(/\s+/gu, " ").trim()),
  ].join(":");
}

function normalizePiRecord(
  record: Record<string, unknown>,
  context: { lineNumber: number; sequence: number; thread: SourceThread },
): AgentLensEvent | null {
  const timestamp = resolvePiRecordTimestamp(record);
  if (!timestamp) return null;
  const idBase = getString(record.id) ?? `${context.thread.sessionId}:line:${context.lineNumber}`;
  const base = {
    id: `assistant:${idBase}`,
    source: "assistant" as const,
    sessionId: context.thread.sessionId,
    cwd: context.thread.cwd,
    timestamp,
    sequence: context.sequence,
  };

  if (record.type === "message" && isRecord(record.message)) {
    const message = record.message;
    const rawRole = getString(message.role);
    if (rawRole === "user" || rawRole === "assistant") {
      const text = extractPiMessageText(message, rawRole);
      if (!text.trim()) return null;
      return {
        ...base,
        role: rawRole,
        kind: "message",
        text,
        title: rawRole === "user" ? "User message" : "Assistant message",
        metadata: { parentId: record.parentId },
      };
    }
    if (rawRole === "toolResult") return null;
  }

  return null;
}

function resolvePiRecordTimestamp(record: Record<string, unknown>): string | null {
  if (record.type === "message" && isRecord(record.message)) {
    const fromMessage = toIsoTimestamp(record.message.timestamp);
    if (fromMessage) return fromMessage;
  }
  return toIsoTimestamp(record.timestamp);
}
