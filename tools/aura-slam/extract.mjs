#!/usr/bin/env node
// Decode SLAM_DATA / SLAM_FRAME lines printed by tests/browser/aura-slam-capture.spec.ts into evidence/aura-slam/.
//   node tools/aura-slam/extract.mjs <remote-run-log> [--out evidence/aura-slam] [--frames-dir frames-reference]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const log = args.find((a) => !a.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
if (!log) { console.error("usage: extract.mjs <log> [--out dir] [--frames-dir name]"); process.exit(2); }
const out = opt("out", "evidence/aura-slam");
const framesDir = join(out, opt("frames-dir", "frames-reference"));
mkdirSync(join(out, "raw"), { recursive: true });
mkdirSync(framesDir, { recursive: true });

const data = new Map();
const frames = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /^(SLAM_DATA|SLAM_FRAME) (\S+) (\d+)\/(\d+) (.*)$/.exec(line.replace(/\r$/, ""));
  if (!m) continue;
  const [, tag, name, i, n, chunk] = m;
  const store = tag === "SLAM_DATA" ? data : frames;
  if (!store.has(name)) store.set(name, { n: Number(n), parts: [] });
  store.get(name).parts[Number(i) - 1] = chunk;
}
let ok = 0;
for (const [name, v] of data) {
  if (v.parts.filter(Boolean).length !== v.n) { console.error(`incomplete data ${name}`); continue; }
  writeFileSync(join(out, "raw", `${name}.json`), v.parts.join("") + "\n");
  ok++;
}
let fok = 0;
for (const [name, v] of frames) {
  if (v.parts.filter(Boolean).length !== v.n) { console.error(`incomplete frame ${name}`); continue; }
  writeFileSync(join(framesDir, `${name}.jpg`), Buffer.from(v.parts.join(""), "base64"));
  fok++;
}
console.log(`data files: ${ok}, frames: ${fok}`);
