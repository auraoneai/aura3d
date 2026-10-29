#!/usr/bin/env node
// Decode RH_JPG chunks and RH_META lines from a remote-acr run log into <outDir>/<name>.jpg and <outDir>/meta.jsonl.
//   node evidence/roadster-hours-port/audit-fix/decode.mjs tests/reports/remote-acr/<RUN_ID>/acr-run.log <outDir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, out] = process.argv.slice(2);
if (!log || !out) { console.error("usage: decode.mjs <acr-run.log> <outDir>"); process.exit(2); }
mkdirSync(out, { recursive: true });
const chunks = new Map();
const meta = [];
for (const raw of readFileSync(log, "utf8").split("\n")) {
  const line = raw.replace(/^.*?(RH_(?:JPG|META|ERR|CONSOLE|DONE) )/, "$1");
  if (line.startsWith("RH_JPG ")) {
    const [, name, part, b64] = line.split(" ");
    const [i, n] = part.split("/").map(Number);
    if (!chunks.has(name)) chunks.set(name, { n, parts: [] });
    chunks.get(name).parts[i - 1] = b64;
  } else if (line.startsWith("RH_META ")) {
    meta.push(line.slice(8));
  } else if (line.startsWith("RH_ERR ") || line.startsWith("RH_DONE ")) {
    meta.push(JSON.stringify({ log: line }));
  }
}
for (const [name, { n, parts }] of chunks) {
  const complete = parts.filter(Boolean).length === n;
  if (!complete) { console.warn(`incomplete ${name}: ${parts.filter(Boolean).length}/${n}`); continue; }
  writeFileSync(join(out, `${name}.jpg`), Buffer.from(parts.join(""), "base64"));
  console.log(`wrote ${name}.jpg`);
}
writeFileSync(join(out, "meta.jsonl"), meta.join("\n") + "\n");
console.log(`meta lines: ${meta.length}`);
