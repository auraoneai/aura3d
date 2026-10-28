#!/usr/bin/env node
/* Reassemble WP7_JSON / WP7_FRAME chunks from an ACR run log. Usage: node wp7-extract.mjs <outDir> <acr-run.log> */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir, log] = process.argv.slice(2);
const text = readFileSync(log, "utf8").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
const json = new Map();
const frames = new Map();
const put = (map, key, idx, chunk) => { if (!map.has(key)) map.set(key, new Map()); map.get(key).set(idx, chunk); };
for (const m of text.matchAll(/WP7_JSON:(\d+):([A-Za-z0-9+/=]+)/g)) put(json, "all", Number(m[1]), m[2]);
for (const m of text.matchAll(/WP7_FRAME:([A-Za-z0-9_-]+):(\d+):([A-Za-z0-9+/=]+)/g)) put(frames, m[1], Number(m[2]), m[3]);
const join64 = (map) => [...map.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join("");
if (!json.size) throw new Error("no WP7_JSON chunks in the log");
mkdirSync(outDir, { recursive: true });
const data = JSON.parse(Buffer.from(join64(json.get("all")), "base64").toString("utf8"));
writeFileSync(join(outDir, "wp7.json"), JSON.stringify(data, null, 1));
for (const [name, chunks] of frames) writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(join64(chunks), "base64"));
console.log(`wrote ${join(outDir, "wp7.json")} (${Object.keys(data).length} arms, ${frames.size} frames)`);
