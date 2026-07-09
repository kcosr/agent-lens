#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
let outfile = path.join("dist-bin", "agent-lens");
let target;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--outfile") {
    const value = args[index + 1];
    if (!value) {
      throw new Error("--outfile requires a path");
    }
    outfile = value;
    index += 1;
    continue;
  }
  if (arg === "--target") {
    const value = args[index + 1];
    if (!value) {
      throw new Error("--target requires a Bun compile target");
    }
    target = value;
    index += 1;
    continue;
  }
  throw new Error(`unsupported argument: ${arg}`);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const absoluteOutfile = path.isAbsolute(outfile) ? outfile : path.resolve(process.cwd(), outfile);
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const bunExecutable = process.env.BUN_EXECUTABLE?.trim() || "bun";
if (typeof pkg.version !== "string" || !pkg.version) {
  throw new Error("package.json version must be a non-empty string");
}

try {
  execFileSync(bunExecutable, ["--version"], { stdio: "ignore" });
} catch {
  throw new Error(`Bun is required to build a standalone executable; set BUN_EXECUTABLE or install bun and retry.`);
}

mkdirSync(path.dirname(absoluteOutfile), { recursive: true });

const buildArgs = [
    "build",
    "--compile",
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    "--define",
    `__AGENT_LENS_VERSION__=${JSON.stringify(pkg.version)}`,
    "--outfile",
    absoluteOutfile,
];
if (target) buildArgs.push("--target", target);
buildArgs.push("src/cli/main.ts");

execFileSync(bunExecutable, buildArgs, { cwd: repoRoot, stdio: "inherit" });
