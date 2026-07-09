import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentLensAnnotation } from "./types.js";
import { isRecord, stableHash } from "./utils.js";

export async function loadAnnotations(filePath?: string): Promise<AgentLensAnnotation[]> {
  if (!filePath) return [];
  const raw = await readFile(filePath, "utf8");
  if (filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
    return [
      {
        id: `annotation-${stableHash(`${path.basename(filePath)}:${raw}`)}`,
        kind: "summary",
        title: path.basename(filePath),
        markdown: raw,
        author: "user",
        placement: "sidebar",
      },
    ];
  }
  const parsed: unknown = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.annotations) ? parsed.annotations : [];
  return items
    .map((item, index) => normalizeAnnotation(item, index))
    .filter((item): item is AgentLensAnnotation => item !== null);
}

function normalizeAnnotation(value: unknown, index: number): AgentLensAnnotation | null {
  if (!isRecord(value)) return null;
  const markdown = typeof value.markdown === "string" ? value.markdown : "";
  if (!markdown.trim()) return null;
  const kind = typeof value.kind === "string" ? value.kind : "note";
  const annotation: AgentLensAnnotation = {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : `annotation-${index + 1}-${stableHash(markdown)}`,
    kind: isAnnotationKind(kind) ? kind : "note",
    markdown,
  };
  if (typeof value.title === "string") annotation.title = value.title;
  if (typeof value.author === "string") annotation.author = value.author;
  if (typeof value.timestamp === "string") annotation.timestamp = value.timestamp;
  if (typeof value.anchorEventId === "string") annotation.anchorEventId = value.anchorEventId;
  if (value.placement === "before" || value.placement === "after" || value.placement === "inline" || value.placement === "sidebar") {
    annotation.placement = value.placement;
  }
  if (isRecord(value.range)) {
    annotation.range = {};
    if (typeof value.range.startEventId === "string") annotation.range.startEventId = value.range.startEventId;
    if (typeof value.range.endEventId === "string") annotation.range.endEventId = value.range.endEventId;
    if (typeof value.range.start === "string") annotation.range.start = value.range.start;
    if (typeof value.range.end === "string") annotation.range.end = value.range.end;
  }
  if (Array.isArray(value.tags)) {
    annotation.tags = value.tags.filter((tag): tag is string => typeof tag === "string");
  }
  if (isRecord(value.metadata)) annotation.metadata = value.metadata;
  return annotation;
}

function isAnnotationKind(value: string): value is AgentLensAnnotation["kind"] {
  return ["summary", "section", "note", "decision", "artifact", "warning", "followup"].includes(value);
}

export function buildDefaultAnnotations(): AgentLensAnnotation[] {
  return [
    {
      id: "agent-lens-overview",
      kind: "summary",
      title: "Report Overview",
      markdown:
        "This report was generated from normalized source events. Source transcript events are kept separate from annotations so interpretive notes can be hidden without changing the underlying timeline.",
      author: "agent-lens",
      placement: "sidebar",
    },
  ];
}
