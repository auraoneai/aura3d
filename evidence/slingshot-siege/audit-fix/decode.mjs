#!/usr/bin/env node
// Decode the Slingshot Siege audit-fix capture log (tests/browser/audit-fix/slingshot-siege.spec.ts).
//   node evidence/slingshot-siege/audit-fix/decode.mjs <acr-run.log> <outDir> [screensDir]
// Writes <outDir>/<target>-<shot>.jpg for SS_JPG chunks, <outDir>/meta.jsonl (SS_META, SS_CHECK, SS_SHOTMETA),
// and, when screensDir is given, SS_SHOT frames to <screensDir>/<set>/<file>.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, outDir, screensDir] = process.argv.slice(2);
if (!log || !outDir) {
  console.error("usage: decode.mjs <acr-run.log> <outDir> [screensDir]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const jpg = new Map();
const shots = new Map();
const meta = [];
for (const raw of readFileSync(log, "latin1").split("\n")) {
  const at = raw.search(/SS_(JPG|SHOT|META|CHECK|SHOTMETA|ERR|CONSOLE) /);
  if (at < 0) continue;
  const line = raw.slice(at).trimEnd();
  const kind = line.slice(0, line.indexOf(" "));
  const rest = line.slice(kind.length + 1);
  if (kind === "SS_JPG" || kind === "SS_SHOT") {
    const [a, b, part, b64] = rest.split(" ");
    const [i, n] = part.split("/").map(Number);
    const map = kind === "SS_JPG" ? jpg : shots;
    const key = `${a}\u0000${b}`;
    const entry = map.get(key) ?? { n, parts: [] };
    entry.parts[i - 1] = b64;
    map.set(key, entry);
  } else if (kind === "SS_META" || kind === "SS_CHECK" || kind === "SS_SHOTMETA") {
    try { meta.push({ kind, ...JSON.parse(rest) }); } catch { meta.push({ kind, raw: rest.slice(0, 400) }); }
  } else {
    meta.push({ kind, raw: rest.slice(0, 400) });
  }
}
let written = 0;
for (const [key, entry] of jpg) {
  const [target, shot] = key.split("\u0000");
  if (entry.parts.filter(Boolean).length !== entry.n) { console.error(`incomplete ${target} ${shot}`); continue; }
  writeFileSync(join(outDir, `${target}-${shot}.jpg`), Buffer.from(entry.parts.join(""), "base64"));
  written += 1;
}
if (screensDir) {
  for (const [key, entry] of shots) {
    const [set, file] = key.split("\u0000");
    if (entry.parts.filter(Boolean).length !== entry.n) { console.error(`incomplete ${set} ${file}`); continue; }
    mkdirSync(join(screensDir, set), { recursive: true });
    writeFileSync(join(screensDir, set, file), Buffer.from(entry.parts.join(""), "base64"));
    written += 1;
  }
}
writeFileSync(join(outDir, "meta.jsonl"), meta.map((m) => JSON.stringify(m)).join("\n") + "\n");
console.log(`wrote ${written} frames and ${meta.length} meta lines to ${outDir}`);
