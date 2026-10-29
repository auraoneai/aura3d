// usage: node decode-play.mjs <acr-log> <outdir> <prefix>
// Decodes SOP_JPG chunks (tests/browser/audit-fix/strange-orbit-port-play.spec.ts) and @@SB chunks
// (tests/browser/shotsb-orbit.spec.ts, the inventory screens) and collects SOP_META / @@SBSTATE lines.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [log, out, prefix] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const parts = new Map();
const metas = [];
const put = (key, k, n, b64) => {
  if (!parts.has(key)) parts.set(key, { n, chunks: [] });
  parts.get(key).chunks[k] = b64;
};
for (const line of readFileSync(log, "utf8").split("\n")) {
  let i = line.indexOf("SOP_JPG ");
  if (i >= 0) {
    const [, name, frac, b64] = line.slice(i).trim().split(" ");
    const [k, n] = frac.split("/").map(Number);
    put(`${prefix}-${name}`, k - 1, n, b64);
    continue;
  }
  i = line.indexOf("@@SB ");
  if (i >= 0) {
    const [, , name, k, n, b64] = line.slice(i).trim().split(" ");
    put(`sb-${name}`, Number(k), Number(n), b64);
    continue;
  }
  for (const tag of ["SOP_META ", "@@SBSTATE ", "@@SBTITLE ", "@@SBERRORS ", "SOP_ERR ", "SOP_WARN "]) {
    i = line.indexOf(tag);
    if (i >= 0) { metas.push(line.slice(i).trim()); break; }
  }
}
for (const [key, { n, chunks }] of parts) {
  if (chunks.filter(Boolean).length !== n) { console.log("incomplete", key); continue; }
  writeFileSync(`${out}/${key}.jpg`, Buffer.from(chunks.join(""), "base64"));
  console.log("wrote", `${key}.jpg`);
}
writeFileSync(`${out}/${prefix}-play-meta.txt`, metas.join("\n") + (metas.length ? "\n" : ""));
