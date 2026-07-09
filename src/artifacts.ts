import type { AgentLensEvent } from "./types.js";

const PATH_RE = /(?<![\w.-])(?:~|\/[A-Za-z0-9._ -]+)(?:\/[A-Za-z0-9._@+,:=-]+)+(?![\w.-])/g;

export function extractArtifacts(events: AgentLensEvent[], limit = 80): string[] {
  const artifacts = new Set<string>();
  for (const event of events) {
    const text = `${event.text ?? ""}\n${event.title ?? ""}`;
    for (const match of text.matchAll(PATH_RE)) {
      const value = match[0]?.replace(/[),.;\]]+$/u, "");
      if (value && value.length > 1 && value.length < 240) {
        artifacts.add(value);
      }
      if (artifacts.size >= limit) return [...artifacts].sort();
    }
  }
  return [...artifacts].sort();
}
