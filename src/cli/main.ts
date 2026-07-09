#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAnnotations } from "../annotations.js";
import { buildReport, mergeReportAnnotations, resolveCollectionOptions } from "../report.js";
import { renderHtmlReport } from "../renderHtml.js";
import { redactValue } from "../redact.js";
import { createBasicAnnotations } from "../summarize.js";
import type {
  AgentLensAnnotation,
  AgentLensAnnotationKind,
  AgentLensEvent,
  AgentLensReport,
  SourceOptions,
  SourceThread,
  TimeRange,
} from "../types.js";
import { stableHash } from "../utils.js";

type ParsedArgs = {
  command?: string | undefined;
  flags: Map<string, string[]>;
};

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command;
  if (!command || parsed.flags.has("help") || parsed.flags.has("h")) {
    printHelp();
    return;
  }
  if (command === "report") {
    const options = parseCollectionOptions(parsed);
    const out = requiredFlag(parsed, "out");
    const report = await buildReport(options);
    await writeText(out, renderHtmlReport(report));
    process.stderr.write(`Wrote ${out}\n`);
    return;
  }
  if (command === "export") {
    const options = parseCollectionOptions(parsed);
    const out = requiredFlag(parsed, "out");
    const report = await buildReport(options);
    await writeJson(out, report);
    process.stderr.write(`Wrote ${out}\n`);
    return;
  }
  if (command === "render") {
    const input = requiredFlag(parsed, "input");
    const out = requiredFlag(parsed, "out");
    const report = await readReport(input);
    const annotations = await loadAnnotations(optionalFlag(parsed, "annotations"));
    const merged = annotations.length > 0 ? mergeReportAnnotations(report, annotations) : report;
    const finalReport = merged.metadata.redactionEnabled ? redactValue(merged) : merged;
    await writeText(out, renderHtmlReport(finalReport));
    process.stderr.write(`Wrote ${out}\n`);
    return;
  }
  if (command === "annotate") {
    const input = requiredFlag(parsed, "input");
    const out = requiredFlag(parsed, "out");
    const report = await readReport(input);
    const annotations = createBasicAnnotations(report);
    await writeJson(out, { annotations });
    process.stderr.write(`Wrote ${out}\n`);
    return;
  }
  if (command === "threads") {
    const input = requiredFlag(parsed, "input");
    const format = optionalFlag(parsed, "format") ?? "text";
    const report = await readReport(input);
    const summaries = threadSummaries(report);
    if (format === "json") {
      process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
    } else {
      process.stdout.write(formatThreadSummaries(summaries));
    }
    return;
  }
  if (command === "thread") {
    const input = requiredFlag(parsed, "input");
    const ref = requiredFlag(parsed, "thread");
    const format = optionalFlag(parsed, "format") ?? "text";
    const report = await readReport(input);
    const resolved = resolveThreadRef(report, ref);
    if (format === "json") {
      process.stdout.write(
        `${JSON.stringify({ index: resolved.index, thread: resolved.thread, events: resolved.events }, null, 2)}\n`,
      );
    } else {
      process.stdout.write(formatThreadTranscript(resolved.index, resolved.thread, resolved.events));
    }
    return;
  }
  if (command === "annotation-add") {
    const annotationsPath = requiredFlag(parsed, "annotations");
    const report = optionalFlag(parsed, "input") ? await readReport(requiredFlag(parsed, "input")) : null;
    const existing = await loadAnnotations(annotationsPath).catch(() => []);
    const annotation = await buildAnnotationFromArgs(parsed, report);
    await writeJson(annotationsPath, { annotations: [...existing, annotation] });
    process.stderr.write(`Wrote ${annotationsPath}\n`);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags = new Map<string, string[]>();
  let command: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (!command && !arg.startsWith("-")) {
      command = arg;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");
    const key = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    const inlineValue = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;
    const value =
      inlineValue ??
      (args[index + 1] && !args[index + 1]?.startsWith("-") ? args[++index] : "true");
    const values = flags.get(key) ?? [];
    values.push(value ?? "true");
    flags.set(key, values);
  }
  return { command, flags };
}

