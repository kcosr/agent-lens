import type { AgentLensAnnotation, AgentLensReport } from "./types.js";

export function createBasicAnnotations(report: AgentLensReport): AgentLensAnnotation[] {
  const sources = [...new Set(report.events.map((event) => event.source))].join(", ") || "no sources";
  const first = report.events[0]?.timestamp;
  const last = report.events.at(-1)?.timestamp;
  return [
    {
      id: "agent-lens-basic-summary",
      kind: "summary",
      title: "Generated Summary",
      markdown: [
        `Range: ${first ?? report.metadata.range.since ?? "unknown"} to ${last ?? report.metadata.range.until ?? "unknown"}.`,
        `Sources: ${sources}.`,
        `Events: ${report.events.length}. Threads/sessions: ${report.threads.length}.`,
        "This v1 summary is deterministic and does not use an LLM.",
      ].join("\n\n"),
      author: "agent-lens",
      placement: "sidebar",
    },
  ];
}
