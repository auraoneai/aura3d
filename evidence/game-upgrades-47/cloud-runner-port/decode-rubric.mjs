#!/usr/bin/env node
// Decode `RB_JPG <shot> <i>/<n> <b64>` lines (tests/browser/audit-fix/cloud-runner-port-rubric.spec.ts) into <outDir>/<shot>.jpg.
// Usage: node evidence/game-upgrades-47/cloud-runner-port/decode-rubric.mjs <acr-run.log> <outDir>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, outDir] = process.argv.slice(2);
if (!log || !outDir) { console.error("usage: decode-rubric.mjs <log> <outDir>"); process.exit(2); }
const frames = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /RB_JPG (\S+) (\d+)\/(\d+) (\S+)\s*$/.exec(line);
  if (!m) continue;
  const e = frames.get(m[1]) ?? { total: Number(m[3]), chunks: [] };
  e.chunks[Number(m[2]) - 1] = m[4];
  frames.set(m[1], e);
}
mkdirSync(outDir, { recursive: true });
for (const [name, { total, chunks }] of frames) {
  if (chunks.filter(Boolean).length < total) { console.error(`incomplete: ${name}`); continue; }
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(chunks.join(""), "base64"));
  console.log(`wrote ${name}.jpg`);
}
for (const line of readFileSync(log, "utf8").split("\n")) if (/RB_(META|ERR|DONE)/.test(line)) console.log(line.slice(line.indexOf("RB_"), line.indexOf("RB_") + 300));
