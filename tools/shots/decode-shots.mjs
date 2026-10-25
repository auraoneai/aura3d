#!/usr/bin/env node
// Decode `@@SC <slug> <name> <i> <n> <b64>` frame lines from a remote run log into JPEG files, and print `@@SCSTATE` / `@@SCERRORS` lines.
// Usage: node tools/shots/decode-shots.mjs <acr-run.log> <outRoot> [slugMap.json]
// Frames land in <outRoot>/<outSlug>/screens/<date>/<name>.jpg, where outSlug comes from slugMap (default: slug).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, outRoot, mapFile] = process.argv.slice(2);
if (!log || !outRoot) { console.error("usage: decode-shots.mjs <log> <outRoot> [slugMap.json]"); process.exit(2); }
const map = mapFile ? JSON.parse(readFileSync(mapFile, "utf8")) : {};
const date = process.env.SHOTS_DATE ?? "2026-10-24";
const parts = new Map();
const state = [];
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /@@SC (\S+) (\S+) (\d+) (\d+) (\S+)\s*$/.exec(line);
  if (m) {
    const key = `${m[1]}|${m[2]}`;
    const e = parts.get(key) ?? { n: Number(m[4]), chunks: [] };
    e.chunks[Number(m[3])] = m[5];
    parts.set(key, e);
    continue;
  }
  const s = /@@SC(?:STATE|ERRORS) .*/.exec(line);
  if (s) state.push(s[0]);
}
let written = 0;
const bySlug = {};
for (const [key, e] of parts) {
  if (e.chunks.filter(Boolean).length !== e.n) { console.error(`incomplete ${key}`); continue; }
  const [slug, name] = key.split("|");
  const dir = join(outRoot, map[slug] ?? slug, "screens", date);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.jpg`), Buffer.from(e.chunks.join(""), "base64"));
  (bySlug[slug] ??= []).push(name);
  written++;
}
for (const s of state) console.log(s);
console.log(JSON.stringify(bySlug));
console.log(`decoded ${written} frames`);
