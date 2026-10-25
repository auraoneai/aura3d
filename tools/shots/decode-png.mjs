#!/usr/bin/env node
// Decode `@@PNG <name> <i>/<n> <b64>` lines from a remote run log (tests/browser/sro-og.spec.ts) into PNG files.
// Usage: node tools/shots/decode-png.mjs <acr-run.log> <outDir>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, outDir] = process.argv.slice(2);
if (!log || !outDir) { console.error("usage: decode-png.mjs <log> <outDir>"); process.exit(2); }
const files = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /@@PNG (\S+) (\d+)\/(\d+) (\S+)\s*$/.exec(line);
  if (!m) continue;
  const entry = files.get(m[1]) ?? { total: Number(m[3]), chunks: [] };
  entry.chunks[Number(m[2]) - 1] = m[4];
  files.set(m[1], entry);
}
mkdirSync(outDir, { recursive: true });
let written = 0;
for (const [name, { total, chunks }] of files) {
  if (chunks.length < total || chunks.some((c) => c === undefined)) { console.error(`incomplete: ${name}`); continue; }
  writeFileSync(join(outDir, name), Buffer.from(chunks.join(""), "base64"));
  written += 1;
}
console.log(`decoded ${written} png files to ${outDir}`);
