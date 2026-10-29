#!/usr/bin/env node
// Decodes the GL_JPG / GL_META lines that tests/browser/audit-fix/aura-hoops-3d.spec.ts prints into the remote ACR log.
// Usage: node decode.mjs <acr-run.log> <out-dir>
//   <out-dir>/<target>/<shot>.jpg   frames
//   <out-dir>/meta.jsonl            one GL_META record per line
// The ACR log prefixes each line with a timestamp/step tag; the payload is found by its GL_ marker.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , logFile, outDir] = process.argv;
if (!logFile || !outDir) { console.error("usage: decode.mjs <acr-run.log> <out-dir>"); process.exit(2); }
const lines = readFileSync(logFile, "utf8").split(/\r?\n/);
const parts = new Map();
const meta = [];
for (const raw of lines) {
  const j = raw.indexOf("GL_JPG ");
  if (j >= 0) {
    const m = /^GL_JPG (\S+) (\S+) (\d+)\/(\d+) (\S+)/.exec(raw.slice(j));
    if (!m) continue;
    const key = `${m[1]}/${m[2]}`;
    const entry = parts.get(key) ?? { n: Number(m[4]), chunks: [] };
    entry.chunks[Number(m[3]) - 1] = m[5];
    parts.set(key, entry);
    continue;
  }
  const k = raw.indexOf("GL_META ");
  if (k >= 0) { try { meta.push(JSON.parse(raw.slice(k + 8))); } catch { /* truncated line */ } }
}
mkdirSync(outDir, { recursive: true });
let written = 0, partial = 0;
for (const [key, { n, chunks }] of parts) {
  if (chunks.filter(Boolean).length !== n) { partial++; continue; }
  const file = path.join(outDir, `${key}.jpg`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(chunks.join(""), "base64"));
  written++;
}
writeFileSync(path.join(outDir, "meta.jsonl"), meta.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(JSON.stringify({ frames: written, partial, meta: meta.length }));
