#!/usr/bin/env node
// Rebuild SLAMINT_FRAME log chunks into jpg files: node tools/aura-slam/extract-frames.mjs <run.log> <outDir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const [log, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const parts = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = line.match(/SLAMINT_FRAME (\S+) (\d+) (\d+) (\S+)/);
  if (!m) continue;
  const entry = parts.get(m[1]) ?? { n: Number(m[3]), chunks: [] };
  entry.chunks[Number(m[2])] = m[4];
  parts.set(m[1], entry);
}
for (const [name, { n, chunks }] of parts) {
  if (chunks.filter(Boolean).length !== n) { console.error(`incomplete ${name}`); continue; }
  writeFileSync(path.join(out, `${name}.jpg`), Buffer.from(chunks.join(""), "base64"));
  console.log(`wrote ${name}.jpg`);
}
