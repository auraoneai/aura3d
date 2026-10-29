#!/usr/bin/env node
// Extracts Wonder World evidence from a remote ACR run log. Ad-hoc `az acr run` cannot upload artifacts, so the
// browser specs print it into the log (tests/browser/wonder-world-lib.ts):
//   WWSHOT <name> <index> <total> <base64 chunk>   a JPEG or PNG screenshot, chunked
//   WWJSON <name> <json>                            a JSON record (state, diagnostics, timings)
//
//   node tools/extract-remote-evidence.mjs <acr-run.log> <out-dir>
// Writes <out-dir>/<name>.jpg|png and <out-dir>/<name>.json, and prints what it wrote.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, out] = process.argv.slice(2);
if (!log || !out) throw new Error("usage: extract-remote-evidence.mjs <acr-run.log> <out-dir>");
mkdirSync(out, { recursive: true });
const shots = new Map();
const records = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const shot = /WWSHOT (\S+) (\d+) (\d+) (\S+)/.exec(line);
  if (shot) {
    const [, name, i, total, chunk] = shot;
    const entry = shots.get(name) ?? { total: Number(total), parts: [] };
    entry.parts[Number(i)] = chunk;
    shots.set(name, entry);
    continue;
  }
  const record = /WWJSON (\S+) (\{.*\})\s*$/.exec(line);
  if (record) {
    try { records.set(record[1], JSON.parse(record[2])); } catch { /* a truncated line is skipped, not guessed */ }
  }
}
const safe = (name) => name.replace(/[^a-z0-9._-]+/gi, "_");
for (const [name, { total, parts }] of shots) {
  const present = parts.filter((p) => typeof p === "string").length;
  if (present !== total) { console.log(`incomplete ${name}: ${present}/${total} chunks`); continue; }
  const bytes = Buffer.from(parts.join(""), "base64");
  const ext = bytes[0] === 0x89 && bytes[1] === 0x50 ? "png" : "jpg";
  writeFileSync(join(out, `${safe(name)}.${ext}`), bytes);
  console.log(`shot ${name}.${ext} ${bytes.length} bytes`);
}
for (const [name, value] of records) {
  writeFileSync(join(out, `${safe(name)}.json`), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`json ${name}`);
}
console.log(`${shots.size} shots, ${records.size} records -> ${out}`);