export function parseCollectionOptions(parsed: ParsedArgs): SourceOptions & { range: TimeRange; annotationsPath?: string; redaction?: boolean } {
  const range: TimeRange = {};
  const since = optionalFlag(parsed, "since") ?? defaultSince();
  const until = optionalFlag(parsed, "until");
  if (since) range.since = since;
  if (until) range.until = until;
  const options: SourceOptions & { range: TimeRange; annotationsPath?: string; redaction?: boolean } = {
    range,
    codexThreadsServers: allFlags(parsed, "codex-threads-server"),
  };
  setString(options, "codexRoot", optionalFlag(parsed, "codex-root"));
  setString(options, "codexPath", optionalFlag(parsed, "codex-path"));
  setString(options, "codexThreadId", optionalFlag(parsed, "codex-thread"));
  setString(options, "codexCwd", optionalFlag(parsed, "codex-cwd"));
  setNumber(options, "codexThreadsLimit", optionalFlag(parsed, "codex-threads-limit"));
  setNumber(options, "codexThreadsMaxTurns", optionalFlag(parsed, "codex-threads-max-turns"));
  setString(options, "codexThreadsSinceLabel", optionalFlag(parsed, "codex-threads-since"));
  if (hasAnyFlag(parsed, [
    "codex-threads-server",
    "codex-threads-limit",
    "codex-threads-max-turns",
    "codex-threads-since",
  ])) {
    options.includeCodexThreads = true;
  }
  setString(options, "piRoot", optionalFlag(parsed, "pi-root"));
  setString(options, "assistantCwd", optionalFlag(parsed, "assistant-cwd"));
  setString(options, "assistantSessionId", optionalFlag(parsed, "assistant-session"));
  setString(options, "assistantPath", optionalFlag(parsed, "assistant-path"));
  setString(options, "claudeRoot", optionalFlag(parsed, "claude-root"));
  setString(options, "claudeCwd", optionalFlag(parsed, "claude-cwd"));
  setString(options, "claudeSessionId", optionalFlag(parsed, "claude-session"));
  setString(options, "claudePath", optionalFlag(parsed, "claude-path"));
  setString(options, "annotationsPath", optionalFlag(parsed, "annotations"));
  if (parsed.flags.has("no-assistant")) options.includeAssistant = false;
  if (parsed.flags.has("no-claude")) options.includeClaude = false;
  if (parsed.flags.has("no-codex")) options.includeCodex = false;
  if (parsed.flags.has("no-codex-threads")) options.includeCodexThreads = false;
  if (parsed.flags.has("include-artifacts")) options.includeArtifacts = true;
  if (parsed.flags.has("no-redaction")) options.redaction = false;
  return resolveCollectionOptions(options);
}

function allFlags(parsed: ParsedArgs, key: string): string[] {
  return (parsed.flags.get(key) ?? []).filter((value) => value !== "true");
}

function optionalFlag(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.flags.get(key)?.at(-1);
  return value && value !== "true" ? value : undefined;
}

function hasAnyFlag(parsed: ParsedArgs, keys: string[]): boolean {
  return keys.some((key) => parsed.flags.has(key));
}

