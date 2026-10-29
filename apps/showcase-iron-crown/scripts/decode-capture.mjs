// Decode a remote ACR run log of tests/browser/audit-fix/iron-crown.spec.ts: writes <target>/<shot>.jpg for every
// GL_JPG stream and meta.json with every GL_META / GL_PROBE / GL_READY / GL_ERR line.
// Usage: node apps/showcase-iron-crown/scripts/decode-capture.mjs <acr-run.log> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [logFile, outDir] = process.argv.slice(2);
const text = readFileSync(logFile, "utf8").replace(/\r/g, "\n");
const chunks = new Map();
const meta = [], probes = [], other = [];
for (const raw of text.split("\n")) {
  const i = raw.search(/GL_(JPG|META|PROBE|READY|ERR|CONSOLE|REQFAIL|DONE) /);
  if (i < 0) continue;
  const line = raw.slice(i).trim();
  if (line.startsWith("GL_JPG ")) {
    const [, target, shot, part, data] = line.split(" ");
    const [k, n] = part.split("/").map(Number);
    const key = `${target}/${shot}`;
    if (!chunks.has(key)) chunks.set(key, { n, parts: [] });
    chunks.get(key).parts[k - 1] = data;
  } else if (line.startsWith("GL_META ")) meta.push(JSON.parse(line.slice(8)));
  else if (line.startsWith("GL_PROBE ")) probes.push(JSON.parse(line.slice(9)));
  else other.push(line.slice(0, 400));
}
const written = [];
for (const [key, { n, parts }] of chunks) {
  if (parts.filter(Boolean).length !== n) { other.push(`INCOMPLETE ${key} ${parts.filter(Boolean).length}/${n}`); continue; }
  const file = path.join(outDir, `${key}.jpg`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(parts.join(""), "base64"));
  written.push(key);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({ log: path.basename(path.dirname(logFile)), shots: written, meta, probes, other }, null, 2) + "\n");
console.log(`${written.length} frames, ${meta.length} meta, ${probes.length} probes`);
