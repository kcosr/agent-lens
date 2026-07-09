import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import { isRecord } from "./utils.js";

export interface JsonlRecordLine {
  lineNumber: number;
  record: Record<string, unknown>;
}

export async function readJsonlRecordLines(path: string): Promise<JsonlRecordLine[]> {
  const records: JsonlRecordLine[] = [];
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isRecord(parsed)) {
      records.push({ lineNumber, record: parsed });
    }
  }
  return records;
}
