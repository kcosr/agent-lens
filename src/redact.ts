import { isRecord } from "./utils.js";

const REDACTED = "[REDACTED]";

const VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu,
  /\bAuthorization\s*:\s*[^\r\n]+/giu,
  /\bCookie\s*:\s*[^\r\n]+/giu,
  /\bSet-Cookie\s*:\s*[^\r\n]+/giu,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;}]+/giu,
  /\b(sk-[A-Za-z0-9_-]{20,})\b/gu,
  /\b(ghp_[A-Za-z0-9_]{20,})\b/gu,
  /\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/gu,
  /\b([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})\b/gu,
];

const SECRET_KEY_RE = /(?:authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|secret|password|passwd|pwd)/iu;

export function redactText(text: string): string {
  let redacted = text;
  for (const pattern of VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      const separator = match.includes(":") ? ":" : match.includes("=") ? "=" : " ";
      const prefix = match.split(separator)[0] ?? "";
      if (/bearer/iu.test(match) && separator === " ") return `Bearer ${REDACTED}`;
      return prefix ? `${prefix}${separator} ${REDACTED}` : REDACTED;
    });
  }
  return redacted;
}

export function redactValue<T>(value: T): T {
  return redactUnknown(value, new WeakSet()) as T;
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, seen));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    output[key] = SECRET_KEY_RE.test(key) ? REDACTED : redactUnknown(inner, seen);
  }
  return output;
}
