import type {
  AgentLensAnnotation,
  AgentLensEvent,
  AgentLensReport,
  AgentLensSourceAdapter,
  SourceNotice,
  SourceOptions,
  SourceThread,
  TimeRange,
} from "./types.js";
import { extractArtifacts } from "./artifacts.js";
import { loadAnnotations } from "./annotations.js";
import {
  AssistantPiJsonlSourceAdapter,
  ClaudeJsonlSourceAdapter,
  CodexJsonlSourceAdapter,
  CodexThreadsSourceAdapter,
} from "./sources/index.js";
import { redactValue } from "./redact.js";
import { sortByTimestamp } from "./utils.js";

declare const __AGENT_LENS_VERSION__: string | undefined;

export const DEFAULT_COLLECTION_OPTIONS = {
  includeAssistant: true,
  includeClaude: true,
  includeCodex: true,
  includeCodexThreads: false,
  includeArtifacts: false,
  redaction: true,
} as const;

export interface BuildReportOptions extends SourceOptions {
  range: TimeRange;
  annotationsPath?: string;
  redaction?: boolean;
}

export type ResolvedCollectionOptions = BuildReportOptions &
  Required<Pick<SourceOptions, "includeAssistant" | "includeClaude" | "includeCodex" | "includeCodexThreads" | "includeArtifacts">> & {
    redaction: boolean;
  };

export async function buildReport(options: BuildReportOptions): Promise<AgentLensReport> {
  const resolvedOptions = resolveCollectionOptions(options);
  const adapters = buildAdapters(resolvedOptions);
  const threads: SourceThread[] = [];
  const events: AgentLensEvent[] = [];
  const notices: SourceNotice[] = [];

  for (const adapter of adapters) {
    const discovered = await adapter.discover(resolvedOptions.range, resolvedOptions);
    threads.push(...discovered);
    for (const thread of discovered) {
      events.push(...(await adapter.load(thread, resolvedOptions.range, resolvedOptions)));
    }
    if (adapter.notices) notices.push(...adapter.notices);
  }

  const loadedAnnotations = await loadAnnotations(resolvedOptions.annotationsPath);
  const redactionEnabled = resolvedOptions.redaction;
  const sortedEvents = sortByTimestamp(
    events.filter((event) => event.role === "user" || event.role === "assistant"),
  );
  const report: AgentLensReport = {
    schemaVersion: 1,
    metadata: {
      generatedAt: new Date().toISOString(),
      range: resolvedOptions.range,
      sources: adapters.map((adapter) => adapter.id),
      eventCount: sortedEvents.length,
      annotationCount: loadedAnnotations.length,
      redactionEnabled,
      version: typeof __AGENT_LENS_VERSION__ === "string" ? __AGENT_LENS_VERSION__ : "0.1.0",
    },
    threads,
    events: sortedEvents,
    annotations: loadedAnnotations,
    notices,
    artifacts: resolvedOptions.includeArtifacts ? extractArtifacts(sortedEvents) : [],
  };

  if (!redactionEnabled) return report;
  const redacted = redactValue(report);
  redacted.metadata.redactionEnabled = true;
  return redacted;
}

export function resolveCollectionOptions(options: BuildReportOptions): ResolvedCollectionOptions {
  return {
    ...options,
    includeAssistant: options.includeAssistant ?? DEFAULT_COLLECTION_OPTIONS.includeAssistant,
    includeClaude: options.includeClaude ?? DEFAULT_COLLECTION_OPTIONS.includeClaude,
    includeCodex: options.includeCodex ?? DEFAULT_COLLECTION_OPTIONS.includeCodex,
    includeCodexThreads: options.includeCodexThreads ?? DEFAULT_COLLECTION_OPTIONS.includeCodexThreads,
    includeArtifacts: options.includeArtifacts ?? DEFAULT_COLLECTION_OPTIONS.includeArtifacts,
    redaction: options.redaction ?? DEFAULT_COLLECTION_OPTIONS.redaction,
  };
}

function buildAdapters(options: SourceOptions): AgentLensSourceAdapter[] {
  const adapters: AgentLensSourceAdapter[] = [];
  if (options.includeAssistant) adapters.push(new AssistantPiJsonlSourceAdapter());
  if (options.includeClaude) adapters.push(new ClaudeJsonlSourceAdapter());
  if (options.includeCodex) adapters.push(new CodexJsonlSourceAdapter());
  if (options.includeCodexThreads) adapters.push(new CodexThreadsSourceAdapter());
  return adapters;
}

export function mergeReportAnnotations(
  report: AgentLensReport,
  annotations: AgentLensAnnotation[],
): AgentLensReport {
  return {
    ...report,
    annotations,
    metadata: {
      ...report.metadata,
      annotationCount: annotations.length,
    },
  };
}
