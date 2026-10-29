// Usage: node decode-wave2.mjs <acr-run.log> <outDir>   (E1W2_* records from tests/browser/audit-fix/e1-wave2.spec.ts)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [log, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const chunks = new Map();
const records = { fit: [], hop: [], loss: [], loss2: [], errors: [] };
for (const raw of readFileSync(log, "utf8").split(/\r?\n/)) {
  const line = raw.replace(/^.*?(E1W2_[A-Z]+ )/, "$1");
  if (line.startsWith("E1W2_JPG ")) {
    const [, game, shot, idx, b64] = line.split(" ");
    const [i, n] = idx.split("/").map(Number);
    const key = `${game}__${shot}`;
    if (!chunks.has(key)) chunks.set(key, { n, parts: [] });
    chunks.get(key).parts[i - 1] = b64;
  } else if (line.startsWith("E1W2_FIT ")) records.fit.push(JSON.parse(line.slice(9)));
  else if (line.startsWith("E1W2_HOP ")) records.hop.push(JSON.parse(line.slice(9)));
  else if (line.startsWith("E1W2_LOSS ")) records.loss.push(JSON.parse(line.slice(10)));
  else if (line.startsWith("E1W2_LOSS2 ")) records.loss2.push(JSON.parse(line.slice(11)));
  else if (line.startsWith("E1W2_ERR ")) records.errors.push(line.slice(9, 400));
}
let written = 0;
for (const [key, { n, parts }] of chunks) {
  if (parts.filter(Boolean).length !== n) continue;
  writeFileSync(`${out}/${key}.jpg`, Buffer.from(parts.join(""), "base64"));
  written++;
}
writeFileSync(`${out}/records.json`, JSON.stringify(records, null, 1) + "\n");
console.log(JSON.stringify({ jpgs: written, fit: records.fit.length, hop: records.hop.length, loss: records.loss.length, loss2: records.loss2.length, errors: records.errors.length }));
