#!/usr/bin/env node
// Decode `@@SB <slug> <name> <i> <n> <b64>` frame lines from a remote run log (tests/browser/shotsb-lib.ts) into JPEG files.
// Usage: node tools/shots/decode-shotsb.mjs <acr-run.log> <slug> <outDir>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const [log, slug, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const parts = new Map();
const lines = [];
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /@@SB (\S+) (\S+) (\d+) (\d+) (\S+)\s*$/.exec(line);
  if (m && m[1] === slug) {
    const key = m[2];
    const e = parts.get(key) ?? { n: Number(m[4]), chunks: new Map() };
    e.chunks.set(Number(m[3]), m[5]);
    parts.set(key, e);
    continue;
  }
  if (/@@SB(STATE|TITLE|ERRORS) /.test(line) && line.includes(slug)) lines.push(line.replace(/^.*(@@SB)/, "$1"));
}
let saved = 0;
for (const [name, e] of parts) {
  if (e.chunks.size !== e.n) { console.log(`incomplete ${name} ${e.chunks.size}/${e.n}`); continue; }
  const b64 = [...Array(e.n).keys()].map((i) => e.chunks.get(i)).join("");
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(b64, "base64"));
  saved++;
}
writeFileSync(`${out}/capture-log.txt`, lines.join("\n") + "\n");
console.log(`${slug}: ${saved} frames, ${lines.length} log lines`);
