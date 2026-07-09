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
import { getString, inRange, isRecord, rangesOverlap, sortByTimestamp, stableHash, timestampMillis, toIsoTimestamp } from "../utils.js";

const CODEX_ROLLOUT_FILE_RE = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/u;

type CodexSessionSummary = {
  threadId: string;
  cwd?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  preview?: string | undefined;
  originator?: string | undefined;
  cliVersion?: string | undefined;
  source?: string | undefined;
  threadSource?: string | undefined;
  modelProvider?: string | undefined;
};

type CodexSessionSegment = {
  filePath: string;
  summary: CodexSessionSummary;
  createdAt: string;
  updatedAt: string;
};

type CandidateEvent = AgentLensEvent & {
  metadata: Record<string, unknown> & {
    recordType?: string;
    payloadType?: string;
  };
};

export class CodexJsonlSourceAdapter implements AgentLensSourceAdapter {
  id = "codex-jsonl";
  label = "Codex JSONL";

  async discover(range: TimeRange, options: SourceOptions): Promise<SourceThread[]> {
    if (options.includeCodex === false) return [];
    const explicitPath = options.codexPath;
    const files = explicitPath ? [explicitPath] : await walkJsonlFiles(codexSessionsRoot(options));
    const segmentsByThreadId = new Map<string, CodexSessionSegment[]>();

    for (const filePath of files) {
      let stats;
      try {
        stats = await stat(filePath);
      } catch {
        continue;
      }

      const fileNameThreadId = threadIdFromCodexFilename(path.basename(filePath));
      const fileUpdatedAt = stats.mtime.toISOString();
      if (!explicitPath && isDefinitelyBeforeRange(fileUpdatedAt, range)) continue;

      let summary: CodexSessionSummary;
      try {
        summary = await readCodexSessionSummary(filePath, fileNameThreadId ?? stableHash(filePath));
      } catch {
        continue;
      }

      if (options.codexThreadId && summary.threadId !== options.codexThreadId) continue;
      if (options.codexCwd && summary.cwd !== options.codexCwd) continue;

      const createdAt = summary.createdAt ?? fileUpdatedAt;
      const updatedAt = summary.updatedAt ?? fileUpdatedAt;
      if (!rangesOverlap(createdAt, updatedAt, range)) continue;

      const segments = segmentsByThreadId.get(summary.threadId) ?? [];
      segments.push({ filePath, summary, createdAt, updatedAt });
      segmentsByThreadId.set(summary.threadId, segments);
    }

    return [...segmentsByThreadId.values()]
      .map(createCodexThread)
      .sort((a, b) => (a.createdAt ?? a.updatedAt ?? "").localeCompare(b.createdAt ?? b.updatedAt ?? ""));
  }

  async load(thread: SourceThread, range: TimeRange): Promise<AgentLensEvent[]> {
    const paths = getStringArray(thread.metadata?.paths);
    if (paths.length === 0 || !thread.threadId) return [];

    const candidates: CandidateEvent[] = [];
    let sequence = 0;
    for (const filePath of paths) {
      const records = await readJsonlRecordLines(filePath);
      let currentTurnId: string | undefined;

      for (const { record, lineNumber } of records) {
        const timestamp = toIsoTimestamp(record.timestamp);
        if (!timestamp) continue;

        if (record.type === "event_msg" && isRecord(record.payload)) {
          const payload = record.payload;
          const payloadType = getString(payload.type);
          if (payloadType === "task_started") {
            currentTurnId = getString(payload.turn_id) ?? currentTurnId;
            continue;
          }
          if (payloadType === "task_complete") {
            if (getString(payload.turn_id) === currentTurnId) currentTurnId = undefined;
            continue;
          }
          // Codex response_item user messages include injected context; event_msg is the user-authored prompt.
          const role = payloadType === "user_message" ? "user" : payloadType === "agent_message" ? "assistant" : null;
          const text = getString(payload.message);
          if (!role || !text || !inRange(timestamp, range)) continue;
          candidates.push(codexEvent(record, thread, { lineNumber, sequence: sequence++, timestamp, role, text, currentTurnId }));
          continue;
        }

        if (record.type === "response_item" && isRecord(record.payload)) {
          const payload = record.payload;
          if (payload.type !== "message" || payload.role !== "assistant") continue;
          const text = extractTextFromContent(payload.content);
          if (!text || !inRange(timestamp, range)) continue;
          candidates.push(codexEvent(record, thread, { lineNumber, sequence: sequence++, timestamp, role: "assistant", text, currentTurnId }));
        }
      }
    }

    return sortByTimestamp(removeDuplicateAgentMessages(removeDuplicateEvents(candidates)));
  }
}

