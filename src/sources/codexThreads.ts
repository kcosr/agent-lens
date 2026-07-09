import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AgentLensEvent,
  AgentLensSourceAdapter,
  SourceNotice,
  SourceOptions,
  SourceThread,
  TimeRange,
} from "../types.js";
import { getString, inRange, isRecord, rangesOverlap, stableHash, toIsoTimestamp } from "../utils.js";

const execFileAsync = promisify(execFile);
export const DEFAULT_CODEX_THREADS_SERVERS = ["main"] as const;

export class CodexThreadsSourceAdapter implements AgentLensSourceAdapter {
  id = "codex-threads";
  label = "Codex Threads";
  notices: SourceNotice[] = [];

  async discover(range: TimeRange, options: SourceOptions): Promise<SourceThread[]> {
    if (options.includeCodexThreads === false) return [];
    this.notices = [];
    const servers = options.codexThreadsServers?.length ? options.codexThreadsServers : DEFAULT_CODEX_THREADS_SERVERS;
    const threads: SourceThread[] = [];
    for (const server of servers) {
      let parsed: unknown;
      try {
        parsed = await runCodexThreadsJson(["list", "--server", server, "--limit", String(options.codexThreadsLimit ?? 100), "--json"]);
      } catch (error) {
        this.notices.push({
          source: this.id,
          severity: "warning",
          message: `Could not list Codex Threads server ${server}: ${error instanceof Error ? error.message : String(error)}`,
          metadata: { server },
        });
        continue;
      }
      if (!isRecord(parsed) || !Array.isArray(parsed.threads)) continue;
      for (const rawThread of parsed.threads) {
        if (!isRecord(rawThread)) continue;
        const createdAt = toIsoTimestamp(rawThread.createdAt);
        const updatedAt = toIsoTimestamp(rawThread.updatedAt);
        if (!rangesOverlap(createdAt ?? updatedAt ?? undefined, updatedAt ?? createdAt ?? undefined, range)) continue;
        threads.push(normalizeCodexThread(rawThread, server));
      }
    }
    return threads.sort((a, b) => (a.updatedAt ?? a.createdAt ?? "").localeCompare(b.updatedAt ?? b.createdAt ?? ""));
  }

  async load(thread: SourceThread, range: TimeRange, options: SourceOptions): Promise<AgentLensEvent[]> {
    if (!thread.server || !thread.threadId) return [];
    let parsed: unknown;
    try {
      parsed = await runCodexThreadsJson([
        "messages",
        "--server",
        thread.server,
        thread.threadId,
        "--since",
        options.codexThreadsSinceLabel ?? "30d",
        "--max-turns",
        String(options.codexThreadsMaxTurns ?? 500),
        "--json",
      ]);
    } catch (error) {
      this.notices.push({
        source: this.id,
        severity: "warning",
        message: `Could not load Codex thread ${thread.threadId}: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { server: thread.server, threadId: thread.threadId },
      });
      return [];
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.messages)) return [];
    const events: AgentLensEvent[] = [];
    let sequence = 0;
    for (const rawMessage of parsed.messages) {
      if (!isRecord(rawMessage)) continue;
      const timestamp = toIsoTimestamp(rawMessage.timestamp) ?? toIsoTimestamp(rawMessage.turnStartedAt) ?? thread.createdAt;
      if (!timestamp || !inRange(timestamp, range)) continue;
      const rawRole = getString(rawMessage.role) ?? "assistant";
      if (rawRole === "tool" || rawRole === "toolResult") continue;
      if (rawRole !== "user" && rawRole !== "assistant") continue;
      const role = rawRole;
      const text = getString(rawMessage.text) ?? getString(rawMessage.content) ?? JSON.stringify(rawMessage, null, 2);
      const itemId = getString(rawMessage.itemId) ?? getString(rawMessage.id) ?? stableHash(`${thread.threadId}:${sequence}:${text}`);
      events.push({
        id: `codex:${thread.server}:${thread.threadId}:${itemId}`,
        source: "codex-threads",
        server: thread.server,
        threadId: thread.threadId,
        sessionId: thread.sessionId,
        cwd: thread.cwd,
        timestamp,
        sequence: sequence++,
        role,
        kind: "message",
        text,
        title: role === "user" ? "User message" : role === "assistant" ? "Agent message" : rawRole,
        metadata: {
          turnId: rawMessage.turnId,
          turnStartedAt: toIsoTimestamp(rawMessage.turnStartedAt),
          turnCompletedAt: toIsoTimestamp(rawMessage.turnCompletedAt),
        },
      });
    }
    return events;
  }
}

export function normalizeCodexThread(rawThread: Record<string, unknown>, server: string): SourceThread {
  const id = getString(rawThread.id) ?? getString(rawThread.sessionId) ?? stableHash(JSON.stringify(rawThread));
  return {
    id: `codex:${server}:${id}`,
    source: "codex-threads",
    label: getString(rawThread.name) ?? `Codex ${id.slice(0, 8)}`,
    server,
    threadId: id,
    sessionId: getString(rawThread.sessionId) ?? id,
    cwd: getString(rawThread.cwd) ?? undefined,
    createdAt: toIsoTimestamp(rawThread.createdAt) ?? undefined,
    updatedAt: toIsoTimestamp(rawThread.updatedAt) ?? undefined,
    preview: getString(rawThread.preview) ?? undefined,
    status: statusText(rawThread.status),
  };
}

async function runCodexThreadsJson(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync("codex-threads", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function statusText(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return getString(value.type) ?? undefined;
}
