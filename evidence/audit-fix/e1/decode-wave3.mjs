// Decodes E1W3_META / E1W3_JPG records from a remote acr-run.log: node decode-wave3.mjs <acr-run.log> <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [log, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const metas = []; const jpgs = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const m = line.match(/E1W3_META (\{.*\})\s*$/); if (m) { metas.push(JSON.parse(m[1])); continue; }
  const j = line.match(/E1W3_JPG (\S+) (\d+)\/(\d+) (\S+)/);
  if (j) { const parts = jpgs.get(j[1]) ?? []; parts[Number(j[2]) - 1] = j[4]; jpgs.set(j[1], parts); }
}
writeFileSync(join(out, "records.json"), `${JSON.stringify(metas, null, 2)}\n`);
for (const [name, parts] of jpgs) writeFileSync(join(out, `roadster-hours-port__${name}.jpg`), Buffer.from(parts.join(""), "base64"));
console.log(`${metas.length} records, ${jpgs.size} images -> ${out}`);
