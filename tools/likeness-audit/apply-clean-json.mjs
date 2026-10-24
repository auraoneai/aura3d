#!/usr/bin/env node
// Same as apply-clean-assets.mjs but for aura.assets.json: rewrites outputPath, url, hash, sizeBytes of the entry whose "id" is each key.
// Usage: node tools/likeness-audit/apply-clean-json.mjs <public-dir> <map.json> <aura.assets.json>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , publicDir, mapFile, target] = process.argv;
const map = JSON.parse(readFileSync(mapFile, "utf8"));
let text = readFileSync(target, "utf8");
let changed = 0;
for (const [key, file] of Object.entries(map)) {
  const buf = readFileSync(path.join(publicDir, "aura-assets", file));
  const hash = "sha256-" + createHash("sha256").update(buf).digest("hex");
  const at = text.indexOf(`"id": "${key}"`);
  if (at < 0) continue;
  const end = text.indexOf("\n    }", at);
  let block = text.slice(at, end < 0 ? text.length : end);
  block = block
    .replace(/"outputPath": "[^"]+"/, `"outputPath": "public/aura-assets/${file}"`)
    .replace(/"url": "[^"]+"/, `"url": "/aura-assets/${file}"`)
    .replace(/"hash": "[^"]+"/, `"hash": "${hash}"`)
    .replace(/"sizeBytes": \d+/, `"sizeBytes": ${buf.length}`);
  text = text.slice(0, at) + block + text.slice(end < 0 ? text.length : end);
  changed += 1;
  console.log(`${key} -> ${file}`);
}
writeFileSync(target, text);
console.log(`${changed} entries updated`);
