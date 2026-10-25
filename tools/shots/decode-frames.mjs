#!/usr/bin/env node
// Decode `@@FRAME <slug>/<viewport>/<name> <i>/<n> <b64>` lines from a remote run log (tests/browser/shotsa-lib.ts) into JPEG files.
// Usage: node tools/shots/decode-frames.mjs <acr-run.log> <outDir>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [log, outDir] = process.argv.slice(2);
if (!log || !outDir) { console.error("usage: decode-frames.mjs <log> <outDir>"); process.exit(2); }
const frames = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /@@FRAME (\S+) (\d+)\/(\d+) (\S+)\s*$/.exec(line);
  if (!m) continue;
  const entry = frames.get(m[1]) ?? { total: Number(m[3]), chunks: [] };
  entry.chunks[Number(m[2]) - 1] = m[4];
  frames.set(m[1], entry);
}
let written = 0;
for (const [name, { total, chunks }] of frames) {
  if (chunks.length < total || chunks.some((c) => c === undefined)) { console.error(`incomplete: ${name}`); continue; }
  const file = join(outDir, `${name.split("/").slice(1).join("/")}.jpg`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(chunks.join(""), "base64"));
  written += 1;
}
console.log(`decoded ${written} frames to ${outDir}`);
