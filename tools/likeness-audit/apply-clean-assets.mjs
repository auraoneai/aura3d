#!/usr/bin/env node
// Points typed-asset entries at repainted GLBs: rewrites url, hash, sizeBytes (and the materials list when present) for each key.
// Usage: node tools/likeness-audit/apply-clean-assets.mjs <public-dir> <map.json> <file>...
//   map.json: { "<assetKey>": "<new-file-name>.glb", ... }   (files are read from <public-dir>/aura-assets/)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , publicDir, mapFile, ...targets] = process.argv;
const map = JSON.parse(readFileSync(mapFile, "utf8"));
function glbInfo(file) {
  const buf = readFileSync(path.join(publicDir, "aura-assets", file));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  return { size: buf.length, hash: "sha256-" + createHash("sha256").update(buf).digest("hex"), materials: (json.materials ?? []).map((m) => m.name) };
}
let changed = 0;
for (const target of targets) {
  let text = readFileSync(target, "utf8");
  for (const [key, file] of Object.entries(map)) {
    const m = new RegExp(`^(\\s*)"?${key}"?: \\{`, "m").exec(text);
    if (!m) continue;
    const info = glbInfo(file);
    const start = m.index;
    const next = text.indexOf("\n" + m[1] + "}", start);
    let block = text.slice(start, next < 0 ? text.length : next);
    block = block.replace(/url: "[^"]+"/, `url: "/aura-assets/${file}"`).replace(/hash: "[^"]+"/, `hash: "${info.hash}"`);
    if (/sizeBytes:/.test(block)) block = block.replace(/sizeBytes: \d+/, `sizeBytes: ${info.size}`);
    block = block.replace(/("materials": \[)[^\]]*(\])/, `$1\n${info.materials.map((n) => `        "${n}"`).join(",\n")}\n      $2`);
    text = text.slice(0, start) + block + text.slice(next < 0 ? text.length : next);
    changed += 1;
    console.log(`${path.relative(process.cwd(), target)}: ${key} -> ${file}`);
  }
  writeFileSync(target, text);
}
console.log(`${changed} entries updated`);
