#!/usr/bin/env node
// Decode a remote-acr log from tests/browser/audit-fix/pips-big-leap.spec.ts:
//   node decode.mjs <acr-run.log> <out-dir>
// Writes <target>-<id>.jpg per GL_JPG frame and meta.jsonl with every PBL_META line.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [logPath, outDir] = process.argv.slice(2);
if (!logPath || !outDir) { console.error("usage: decode.mjs <acr-run.log> <out-dir>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const chunks = new Map();
const metas = [];
for (const line of readFileSync(logPath, "utf8").split("\n")) {
  const jpg = line.match(/GL_JPG (\S+) (\S+) (\d+)\/(\d+) (\S+)/);
  if (jpg) {
    const key = `${jpg[1]}-${jpg[2]}`;
    const entry = chunks.get(key) ?? { n: Number(jpg[4]), parts: [] };
    entry.parts[Number(jpg[3]) - 1] = jpg[5];
    chunks.set(key, entry);
    continue;
  }
  const meta = line.indexOf("PBL_META ");
  if (meta >= 0) {
    try { metas.push(JSON.parse(line.slice(meta + 9))); } catch { /* truncated line */ }
  }
}
let written = 0;
for (const [key, { n, parts }] of chunks) {
  if (parts.filter(Boolean).length !== n) { console.error(`incomplete ${key}`); continue; }
  writeFileSync(join(outDir, `${key}.jpg`), Buffer.from(parts.join(""), "base64"));
  written += 1;
}
writeFileSync(join(outDir, "meta.jsonl"), metas.map((m) => JSON.stringify(m)).join("\n") + "\n");
console.log(`${written} frames, ${metas.length} meta lines -> ${outDir}`);
