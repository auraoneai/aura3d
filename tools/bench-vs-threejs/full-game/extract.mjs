#!/usr/bin/env node
/* Reassemble the base64 chunks tests/browser/fullgame-compare.spec.ts prints into an ACR run log.
   Usage: node extract.mjs <outJson> <framesDir> <acr-run.log> */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outJson, framesDir, log] = process.argv.slice(2);
if (!outJson || !framesDir || !log) throw new Error("usage: extract.mjs <outJson> <framesDir> <acr-run.log>");
const text = readFileSync(log, "utf8").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
const results = new Map();
const frames = new Map();
const put = (map, key, idx, chunk) => { if (!map.has(key)) map.set(key, new Map()); map.get(key).set(idx, chunk); };
for (const m of text.matchAll(/FULLGAME_RESULTS:(\d+):([A-Za-z0-9+/=]+)/g)) put(results, "r", Number(m[1]), m[2]);
for (const m of text.matchAll(/FULLGAME_FRAME:([A-Za-z0-9_-]+):(\d+):([A-Za-z0-9+/=]+)/g)) put(frames, m[1], Number(m[2]), m[3]);
const join64 = (map) => [...map.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join("");
if (!results.size) throw new Error("no FULLGAME_RESULTS chunks found");
writeFileSync(outJson, JSON.stringify(JSON.parse(Buffer.from(join64(results.get("r")), "base64").toString("utf8")), null, 2));
mkdirSync(framesDir, { recursive: true });
for (const [name, chunks] of frames) writeFileSync(join(framesDir, `${name}.jpg`), Buffer.from(join64(chunks), "base64"));
console.log(`wrote ${outJson}; ${frames.size} frames`);
