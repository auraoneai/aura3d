#!/usr/bin/env node
// Fails when docs/api/root-exports.md is stale against packages/engine/src/public/index.ts,
// or when a purpose in root-export-purposes.json names an export that is not live.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect, render } from "./gen-root-exports.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/api/root-exports.md");
const problems = [];

const rows = collect();
const expected = render(rows);
if (!existsSync(OUT)) problems.push("docs/api/root-exports.md is missing");
else if (readFileSync(OUT, "utf8") !== expected) problems.push("docs/api/root-exports.md is stale");

const purposes = JSON.parse(readFileSync(path.join(ROOT, "tools/docs/root-export-purposes.json"), "utf8"));
const live = new Set(rows.filter((r) => !r.deprecated).map((r) => r.name));
for (const name of Object.keys(purposes)) {
  if (!live.has(name)) problems.push(`root-export-purposes.json names "${name}", which is not a live root export`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`FAIL ${p}`);
  console.error("Fix: node tools/docs/gen-root-exports.mjs --write");
  process.exit(1);
}
console.log(`ok: root-exports.md is current (${rows.length} value exports, ${live.size} live)`);
