#!/usr/bin/env node
/* Reassemble the base64 parts the benchmark spec prints into ACR run logs and merge them into one results file.
   Usage: node extract.mjs <outJson> <framesDir> <acr-run.log> [more logs...] */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [outJson, framesDir, ...logs] = process.argv.slice(2);
const parts = new Map();
const frames = new Map();
const aux = new Map(); // BENCH_AUX chunks: CPU profiles and the forest stall run (groups G and H), one JSON file each
const put = (map, key, idx, chunk) => { if (!map.has(key)) map.set(key, new Map()); map.get(key).set(idx, chunk); };
for (const log of logs) {
  const text = readFileSync(log, "utf8").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  for (const m of text.matchAll(/BENCH_PART:([A-Za-z0-9_-]+):(\d+):([A-Za-z0-9+/=]+)/g)) put(parts, `${m[1]}@${log}`, Number(m[2]), m[3]);
  for (const m of text.matchAll(/BENCH_AUX:([A-Za-z0-9_-]+):(\d+):([A-Za-z0-9+/=]+)/g)) put(aux, m[1], Number(m[2]), m[3]);
  const local = new Map();
  for (const m of text.matchAll(/BENCH_FRAME:([A-Za-z0-9_-]+):(\d+):([A-Za-z0-9+/=]+)/g)) put(local, m[1], Number(m[2]), m[3]);
  for (const [name, chunks] of local) frames.set(name, chunks); // a later log replaces an earlier one wholesale
}
if (!parts.size && !aux.size) throw new Error("no BENCH_PART or BENCH_AUX chunks found in the logs");
const join64 = (map) => [...map.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join("");
const merged = { scenes: {}, env: null, installed: null };
for (const [key, chunks] of parts) {
  const part = JSON.parse(Buffer.from(join64(chunks), "base64").toString("utf8"));
  const have = merged.scenes[part.scene];
  if (have) {
    Object.assign(have.results, part.results);
    if (part.correctness) have.correctness = part.correctness;
  } else merged.scenes[part.scene] = part;
  merged.env ??= part.env;
  merged.installed ??= part.installed;
}
if (parts.size) writeFileSync(outJson, JSON.stringify(merged, null, 2));
for (const [name, chunks] of aux) writeFileSync(join(dirname(outJson), `aux-${name}.json`), JSON.stringify(JSON.parse(Buffer.from(join64(chunks), "base64").toString("utf8")), null, 2));
mkdirSync(framesDir, { recursive: true });
for (const [name, chunks] of frames) writeFileSync(join(framesDir, `${name}.jpg`), Buffer.from(join64(chunks), "base64"));
console.log(`wrote ${outJson}: ${Object.keys(merged.scenes).join(", ")}; ${frames.size} frames`);
