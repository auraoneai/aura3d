// Decode a remote-acr run log of tests/browser/audit-fix/roadster-rush.spec.ts into JPEG frames and JSON lines.
// Usage: node decode.mjs <acr-run.log> <out-dir>
// Writes <out-dir>/<target>/<shot>.jpg, <out-dir>/meta.jsonl (GL_META) and <out-dir>/probes.jsonl (GL_PROBE).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, out] = process.argv.slice(2);
if (!log || !out) throw new Error("usage: node decode.mjs <acr-run.log> <out-dir>");
mkdirSync(out, { recursive: true });
const chunks = new Map();
const metas = [];
const probes = [];
for (const raw of readFileSync(log, "utf8").split("\n")) {
  const jpg = raw.indexOf("GL_JPG ");
  if (jpg >= 0) {
    const [, target, shot, part, b64] = raw.slice(jpg).trim().split(" ");
    const [i, n] = part.split("/").map(Number);
    const key = `${target}\u0000${shot}`;
    if (!chunks.has(key)) chunks.set(key, { target, shot, n, parts: [] });
    chunks.get(key).parts[i - 1] = b64;
    continue;
  }
  const meta = raw.indexOf("GL_META ");
  if (meta >= 0) { metas.push(raw.slice(meta + 8).trim()); continue; }
  const probe = raw.indexOf("GL_PROBE ");
  if (probe >= 0) probes.push(raw.slice(probe + 9).trim());
}
let frames = 0;
for (const { target, shot, n, parts } of chunks.values()) {
  if (parts.filter(Boolean).length !== n) { console.warn(`incomplete ${target} ${shot}: ${parts.filter(Boolean).length}/${n}`); continue; }
  mkdirSync(join(out, target), { recursive: true });
  writeFileSync(join(out, target, `${shot}.jpg`), Buffer.from(parts.join(""), "base64"));
  frames++;
}
writeFileSync(join(out, "meta.jsonl"), metas.map((m) => `${m}\n`).join(""));
writeFileSync(join(out, "probes.jsonl"), probes.map((m) => `${m}\n`).join(""));
console.log(`${frames} frames, ${metas.length} meta lines, ${probes.length} probe lines -> ${out}`);
