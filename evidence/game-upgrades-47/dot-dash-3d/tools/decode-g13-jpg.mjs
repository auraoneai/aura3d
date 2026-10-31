#!/usr/bin/env node
// Decode the G13_JPG / G13_META lines of a remote g13-screens run (tests/browser/audit-fix/dot-dash-3d.spec.ts) into
// <out>/<profile>-<state>.jpg plus <out>/screens-metrics.jsonl. Usage: node decode-g13-jpg.mjs <acr-run.log> <out dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [log, out] = process.argv.slice(2);
if (!log || !out) { console.error("usage: decode-g13-jpg.mjs <acr-run.log> <out dir>"); process.exit(2); }
mkdirSync(out, { recursive: true });
const parts = new Map();
const metas = [];
for (const raw of readFileSync(log, "utf8").split("\n")) {
  const line = raw.replace(/^.*?(G13_(?:JPG|META) )/, "$1");
  if (line.startsWith("G13_META ")) { metas.push(line.slice(9)); continue; }
  const m = /^G13_JPG (\S+) (\S+) (\d+)\/(\d+) (\S+)/.exec(line);
  if (!m) continue;
  const key = `${m[1].replace(/^screens-/, "")}-${m[2]}`;
  const entry = parts.get(key) ?? { n: Number(m[4]), chunks: [] };
  entry.chunks[Number(m[3]) - 1] = m[5];
  parts.set(key, entry);
}
for (const [key, { n, chunks }] of parts) {
  if (chunks.filter(Boolean).length !== n) { console.log(`incomplete ${key}`); continue; }
  writeFileSync(join(out, `${key}.jpg`), Buffer.from(chunks.join(""), "base64"));
  console.log(`wrote ${key}.jpg`);
}
writeFileSync(join(out, "screens-metrics.jsonl"), metas.map((m) => m + "\n").join(""));
