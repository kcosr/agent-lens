import { createHash } from "node:crypto";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = value.trim();
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function timestampMillis(value: string | undefined): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

export function inRange(timestamp: string, range: { since?: string; until?: string }): boolean {
  const value = timestampMillis(timestamp);
  if (value === null) return false;
  const since = timestampMillis(range.since);
  const until = timestampMillis(range.until);
  if (since !== null && value < since) return false;
  if (until !== null && value > until) return false;
  return true;
}

export function rangesOverlap(
  start: string | undefined,
  end: string | undefined,
  range: { since?: string; until?: string },
): boolean {
  const startMs = timestampMillis(start) ?? timestampMillis(end);
  const endMs = timestampMillis(end) ?? timestampMillis(start);
  if (startMs === null || endMs === null) return true;
  const since = timestampMillis(range.since);
  const until = timestampMillis(range.until);
  if (until !== null && startMs > until) return false;
  if (since !== null && endMs < since) return false;
  return true;
}

export function sortByTimestamp<T extends { timestamp: string; sequence?: number | undefined; id: string }>(
  values: T[],
): T[] {
  return [...values].sort((a, b) => {
    const delta = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (delta !== 0) return delta;
    const seqDelta = (a.sequence ?? 0) - (b.sequence ?? 0);
    if (seqDelta !== 0) return seqDelta;
    return a.id.localeCompare(b.id);
  });
}
