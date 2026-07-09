import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, parseCollectionOptions, threadSummaries } from "../src/cli/main.js";
import { buildReport, resolveCollectionOptions } from "../src/report.js";
import { renderHtmlReport } from "../src/renderHtml.js";
import { redactText, redactValue } from "../src/redact.js";
import { AssistantPiJsonlSourceAdapter, encodePiSessionDir } from "../src/sources/assistantPiJsonl.js";
import { ClaudeJsonlSourceAdapter } from "../src/sources/claudeJsonl.js";
import { CodexJsonlSourceAdapter } from "../src/sources/codexJsonl.js";
import { DEFAULT_CODEX_THREADS_SERVERS, normalizeCodexThread } from "../src/sources/codexThreads.js";
import type { AgentLensReport } from "../src/types.js";

describe("redaction", () => {
  it("redacts common secret text and fields", () => {
    expect(redactText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz")).toContain("[REDACTED]");
    expect(redactText("api_key=abcdef0123456789")).toContain("[REDACTED]");
    expect(redactValue({ password: "secret", nested: { cookie: "a=b" } })).toEqual({
      password: "[REDACTED]",
      nested: { cookie: "[REDACTED]" },
    });
  });
});

describe("assistant pi jsonl adapter", () => {
  it("discovers and normalizes Pi session events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-lens-pi-"));
    try {
      const bucket = path.join(root, encodePiSessionDir("/tmp/assistant"));
      await mkdir(bucket, { recursive: true });
      await copyFile(
        path.resolve("test/fixtures/pi-session.jsonl"),
        path.join(bucket, "2026-06-08T14-00-00-000Z_pi-session-1.jsonl"),
      );
      const adapter = new AssistantPiJsonlSourceAdapter();
      const threads = await adapter.discover(
        { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
        { piRoot: root },
      );
      expect(threads).toHaveLength(1);
      const events = await adapter.load(threads[0]!, {
        since: "2026-06-08T14:00:00.000Z",
        until: "2026-06-08T15:00:00.000Z",
      });
      expect(events.map((event) => event.kind)).toContain("message");
      expect(events.map((event) => event.kind)).not.toContain("tool_call");
      expect(events.map((event) => event.kind)).not.toContain("tool_result");
      expect(events.map((event) => event.kind)).not.toContain("request_start");
      expect(events.map((event) => event.kind)).not.toContain("request_end");
      expect(events.find((event) => event.role === "assistant")?.text).toContain("README");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("claude jsonl adapter", () => {
  it("discovers and normalizes Claude session messages without tool content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-lens-claude-"));
    try {
      const bucket = path.join(root, "-tmp-claude");
      await mkdir(bucket, { recursive: true });
      await copyFile(
        path.resolve("test/fixtures/claude-session.jsonl"),
        path.join(bucket, "claude-session-1.jsonl"),
      );
      const adapter = new ClaudeJsonlSourceAdapter();
      const threads = await adapter.discover(
        { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
        { claudeRoot: root },
      );
      expect(threads).toHaveLength(1);
      expect(threads[0]?.source).toBe("claude");
      expect(threads[0]?.label).toBe("Claude Fixture Session");
      const events = await adapter.load(threads[0]!, {
        since: "2026-06-08T14:00:00.000Z",
        until: "2026-06-08T15:00:00.000Z",
      });
      expect(events.map((event) => event.role)).toEqual(["user", "assistant", "user", "assistant"]);
      expect(events.map((event) => event.text).join("\n")).toContain("Now summarize it.");
      expect(events.map((event) => event.text).join("\n")).not.toContain("Tool output should not become");
      expect(events.map((event) => event.text).join("\n")).not.toContain("Hidden reasoning");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("codex jsonl adapter", () => {
  it("discovers and normalizes Codex rollout messages without injected context or duplicates", async () => {
    const adapter = new CodexJsonlSourceAdapter();
    const threads = await adapter.discover(
      { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
      { codexPath: path.resolve("test/fixtures/codex-rollout.jsonl") },
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]?.source).toBe("codex");
    expect(threads[0]?.threadId).toBe("codex-thread-1");
    expect(threads[0]?.cwd).toBe("/tmp/codex");

    const events = await adapter.load(threads[0]!, {
      since: "2026-06-08T14:00:00.000Z",
      until: "2026-06-08T15:00:00.000Z",
    });
    expect(events.map((event) => event.role)).toEqual(["user", "assistant"]);
    expect(events.map((event) => event.text).join("\n")).toContain("Review this change.");
    expect(events.map((event) => event.text).join("\n")).toContain("I will review it.");
    expect(events.map((event) => event.text).join("\n")).not.toContain("environment_context");
    expect(events.filter((event) => event.text === "I will review it.")).toHaveLength(1);
  });

  it("filters discovered Codex rollouts by thread and cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-lens-codex-"));
    try {
      const bucket = path.join(root, "2026", "06", "08");
      await mkdir(bucket, { recursive: true });
      await copyFile(
        path.resolve("test/fixtures/codex-rollout.jsonl"),
        path.join(bucket, "rollout-2026-06-08T09-00-00-codex-thread-1.jsonl"),
      );
      const adapter = new CodexJsonlSourceAdapter();
      const range = { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" };

      await expect(adapter.discover(range, { codexRoot: root, codexThreadId: "missing-thread" })).resolves.toHaveLength(0);
      await expect(adapter.discover(range, { codexRoot: root, codexCwd: "/tmp/other" })).resolves.toHaveLength(0);
      await expect(adapter.discover(range, { codexRoot: root, codexThreadId: "codex-thread-1", codexCwd: "/tmp/codex" })).resolves.toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("merges rollout segments by metadata thread id and removes overlapping events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-lens-codex-segments-"));
    try {
      const bucket = path.join(root, "2026", "06", "08");
      await mkdir(bucket, { recursive: true });
      const fixture = path.resolve("test/fixtures/codex-rollout.jsonl");
      const firstPath = path.join(bucket, "rollout-2026-06-08T09-00-00-codex-thread-1.jsonl");
      const secondPath = path.join(bucket, "rollout-2026-06-08T09-05-00-different-rollout-id.jsonl");
      await copyFile(fixture, firstPath);
      const continuation = `${JSON.stringify({ timestamp: "2026-06-08T13:59:59.000Z", type: "rollout_marker" })}\n${await readFile(fixture, "utf8")}\n${JSON.stringify({
        timestamp: "2026-06-08T14:00:06.000Z",
        type: "event_msg",
        payload: { type: "user_message", message: "Continue the review." },
      })}\n${JSON.stringify({
        timestamp: "2026-06-08T14:00:07.000Z",
        type: "response_item",
        payload: { id: "assistant-continue", type: "message", role: "assistant", content: [{ type: "output_text", text: "Continuing the review." }] },
      })}\n`;
      await writeFile(secondPath, continuation);

      const adapter = new CodexJsonlSourceAdapter();
      const range = { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" };
      const threads = await adapter.discover(range, { codexRoot: root, codexThreadId: "codex-thread-1" });

      expect(threads).toHaveLength(1);
      expect(threads[0]?.metadata?.paths).toEqual([firstPath, secondPath]);
      const events = await adapter.load(threads[0]!, range);
      expect(events.map((event) => event.text)).toEqual([
        "Review this change.",
        "I will review it.",
        "Continue the review.",
        "Continuing the review.",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("codex threads adapter", () => {
  it("uses only the generic main server by default", () => {
    expect(DEFAULT_CODEX_THREADS_SERVERS).toEqual(["main"]);
  });

  it("retains only normalized thread fields", () => {
    const thread = normalizeCodexThread(
      {
        id: "shared-thread",
        name: "Thread name",
        cwd: "/tmp/project",
        createdAt: "2026-06-08T14:00:00.000Z",
        updatedAt: "2026-06-08T15:00:00.000Z",
        preview: "Recent prompt",
        status: "idle",
        path: "/private/session.jsonl",
        gitInfo: { branch: "private" },
        turns: [{ id: "turn-1" }],
      },
      "main",
    );

    expect(thread).toMatchObject({
      id: "codex:main:shared-thread",
      source: "codex-threads",
      server: "main",
      threadId: "shared-thread",
      cwd: "/tmp/project",
    });
    expect(JSON.stringify(thread)).not.toContain("private/session.jsonl");
    expect(JSON.stringify(thread)).not.toContain("gitInfo");
    expect(JSON.stringify(thread)).not.toContain("turn-1");
  });
});

describe("cli collection options", () => {
  it("normalizes omitted and undefined collection flags", () => {
    const options = resolveCollectionOptions({
      range: { since: "2026-06-08T14:00:00.000Z" },
      includeAssistant: undefined,
      includeCodexThreads: undefined,
      redaction: undefined,
    });

    expect(options).toMatchObject({
      includeAssistant: true,
      includeClaude: true,
      includeCodex: true,
      includeCodexThreads: false,
      includeArtifacts: false,
      redaction: true,
    });
  });

  it("enables Codex Threads only when codex-threads flags are present", () => {
    const withoutThreads = parseCollectionOptions(parseArgs(["export", "--since", "2026-06-08T14:00:00.000Z"]));
    expect(withoutThreads).toMatchObject({
      includeAssistant: true,
      includeClaude: true,
      includeCodex: true,
      includeCodexThreads: false,
      includeArtifacts: false,
      redaction: true,
    });

    const withThreads = parseCollectionOptions(
      parseArgs(["export", "--since", "2026-06-08T14:00:00.000Z", "--codex-threads-server", "main"]),
    );
    expect(withThreads.includeCodexThreads).toBe(true);
    expect(withThreads.codexThreadsServers).toEqual(["main"]);

    const disabledWins = parseCollectionOptions(
      parseArgs([
        "export",
        "--since",
        "2026-06-08T14:00:00.000Z",
        "--codex-threads-server",
        "main",
        "--no-codex-threads",
      ]),
    );
    expect(disabledWins.includeCodexThreads).toBe(false);
  });
});

describe("cli report navigation", () => {
  it("keeps source-colliding thread ids separate", () => {
    const report: AgentLensReport = {
      schemaVersion: 1,
      metadata: {
        generatedAt: "2026-06-08T15:00:00.000Z",
        range: {},
        sources: ["codex-jsonl", "codex-threads"],
        eventCount: 2,
        annotationCount: 0,
        redactionEnabled: true,
      },
      threads: [
        { id: "codex:shared", source: "codex", threadId: "shared", label: "Local Codex" },
        { id: "codex:main:shared", source: "codex-threads", server: "main", threadId: "shared", label: "Codex Threads" },
      ],
      events: [
        { id: "codex:shared:user", source: "codex", threadId: "shared", timestamp: "2026-06-08T14:00:00.000Z", role: "user", kind: "message", text: "Local" },
        { id: "codex:main:shared:user", source: "codex-threads", server: "main", threadId: "shared", timestamp: "2026-06-08T14:01:00.000Z", role: "user", kind: "message", text: "Server" },
      ],
      annotations: [],
      notices: [],
      artifacts: [],
    };

    expect(threadSummaries(report).map(({ key, eventCount }) => ({ key, eventCount }))).toEqual([
      { key: "codex:shared", eventCount: 1 },
      { key: "codex:main:shared", eventCount: 1 },
    ]);
  });
});

describe("report and renderer", () => {
  it("builds a redacted Assistant-only report", async () => {
    const report = await buildReport({
      range: { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
      assistantPath: path.resolve("test/fixtures/pi-session.jsonl"),
      includeClaude: false,
      includeCodex: false,
      includeCodexThreads: false,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain('"raw"');
    expect(report.artifacts).toEqual([]);
    expect(report.events.every((event) => event.role === "user" || event.role === "assistant")).toBe(true);
  });

  it("includes Claude by default and can disable it", async () => {
    const withClaude = await buildReport({
      range: { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
      assistantPath: path.resolve("test/fixtures/pi-session.jsonl"),
      claudePath: path.resolve("test/fixtures/claude-session.jsonl"),
      includeCodex: false,
      includeCodexThreads: false,
    });
    expect(withClaude.metadata.sources).toContain("claude-jsonl");
    expect(withClaude.events.some((event) => event.source === "claude")).toBe(true);
    expect(JSON.stringify(withClaude)).not.toContain("tool_use");

    const withoutClaude = await buildReport({
      range: { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
      assistantPath: path.resolve("test/fixtures/pi-session.jsonl"),
      claudePath: path.resolve("test/fixtures/claude-session.jsonl"),
      includeClaude: false,
      includeCodex: false,
      includeCodexThreads: false,
    });
    expect(withoutClaude.metadata.sources).not.toContain("claude-jsonl");
    expect(withoutClaude.events.some((event) => event.source === "claude")).toBe(false);
  });

  it("includes artifacts only when explicitly requested", async () => {
    const report = await buildReport({
      range: { since: "2026-06-08T14:00:00.000Z", until: "2026-06-08T15:00:00.000Z" },
      assistantPath: path.resolve("test/fixtures/pi-session.jsonl"),
      includeClaude: false,
      includeCodex: false,
      includeCodexThreads: false,
      includeArtifacts: true,
    });
    expect(report.artifacts).toContain("/tmp/project/README.md");
  });

  it("renders self-contained HTML with embedded report data", async () => {
    const raw = await readFile("test/fixtures/report.json", "utf8");
    const html = renderHtmlReport(JSON.parse(raw));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("agent-lens-data");
    expect(html).toContain("Timeline");
    expect(html).toContain("Conversation Roles");
    expect(html).toContain("id=\"role-user\" checked");
    expect(html).toContain("id=\"role-assistant\" checked");
    expect(html).toContain("id=\"instance-filter\"");
    expect(html).toContain("id=\"conversation-order\"");
    expect(html).toContain("Chronological");
    expect(html).toContain("All sources");
    expect(html).toContain("function instanceLabel");
    expect(html).toContain("function conversationKey");
    expect(html).toContain("Assistant");
    expect(html).toContain("Claude");
    expect(html).toContain("Codex (");
    expect(html).toContain("function refreshConversationList");
    expect(html).toContain(".convo.hidden");
    expect(html).toContain("id=\"expand-all\"");
    expect(html).toContain("id=\"collapse-all\"");
    expect(html).toContain("max-height:480px");
    expect(html).toContain("--user-bg:#e2e6ec");
    expect(html).toContain("border-left-color:var(--tc,var(--faint))");
    expect(html).toContain(".role-user{color:var(--tc,var(--muted))");
    expect(html).toContain("refreshOverflowToggles");
    expect(html).toContain("data-expandable");
    expect(html).toContain("id=\"summary-modal\"");
    expect(html).toContain("class=\"convo-note\"");
    expect(html).toContain("data-summary-thread");
    expect(html).toContain("function openSummaryModal");
    expect(html).not.toContain("id=\"sidebar-annotations-section\"");
    expect(html).not.toContain("<summary>Summaries</summary>");
    expect(html).not.toContain("id=\"show-tools\"");
    expect(html).not.toContain("id=\"show-status\"");
    expect(html).not.toContain("source-assistant");
    expect(html).not.toContain("source-codex");
    expect(html).not.toContain("All servers");
    expect(html).not.toContain(">Anchor<");
    expect(html).not.toContain("thread-badge");
    expect(html).toContain("message-title");
    expect(html).not.toContain("https://");
  });

  it("renders the redesigned navigation, theming, and markdown affordances", async () => {
    const raw = await readFile("test/fixtures/report.json", "utf8");
    const html = renderHtmlReport(JSON.parse(raw));
    // light + dark theming
    expect(html).toContain("id=\"theme-toggle\"");
    expect(html).toContain("html[data-theme=dark]");
    // chronological / by-conversation view toggle
    expect(html).toContain("id=\"view-toggle\"");
    expect(html).toContain("By conversation");
    expect(html).toContain("data-view=\"grouped\"");
    // conversation focus + dynamic thread grouping
    expect(html).toContain("function selectThread");
    expect(html).toContain("function refreshGroupDividers");
    expect(html).toContain("group-divider");
    // role-distinct chat bubbles with per-message thread context
    expect(html).toContain("thread-chip");
    expect(html).toContain("data-role=");
    // inline markdown rendering for message bodies
    expect(html).toContain("function md(");
    // scroll-to-top affordance
    expect(html).toContain("id=\"to-top\"");
  });

  it("renders the activity timeline view (user-prompt swimlanes)", async () => {
    const raw = await readFile("test/fixtures/report.json", "utf8");
    const html = renderHtmlReport(JSON.parse(raw));
    // third view-toggle mode + its container
    expect(html).toContain("data-view=\"activity\"");
    expect(html).toContain("id=\"activity\"");
    // clustered-bubble swimlanes built from user prompts only
    expect(html).toContain("function renderActivity");
    expect(html).toContain("function clusterUserEvents");
    expect(html).toContain("userEventsByThread");
    expect(html).toContain("act-bubble");
    expect(html).toContain("act-lane");
    // hover tooltip + click-to-jump into the transcript
    expect(html).toContain("id=\"act-tip\"");
    expect(html).toContain("function jumpToEvent");
  });
});
