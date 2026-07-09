export type AgentLensSource = "assistant" | "claude" | "codex" | "codex-threads";
export type AgentLensRole = "user" | "assistant";
export type AgentLensAnnotationKind =
  | "summary"
  | "section"
  | "note"
  | "decision"
  | "artifact"
  | "warning"
  | "followup";

export interface TimeRange {
  since?: string;
  until?: string;
}

export interface SourceThread {
  id: string;
  source: AgentLensSource;
  label: string;
  server?: string | undefined;
  threadId?: string | undefined;
  sessionId?: string | undefined;
  cwd?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  preview?: string | undefined;
  status?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface AgentLensEvent {
  id: string;
  source: AgentLensSource;
  server?: string | undefined;
  threadId?: string | undefined;
  sessionId?: string | undefined;
  cwd?: string | undefined;
  timestamp: string;
  sequence?: number | undefined;
  role: AgentLensRole;
  kind: string;
  text?: string | undefined;
  title?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface AgentLensAnnotation {
  id: string;
  kind: AgentLensAnnotationKind;
  title?: string;
  markdown: string;
  author?: "agent-lens" | "assistant" | "user" | "llm" | string;
  timestamp?: string;
  anchorEventId?: string;
  placement?: "before" | "after" | "inline" | "sidebar";
  range?: {
    startEventId?: string;
    endEventId?: string;
    start?: string;
    end?: string;
  };
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SourceNotice {
  source: string;
  severity: "info" | "warning" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ReportMetadata {
  generatedAt: string;
  range: TimeRange;
  sources: string[];
  eventCount: number;
  annotationCount: number;
  redactionEnabled: boolean;
  version?: string;
}

export interface AgentLensReport {
  schemaVersion: 1;
  metadata: ReportMetadata;
  threads: SourceThread[];
  events: AgentLensEvent[];
  annotations: AgentLensAnnotation[];
  notices: SourceNotice[];
  artifacts: string[];
}

export interface SourceOptions {
  codexRoot?: string;
  codexPath?: string;
  codexThreadId?: string;
  codexCwd?: string;
  codexThreadsServers?: string[];
  codexThreadsLimit?: number;
  codexThreadsSinceLabel?: string;
  codexThreadsMaxTurns?: number;
  piRoot?: string;
  assistantCwd?: string;
  assistantSessionId?: string;
  assistantPath?: string;
  claudeRoot?: string;
  claudeCwd?: string;
  claudeSessionId?: string;
  claudePath?: string;
  includeAssistant?: boolean;
  includeClaude?: boolean;
  includeCodex?: boolean;
  includeCodexThreads?: boolean;
  includeArtifacts?: boolean;
}

export interface AgentLensSourceAdapter {
  id: string;
  label: string;
  notices?: SourceNotice[];
  discover(range: TimeRange, options: SourceOptions): Promise<SourceThread[]>;
  load(thread: SourceThread, range: TimeRange, options: SourceOptions): Promise<AgentLensEvent[]>;
}