function createCodexThread(segments: CodexSessionSegment[]): SourceThread {
  const ordered = [...segments].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.updatedAt.localeCompare(right.updatedAt) || left.filePath.localeCompare(right.filePath),
  );
  const first = ordered[0]!;
  const latest = [...ordered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]!;
  const threadId = first.summary.threadId;
  const preview = firstString(ordered.map((segment) => segment.summary.preview));

  return {
    id: `codex:${threadId}`,
    source: "codex",
    label: preview ? `Codex: ${preview.slice(0, 64)}` : `Codex ${threadId.slice(0, 8)}`,
    threadId,
    sessionId: threadId,
    cwd: firstString(ordered.map((segment) => segment.summary.cwd)),
    createdAt: earliestTimestamp(ordered.map((segment) => segment.createdAt)),
    updatedAt: latest.updatedAt,
    preview,
    status: "session-file",
    metadata: {
      paths: ordered.map((segment) => segment.filePath),
      originator: latest.summary.originator ?? first.summary.originator,
      cliVersion: latest.summary.cliVersion ?? first.summary.cliVersion,
      source: latest.summary.source ?? first.summary.source,
      threadSource: latest.summary.threadSource ?? first.summary.threadSource,
      modelProvider: latest.summary.modelProvider ?? first.summary.modelProvider,
    },
  };
}

function codexSessionsRoot(options: SourceOptions): string {
  return options.codexRoot ?? path.join(homedir(), ".codex", "sessions");
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

function threadIdFromCodexFilename(fileName: string): string | null {
  const match = CODEX_ROLLOUT_FILE_RE.exec(fileName);
  return match?.[1] ?? null;
}

function isDefinitelyBeforeRange(timestamp: string, range: TimeRange): boolean {
  const since = timestampMillis(range.since);
  const value = timestampMillis(timestamp);
  return since !== null && value !== null && value < since;
}

async function readCodexSessionSummary(filePath: string, fallbackThreadId: string): Promise<CodexSessionSummary> {
  const records = await readJsonlRecordLines(filePath);
  let threadId = fallbackThreadId;
  let cwd: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let preview: string | undefined;
  let originator: string | undefined;
  let cliVersion: string | undefined;
  let source: string | undefined;
  let threadSource: string | undefined;
  let modelProvider: string | undefined;

  for (const { record } of records) {
    const timestamp = toIsoTimestamp(record.timestamp);
    if (timestamp) {
      createdAt = createdAt ?? timestamp;
      updatedAt = timestamp;
    }
    if (record.type === "session_meta" && isRecord(record.payload)) {
      const payload = record.payload;
      threadId = getString(payload.id) ?? threadId;
      cwd = cwd ?? getString(payload.cwd) ?? undefined;
      createdAt = toIsoTimestamp(payload.timestamp) ?? createdAt;
      originator = getString(payload.originator) ?? originator;
      cliVersion = getString(payload.cli_version) ?? cliVersion;
      source = getString(payload.source) ?? source;
      threadSource = getString(payload.thread_source) ?? threadSource;
      modelProvider = getString(payload.model_provider) ?? modelProvider;
    }
    if (!preview && record.type === "event_msg" && isRecord(record.payload) && record.payload.type === "user_message") {
      preview = getString(record.payload.message) ?? undefined;
    }
  }

  return { threadId, cwd, createdAt, updatedAt, preview, originator, cliVersion, source, threadSource, modelProvider };
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

function codexEvent(
  record: Record<string, unknown>,
  thread: SourceThread,
  context: {
    lineNumber: number;
    sequence: number;
    timestamp: string;
    role: "user" | "assistant";
    text: string;
    currentTurnId?: string | undefined;
  },
): CandidateEvent {
  const payload = isRecord(record.payload) ? record.payload : {};
  const itemId =
    getString(payload.id) ??
    getString(payload.item_id) ??
    getString(payload.call_id) ??
    `event:${stableHash(`${context.role}:${context.timestamp}:${context.currentTurnId ?? ""}:${context.text}`)}`;
  const metadata: CandidateEvent["metadata"] = {
    lineNumber: context.lineNumber,
  };
  const recordType = getString(record.type);
  const payloadType = getString(payload.type);
  if (recordType) metadata.recordType = recordType;
  if (payloadType) metadata.payloadType = payloadType;
  if (context.currentTurnId) metadata.turnId = context.currentTurnId;
  return {
    id: `codex:${thread.threadId}:${itemId}:${stableHash(context.text)}`,
    source: "codex",
    threadId: thread.threadId,
    sessionId: thread.sessionId,
    cwd: thread.cwd,
    timestamp: context.timestamp,
    sequence: context.sequence,
    role: context.role,
    kind: "message",
    text: context.text,
    title: context.role === "user" ? "User message" : "Agent message",
    metadata,
  };
}

function removeDuplicateAgentMessages(events: CandidateEvent[]): AgentLensEvent[] {
  const responseKeys = new Set<string>();
  for (const event of events) {
    const key = agentMessageKey(event);
    if (key && event.role === "assistant" && event.metadata.recordType === "response_item") {
      responseKeys.add(key);
    }
  }
  return events.filter((event) => {
    if (event.role !== "assistant" || event.metadata.recordType !== "event_msg") return true;
    const key = agentMessageKey(event);
    return !key || !responseKeys.has(key);
  });
}

function agentMessageKey(event: CandidateEvent): string | null {
  const turnId = getString(event.metadata.turnId);
  return turnId ? `${turnId}:${event.text}` : null;
}

function removeDuplicateEvents(events: CandidateEvent[]): CandidateEvent[] {
  const ids = new Set<string>();
  return events.filter((event) => {
    if (ids.has(event.id)) return false;
    ids.add(event.id);
    return true;
  });
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function firstString(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.length > 0);
}

function earliestTimestamp(values: string[]): string {
  return values.reduce((earliest, value) => (value < earliest ? value : earliest));
}
