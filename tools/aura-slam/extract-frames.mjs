#!/usr/bin/env node
// Rebuild evidence files from `SLAMV_FILE <path> <i> <n> <base64>` lines in a remote-run log.
//   node tools/aura-slam/extract-frames.mjs <acr-run.log> <outDir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [log, outDir] = process.argv.slice(2);
if (!log || !outDir) throw new Error("usage: extract-frames.mjs <log> <outDir>");
const chunks = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /SLAMV_FILE (\S+) (\d+) (\d+) ([A-Za-z0-9+/=]+)/.exec(line);
  if (!m) continue;
  const entry = chunks.get(m[1]) ?? { n: Number(m[3]), parts: new Map() };
  entry.parts.set(Number(m[2]), m[4]);
  chunks.set(m[1], entry);
}
for (const [path, { n, parts }] of chunks) {
  if (parts.size !== n) { console.error(`incomplete ${path}: ${parts.size}/${n}`); continue; }
  const bytes = Buffer.from(Array.from({ length: n }, (_, i) => parts.get(i)).join(""), "base64");
  const dest = join(outDir, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  console.log(`${dest} ${bytes.length}`);
}
