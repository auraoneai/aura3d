// Decode `@@SD slug profile state idx n b64` chunks from a remote-acr log into JPEGs and write per-profile metadata.
// Usage: node tools/shots/decode-shotsd.mjs <acr-run.log> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const [log, outDir] = process.argv.slice(2);
if (!log || !outDir) { console.error("usage: decode-shotsd.mjs <log> <outDir>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const parts = new Map();
const meta = {};
for (const raw of readFileSync(log, "utf8").split("\n")) {
  const line = raw.replace(/^.*?(@@SD(?:META)?\b)/, "$1");
  if (line.startsWith("@@SDMETA ")) {
    const m = /^@@SDMETA (\S+) (\S+) (.*)$/.exec(line.trim());
    if (m) { try { (meta[m[1]] ??= {})[m[2]] = JSON.parse(m[3]); } catch { /* ignore */ } }
  } else if (line.startsWith("@@SD ")) {
    const m = /^@@SD (\S+) (\S+) (\S+) (\d+) (\d+) (\S+)$/.exec(line.trim());
    if (!m) continue;
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    const e = parts.get(key) ?? { n: Number(m[5]), chunks: [] };
    e.chunks[Number(m[4])] = m[6];
    parts.set(key, e);
  }
}
let written = 0;
const incomplete = [];
for (const [key, e] of parts) {
  const [, profile, state] = key.split("|");
  if (e.chunks.length !== e.n || e.chunks.some((c) => c === undefined)) { incomplete.push(key); continue; }
  writeFileSync(path.join(outDir, `${profile}-${state}.jpg`), Buffer.from(e.chunks.join(""), "base64"));
  written++;
}
writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({ meta, incomplete }, null, 2));
console.log(`wrote ${written} frames, ${incomplete.length} incomplete -> ${outDir}`);
