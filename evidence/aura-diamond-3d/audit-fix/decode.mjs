#!/usr/bin/env node
// Decode DIA_JPG chunks and DIA_META / DIA_PROBE lines from tests/browser/audit-fix/aura-diamond-3d.spec.ts run logs.
// Usage: node decode.mjs <acr-run.log> <outDir>   → <outDir>/<target>/<shot>.jpg, <outDir>/meta.jsonl, <outDir>/probes.jsonl
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const [log, outDir] = process.argv.slice(2);
if (!log || !outDir) { console.error("usage: decode.mjs <log> <outDir>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const frames = new Map();
let metas = 0, probes = 0;
for (const raw of readFileSync(log, "utf8").split("\n")) {
  const line = raw.replace(/^.*?(DIA_(?:JPG|META|PROBE|ERR|CONSOLE|DONE)\b)/, "$1");
  let m = /^DIA_JPG (\S+) (\S+) (\d+)\/(\d+) (\S+)\s*$/.exec(line);
  if (m) {
    const key = `${m[1]}/${m[2]}`;
    const e = frames.get(key) ?? { total: Number(m[4]), chunks: [] };
    e.chunks[Number(m[3]) - 1] = m[5];
    frames.set(key, e);
    continue;
  }
  if (line.startsWith("DIA_META ")) { appendFileSync(join(outDir, "meta.jsonl"), line.slice(9) + "\n"); metas++; continue; }
  if (line.startsWith("DIA_PROBE ")) { appendFileSync(join(outDir, "probes.jsonl"), line.slice(10) + "\n"); probes++; continue; }
  if (/^DIA_(ERR|CONSOLE) /.test(line)) appendFileSync(join(outDir, "console.txt"), line + "\n");
}
let written = 0;
for (const [key, { total, chunks }] of frames) {
  if (chunks.length < total || chunks.some((c) => c === undefined)) { console.error(`incomplete: ${key}`); continue; }
  const [target, shot] = key.split("/");
  mkdirSync(join(outDir, target), { recursive: true });
  writeFileSync(join(outDir, target, `${shot}.jpg`), Buffer.from(chunks.join(""), "base64"));
  written++;
}
console.log(`decoded ${written} frames, ${metas} meta, ${probes} probe lines to ${outDir}`);
