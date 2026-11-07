// fx522: bundle sizes per build, Rapier chunk presence, and byte comparison of the kept build with the no-plugin build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const D = "/tmp/fx522-consumer";
const files = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(path.join(dir, f)).isFile()).sort();
const out = {};
for (const label of ["nophys-aura3d", "golf-aura3d", "golf-none", "golf-aura3d-old"]) {
  const dir = path.join(D, `dist-${label}`);
  const js = files(dir).filter((f) => f.endsWith(".js") && f.startsWith("assets/"));
  let bytes = 0, gzip = 0;
  for (const f of js) { const b = readFileSync(path.join(dir, f)); bytes += b.length; gzip += gzipSync(b, { level: 9 }).length; }
  const rapier = js.filter((f) => /(^|\/)rapier-/.test(f)).map((f) => ({ file: f, bytes: statSync(path.join(dir, f)).size }));
  const log = readFileSync(path.join(D, `build-${label}.log`), "utf8");
  out[label] = { jsBytes: bytes, jsGzip9: gzip, jsFiles: js.length, rapierChunk: rapier, decision: (/\[aura3d\][^\n]*/.exec(log) ?? [null])[0] };
}
const hashAll = (label) => {
  const dir = path.join(D, `dist-${label}`);
  return Object.fromEntries(files(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".html")) && !f.startsWith("aura-decoders/")).map((f) => [f, createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex")]));
};
const a = hashAll("golf-aura3d"), b = hashAll("golf-none");
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
out.golfKeptVsNoPlugin = { jsAndHtmlFiles: keys.length, identical: keys.every((k) => a[k] === b[k]), differing: keys.filter((k) => a[k] !== b[k]) };
console.log(JSON.stringify(out, null, 2));
