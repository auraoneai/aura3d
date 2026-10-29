// Usage: node decode.mjs <acr-run.log> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [log, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const lines = readFileSync(log, "utf8").split(/\r?\n/);
const chunks = new Map();
const records = { meta: [], bloom: [], url: [], errors: [] };
for (const raw of lines) {
  const line = raw.replace(/^.*?(E1_[A-Z]+ )/, "$1");
  if (line.startsWith("E1_JPG ")) {
    const [, game, shot, idx, b64] = line.split(" ");
    const [i, n] = idx.split("/").map(Number);
    const key = `${game}__${shot}`;
    if (!chunks.has(key)) chunks.set(key, { n, parts: [] });
    chunks.get(key).parts[i - 1] = b64;
  } else if (line.startsWith("E1_META ")) records.meta.push(JSON.parse(line.slice(8)));
  else if (line.startsWith("E1_BLOOM ")) records.bloom.push(JSON.parse(line.slice(9)));
  else if (line.startsWith("E1_URL ")) records.url.push(JSON.parse(line.slice(7)));
  else if (line.startsWith("E1_ERR ")) records.errors.push(line.slice(7, 400));
}
let written = 0;
for (const [key, { n, parts }] of chunks) {
  if (parts.filter(Boolean).length !== n) continue;
  writeFileSync(`${out}/${key}.jpg`, Buffer.from(parts.join(""), "base64"));
  written++;
}
writeFileSync(`${out}/records.json`, JSON.stringify(records, null, 1) + "\n");
console.log(JSON.stringify({ jpgs: written, meta: records.meta.length, bloom: records.bloom.length, url: records.url.length, errors: records.errors.length }));
