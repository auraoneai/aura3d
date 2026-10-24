// Rebuild PERFCOST_CHUNK log lines into JSON files: node extract.mjs <outDir> <acr-run.log...>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const [outDir, ...logs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const parts = new Map();
for (const log of logs) {
  for (const line of readFileSync(log, "utf8").split("\n")) {
    const m = line.match(/PERFCOST_CHUNK (\S+) (\d+) (\d+) (\S+)/);
    if (!m) continue;
    const [, name, i, n, b64] = m;
    if (!parts.has(name)) parts.set(name, { n: Number(n), chunks: new Map() });
    parts.get(name).chunks.set(Number(i), b64);
  }
}
for (const [name, p] of parts) {
  if (p.chunks.size !== p.n) { console.error(`incomplete ${name}: ${p.chunks.size}/${p.n}`); continue; }
  const b64 = [...Array(p.n).keys()].map((i) => p.chunks.get(i)).join("");
  writeFileSync(`${outDir}/${name}.json`, Buffer.from(b64, "base64"));
  console.log("wrote", name);
}
