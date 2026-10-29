#!/usr/bin/env node
// Decode a remote-acr log of tests/browser/audit-fix/heatsink.spec.ts into frames and metadata.
// Usage: node evidence/thermal-drift/audit-fix/decode.mjs <acr-run.log> <out-dir>
// Writes <out-dir>/<target>-<shot>.jpg, meta.jsonl (HS_META lines), probes.jsonl (HS_PROBE lines), issues.txt.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, out] = process.argv.slice(2);
if (!log || !out) { console.error("usage: decode.mjs <acr-run.log> <out-dir>"); process.exit(2); }
mkdirSync(out, { recursive: true });
const chunks = new Map();
const meta = [], probes = [], issues = [];
for (const line of readFileSync(log, "utf8").split("\n")) {
  if (line.startsWith("GL_JPG ")) {
    const [, target, shot, part, b64] = line.split(" ");
    const [i, n] = part.split("/").map(Number);
    const key = `${target}-${shot}`;
    if (!chunks.has(key)) chunks.set(key, { n, parts: [] });
    chunks.get(key).parts[i - 1] = b64;
  } else if (line.startsWith("HS_META ")) meta.push(line.slice(8));
  else if (line.startsWith("HS_PROBE ")) probes.push(line.slice(9));
  else if (/^HS_(ERR|BAD|CONSOLE)/.test(line)) issues.push(line);
}
let frames = 0;
for (const [key, { n, parts }] of chunks) {
  if (parts.filter(Boolean).length !== n) { console.warn(`incomplete ${key}`); continue; }
  writeFileSync(join(out, `${key}.jpg`), Buffer.from(parts.join(""), "base64"));
  frames++;
}
writeFileSync(join(out, "meta.jsonl"), meta.join("\n") + "\n");
writeFileSync(join(out, "probes.jsonl"), probes.join("\n") + "\n");
writeFileSync(join(out, "issues.txt"), issues.join("\n") + "\n");
console.log(`${frames} frames, ${meta.length} meta, ${probes.length} probes, ${issues.length} issue lines -> ${out}`);
