// node tools/teleoperator-vehicles/decode.mjs <acr-run.log> <outDir>: rebuild TELEART_FRAME chunks into JPEG files
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [log, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const parts = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = /TELEART_FRAME (\S+) (\d+) (\d+) (\S+)/.exec(line);
  if (!m) continue;
  const [, name, i, n, payload] = m;
  const e = parts.get(name) ?? { n: Number(n), chunks: [] };
  e.chunks[Number(i)] = payload;
  parts.set(name, e);
}
let written = 0;
for (const [name, e] of parts) {
  if (e.chunks.filter(Boolean).length !== e.n) continue;
  writeFileSync(join(out, `${name}.jpg`), Buffer.from(e.chunks.join(""), "base64"));
  written++;
}
console.log(`decoded ${written} of ${parts.size} frames into ${out}`);
