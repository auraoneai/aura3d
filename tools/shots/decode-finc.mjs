#!/usr/bin/env node
// Decode a finc remote-run log: JPEG frames (`@@SC <slug> <name> <i> <n> <b64>`) into <outRoot>/<folder>/screens/final/, and the
// number lines (@@SCSTAT, @@SCTEXT, @@SCCANVAS, @@SCSETTLE, @@SCCROP, @@SCSTATE, @@SCERRORS) appended to <folder>/screens/final/metrics.jsonl.
// Usage: node tools/shots/decode-finc.mjs <acr-run.log> <outRoot> [slugMap.json]
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const [log, outRoot, mapFile = "tools/shots/finc-slugmap.json"] = process.argv.slice(2);
if (!log || !outRoot) { console.error("usage: decode-finc.mjs <log> <outRoot> [slugMap.json]"); process.exit(2); }
const map = JSON.parse(readFileSync(mapFile, "utf8"));
const parts = new Map();
const lines = [];
for (const raw of readFileSync(log, "utf8").split("\n")) {
  const line = raw.replace(/\r/g, "");
  const m = /@@SC (\S+) (\S+) (\d+) (\d+) (\S+)\s*$/.exec(line);
  if (m) {
    const key = `${m[1]}|${m[2]}`;
    const e = parts.get(key) ?? { n: Number(m[4]), chunks: [] };
    e.chunks[Number(m[3])] = m[5];
    parts.set(key, e);
    continue;
  }
  const s = /@@(SCSTAT|SCTEXT|SCCANVAS|SCSETTLE|SCCROP|SCSTATE|SCERRORS) (\S+) (.*)$/.exec(line);
  if (s) lines.push({ kind: s[1], slug: s[2], data: s[3] });
}
const written = {};
for (const [key, e] of parts) {
  if (e.chunks.filter(Boolean).length !== e.n) { console.error(`incomplete ${key}`); continue; }
  const [slug, name] = key.split("|");
  const dir = join(outRoot, map[slug] ?? slug, "screens", "final");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.jpg`), Buffer.from(e.chunks.join(""), "base64"));
  (written[slug] ??= []).push(name);
}
for (const l of lines) {
  const dir = join(outRoot, map[l.slug] ?? l.slug, "screens", "final");
  mkdirSync(dir, { recursive: true });
  let data; try { data = JSON.parse(l.data); } catch { data = l.data; }
  appendFileSync(join(dir, "metrics.jsonl"), JSON.stringify({ kind: l.kind, ...(typeof data === "object" ? data : { data }) }) + "\n");
  if (l.kind !== "SCTEXT") console.log(`${l.kind} ${l.slug} ${l.data.slice(0, 300)}`);
}
console.log(JSON.stringify(written));
console.log(`decoded ${Object.values(written).flat().length} frames`);
