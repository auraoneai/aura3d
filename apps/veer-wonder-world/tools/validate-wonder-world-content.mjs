#!/usr/bin/env node
// Wonder World content lint (PRD 04 J14): every story, line, string, word,
// letter, count, song, effect, bed, asset and rights reference.
//
//   node apps/veer-wonder-world/tools/validate-wonder-world-content.mjs [--require-audio | --allow-missing-audio]
//
// Runs tools/validate-content-entry.ts with tsx from the app directory (the
// app-local ./node_modules/.bin/tsx, else the monorepo root's) and exits with
// its status: 0 when the content passes, non-zero on any problem.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.platform === "win32" ? "tsx.cmd" : "tsx";
const candidates = [join(app, "node_modules", ".bin", bin), join(app, "..", "..", "node_modules", ".bin", bin)];
const tsx = candidates.find((candidate) => existsSync(candidate));

if (!tsx) {
  console.error(`validate-wonder-world-content: tsx not found (looked in ${candidates.join(", ")}). Install the app dependencies first.`);
  process.exit(2);
}

const result = spawnSync(tsx, ["tools/validate-content-entry.ts", ...process.argv.slice(2)], { cwd: app, stdio: "inherit" });
if (result.error) {
  console.error(`validate-wonder-world-content: could not start tsx: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 1);
