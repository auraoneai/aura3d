#!/usr/bin/env node
// Decode a G23 remote-run log: `WW_JPG <name> <i>/<n> <b64>` chunks into <outDir>/<name>.jpg, and `WW_META <json>`,
// `WW_ERR`, `WW_CONSOLE`, `WW_NAV` lines into <outDir>/metrics.jsonl.
// Usage: node decode-log.mjs <acr-run.log> <outDir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [logFile, outDir] = process.argv.slice(2);
if (!logFile || !outDir) { console.error("usage: decode-log.mjs <log> <outDir>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const parts = new Map();
const meta = [];
for (const raw of readFileSync(logFile, "utf8").split("\n")) {
  const line = raw.replace(/\r/g, "");
  const jpg = /WW_JPG (\S+) (\d+)\/(\d+) (\S+)\s*$/.exec(line);
  if (jpg) {
    const e = parts.get(jpg[1]) ?? { n: Number(jpg[3]), chunks: [] };
    e.chunks[Number(jpg[2]) - 1] = jpg[4];
    parts.set(jpg[1], e);
    continue;
  }
  const m = /WW_META (\{.*\})\s*$/.exec(line);
  if (m) { try { meta.push(JSON.parse(m[1])); } catch { meta.push({ unparsed: m[1].slice(0, 200) }); } continue; }
  const o = /(WW_(?:ERR|CONSOLE|NAV|DONE) .*)$/.exec(line);
  if (o) meta.push({ log: o[1].slice(0, 400) });
}
const written = [];
for (const [name, e] of parts) {
  if (e.chunks.filter(Boolean).length !== e.n) { console.error(`incomplete ${name}`); continue; }
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(e.chunks.join(""), "base64"));
  written.push(name);
}
writeFileSync(join(outDir, "metrics.jsonl"), meta.map((x) => JSON.stringify(x)).join("\n") + "\n");
console.log(JSON.stringify({ images: written.length, meta: meta.length, names: written }));
