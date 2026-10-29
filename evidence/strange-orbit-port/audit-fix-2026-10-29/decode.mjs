// usage: node decode.mjs <acr-log> <outdir> <prefix>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [log, out, prefix] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const parts = new Map();
const metas = [];
for (const line of readFileSync(log, "utf8").split("\n")) {
  let i = line.indexOf("SO_JPG ");
  if (i >= 0) {
    const [, t, id, frac, b64] = line.slice(i).trim().split(" ");
    const [k, n] = frac.split("/").map(Number);
    const key = `${t}__${id}`;
    if (!parts.has(key)) parts.set(key, { n, chunks: [] });
    parts.get(key).chunks[k - 1] = b64;
    continue;
  }
  i = line.indexOf("SO_META ");
  if (i >= 0) metas.push(line.slice(i + 8).trim());
}
for (const [key, { n, chunks }] of parts) {
  if (chunks.filter(Boolean).length !== n) { console.log("incomplete", key); continue; }
  writeFileSync(`${out}/${prefix}-${key}.jpg`, Buffer.from(chunks.join(""), "base64"));
  console.log("wrote", `${prefix}-${key}.jpg`);
}
writeFileSync(`${out}/${prefix}-meta.jsonl`, metas.join("\n") + (metas.length ? "\n" : ""));
