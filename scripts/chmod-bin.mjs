#!/usr/bin/env node
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";

const binPath = path.resolve("dist/cli/main.js");
if (existsSync(binPath)) {
  chmodSync(binPath, 0o755);
}