function requiredFlag(parsed: ParsedArgs, key: string): string {
  const value = optionalFlag(parsed, key);
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function setString<T, K extends keyof T>(target: T, key: K, value: string | undefined): void {
  if (value !== undefined) target[key] = value as T[K];
}

function setNumber<T, K extends keyof T>(target: T, key: K, value: string | undefined): void {
  if (value === undefined) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${String(key)} must be a positive number`);
  target[key] = parsed as T[K];
}

function defaultSince(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

async function readReport(input: string): Promise<AgentLensReport> {
  const raw = await readFile(input, "utf8");
  const parsed = JSON.parse(raw) as AgentLensReport;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.events)) {
    throw new Error("input is not an Agent Lens report JSON file");
  }
  return parsed;
}

type ThreadSummary = {
  index: number;
  key: string;
  label: string;
  source: string;
  server?: string | undefined;
  cwd?: string | undefined;
  eventCount: number;
  userCount: number;
  assistantCount: number;
  firstTimestamp?: string | undefined;
  lastTimestamp?: string | undefined;
};

function threadKey(thread: SourceThread): string {
  return conversationKey(thread.source, thread.server, thread.threadId ?? thread.sessionId ?? thread.id);
}

function eventThreadKey(event: AgentLensEvent): string {
  return conversationKey(event.source, event.server, event.threadId ?? event.sessionId ?? event.id);
}

function conversationKey(source: string, server: string | undefined, id: string): string {
  return source === "codex-threads" ? `codex:${server ?? ""}:${id}` : `${source}:${id}`;
}

export function threadSummaries(report: AgentLensReport): ThreadSummary[] {
  return report.threads.map((thread, index) => {
    const key = threadKey(thread);
    const events = report.events.filter((event) => eventThreadKey(event) === key);
    return {
      index,
      key,
      label: thread.label,
      source: thread.source,
      server: thread.server,
      cwd: thread.cwd,
      eventCount: events.length,
      userCount: events.filter((event) => event.role === "user").length,
      assistantCount: events.filter((event) => event.role === "assistant").length,
      firstTimestamp: events[0]?.timestamp,
      lastTimestamp: events.at(-1)?.timestamp,
    };
  });
}

function formatThreadSummaries(summaries: ThreadSummary[]): string {
  if (summaries.length === 0) return "No threads or sessions found.\n";
  const lines = ["INDEX  EVENTS  USER  ASSISTANT  SOURCE          SERVER     KEY       LABEL"];
  for (const summary of summaries) {
    lines.push(
      [
        String(summary.index).padEnd(5),
        String(summary.eventCount).padStart(6),
        String(summary.userCount).padStart(5),
        String(summary.assistantCount).padStart(9),
        summary.source.padEnd(14),
        (summary.server ?? "").padEnd(9),
        summary.key.slice(0, 8).padEnd(8),
        summary.label,
      ].join("  "),
    );
  }
  return `${lines.join("\n")}\n`;
}

function resolveThreadRef(
  report: AgentLensReport,
  ref: string,
): { index: number; thread: SourceThread; events: AgentLensEvent[] } {
  const index = /^\d+$/u.test(ref) ? Number(ref) : -1;
  const thread =
    index >= 0
      ? report.threads[index]
      : report.threads.find((candidate) => {
          const key = threadKey(candidate);
          return candidate.id === ref || key === ref || key.startsWith(ref);
        });
  if (!thread) throw new Error(`thread not found: ${ref}`);
  const resolvedIndex = report.threads.indexOf(thread);
  const key = threadKey(thread);
  return {
    index: resolvedIndex,
    thread,
    events: report.events.filter((event) => eventThreadKey(event) === key),
  };
}

function resolveEventRef(report: AgentLensReport, ref: string): { index: number; event: AgentLensEvent } {
  const index = /^\d+$/u.test(ref) ? Number(ref) : -1;
  const event =
    index >= 0
      ? report.events[index]
      : report.events.find((candidate) => candidate.id === ref || candidate.id.startsWith(ref));
  if (!event) throw new Error(`event not found: ${ref}`);
  return { index: report.events.indexOf(event), event };
}

function formatThreadTranscript(index: number, thread: SourceThread, events: AgentLensEvent[]): string {
  const lines = [
    `Thread ${index}: ${thread.label}`,
    `Key: ${threadKey(thread)}`,
    `Source: ${thread.source}${thread.server ? ` / ${thread.server}` : ""}`,
    thread.cwd ? `Cwd: ${thread.cwd}` : null,
    `Events: ${events.length}`,
    "",
  ].filter((line): line is string => line !== null);
  for (const event of events) {
    const globalIndex = events.indexOf(event);
    lines.push(`[${globalIndex}] ${event.timestamp} ${event.role} ${event.id}`);
    lines.push(event.text ?? "");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function buildAnnotationFromArgs(
  parsed: ParsedArgs,
  report: AgentLensReport | null,
): Promise<AgentLensAnnotation> {
  const markdown = await readMarkdownArg(parsed);
  const kind = parseAnnotationKind(optionalFlag(parsed, "kind") ?? "note");
  const title = optionalFlag(parsed, "title");
  const author = optionalFlag(parsed, "author") ?? "user";
  const explicitId = optionalFlag(parsed, "id");
  const threadRef = optionalFlag(parsed, "thread");
  const eventRef = optionalFlag(parsed, "event");
  const timestamp = optionalFlag(parsed, "timestamp");
  const placement = parsePlacement(optionalFlag(parsed, "placement"));
  const base: AgentLensAnnotation = {
    id: explicitId ?? `annotation-${stableHash(`${kind}:${title ?? ""}:${markdown}:${Date.now()}`)}`,
    kind,
    markdown,
    author,
    placement: placement ?? (threadRef ? "sidebar" : eventRef ? "after" : timestamp ? "before" : "sidebar"),
  };
  if (title) base.title = title;

  if (threadRef) {
    if (!report) throw new Error("--input is required when using --thread");
    const resolved = resolveThreadRef(report, threadRef);
    const first = resolved.events[0];
    const last = resolved.events.at(-1);
    base.range = {};
    if (first) {
      base.range.startEventId = first.id;
      base.range.start = first.timestamp;
    }
    if (last) {
      base.range.endEventId = last.id;
      base.range.end = last.timestamp;
    }
    base.metadata = {
      ...(base.metadata ?? {}),
      threadIndex: resolved.index,
      threadId: resolved.thread.threadId,
      sessionId: resolved.thread.sessionId,
      source: resolved.thread.source,
      server: resolved.thread.server,
      cwd: resolved.thread.cwd,
    };
  }

  if (eventRef) {
    if (!report) throw new Error("--input is required when using --event");
    const resolved = resolveEventRef(report, eventRef);
    base.anchorEventId = resolved.event.id;
    base.timestamp = resolved.event.timestamp;
    base.metadata = {
      ...(base.metadata ?? {}),
      eventIndex: resolved.index,
      eventRole: resolved.event.role,
      source: resolved.event.source,
      threadId: resolved.event.threadId,
      sessionId: resolved.event.sessionId,
    };
  }

  if (timestamp) base.timestamp = timestamp;
  return base;
}

async function readMarkdownArg(parsed: ParsedArgs): Promise<string> {
  const markdown = optionalFlag(parsed, "markdown");
  const markdownFile = optionalFlag(parsed, "markdown-file");
  if (markdownFile) return readFile(markdownFile, "utf8");
  if (markdown) return markdown;
  throw new Error("--markdown or --markdown-file is required");
}

function parseAnnotationKind(value: string): AgentLensAnnotationKind {
  const allowed: AgentLensAnnotationKind[] = [
    "summary",
    "section",
    "note",
    "decision",
    "artifact",
    "warning",
    "followup",
  ];
  if (allowed.includes(value as AgentLensAnnotationKind)) return value as AgentLensAnnotationKind;
  throw new Error(`unsupported annotation kind: ${value}`);
}

function parsePlacement(value: string | undefined): AgentLensAnnotation["placement"] | undefined {
  if (!value) return undefined;
  if (value === "before" || value === "after" || value === "inline" || value === "sidebar") return value;
  throw new Error(`unsupported placement: ${value}`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

function printHelp(): void {
  process.stdout.write(`Agent Lens

Usage:
  agent-lens report --since <iso> --until <iso> --codex-cwd /repo --out report.html
  agent-lens export --since <iso> --out report.json
  agent-lens render --input report.json --annotations annotations.json --out report.html
  agent-lens annotate --input report.json --out annotations.json
  agent-lens threads --input report.json
  agent-lens thread --input report.json --thread <index-or-id>
  agent-lens annotation-add --input report.json --annotations annotations.json --thread <index-or-id> --kind summary --markdown-file summary.md

Collection options:
  --since <iso>                 Start time. Defaults to 24 hours ago.
  --until <iso>                 End time. Defaults to now.
  --codex-root <path>           Codex sessions root. Defaults to ~/.codex/sessions.
  --codex-path <path>           Parse one Codex rollout JSONL file.
  --codex-thread <id>           Filter discovered Codex JSONL files by thread id.
  --codex-cwd <cwd>             Filter discovered Codex JSONL files by cwd.
  --codex-threads-server <alias>
                                Enable Codex Threads CLI source. Repeatable. Defaults to main.
  --codex-threads-limit <n>     Threads to list per server. Defaults to 100.
  --codex-threads-since <label> Label passed to codex-threads messages. Defaults to 30d.
  --codex-threads-max-turns <n> Max turns per Codex thread. Defaults to 500.
  --assistant-path <path>       Parse one Pi JSONL file.
  --assistant-session <id>      Filter discovered Pi JSONL files by session id.
  --assistant-cwd <cwd>         Filter discovered Pi JSONL files by cwd.
  --pi-root <path>              Pi sessions root. Defaults to $PI_HOME/agent/sessions or ~/.pi/agent/sessions.
  --claude-path <path>          Parse one Claude JSONL file.
  --claude-session <id>         Filter discovered Claude JSONL files by session id.
  --claude-cwd <cwd>            Filter discovered Claude JSONL files by cwd/project path.
  --claude-root <path>          Claude projects root. Defaults to ~/.claude/projects.
  --annotations <path>          JSON or Markdown sidecar.
  --include-artifacts           Include heuristic Artifacts and Paths sidebar extraction.
  --no-assistant                Disable Assistant Pi JSONL source.
  --no-claude                   Disable Claude JSONL source.
  --no-codex                    Disable Codex JSONL source.
  --no-codex-threads            Disable Codex Threads CLI source.
  --no-redaction                Disable report redaction.
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
