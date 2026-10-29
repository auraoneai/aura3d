#!/usr/bin/env node
// Decode GL_JPG chunks and GL_META/GL_CHECKS/GL_TOUCH/GL_NOTE lines from a remote ACR run log
// (tests/browser/audit-fix/teleoperator.spec.ts) into an evidence folder.
//   node tools/teleoperator/decode-gl-log.mjs <acr-run.log> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [logPath, outDir] = process.argv.slice(2);
if (!logPath || !outDir) {
  console.error("usage: decode-gl-log.mjs <acr-run.log> <out-dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const chunks = new Map();
const meta = [];
const other = [];
for (const raw of readFileSync(logPath, "utf8").split("\n")) {
  const line = raw.replace(/^.*?(GL_[A-Z]+ )/, "$1").trimEnd();
  if (line.startsWith("GL_JPG ")) {
    const [, target, shot, part, b64] = line.split(" ");
    const [i, n] = part.split("/").map(Number);
    const key = `${target}-${shot}`;
    if (!chunks.has(key)) chunks.set(key, { n, parts: [] });
    chunks.get(key).parts[i - 1] = b64;
  } else if (line.startsWith("GL_META ")) {
    try { meta.push(JSON.parse(line.slice(8))); } catch { other.push(line); }
  } else if (/^GL_(CHECKS|TOUCH|NOTE|ERR|CONSOLE|NAV|DONE) /.test(line)) {
    other.push(line);
  }
}
let written = 0;
for (const [key, { n, parts }] of chunks) {
  if (parts.filter(Boolean).length !== n) { console.warn(`incomplete ${key}: ${parts.filter(Boolean).length}/${n}`); continue; }
  writeFileSync(join(outDir, `${key}.jpg`), Buffer.from(parts.join(""), "base64"));
  written++;
}
writeFileSync(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 1)}\n`);
writeFileSync(join(outDir, "lines.txt"), `${other.join("\n")}\n`);
console.log(`${written} frames, ${meta.length} meta rows, ${other.length} other lines -> ${outDir}`);
