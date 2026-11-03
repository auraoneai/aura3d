// Fits a Meshy retexture back onto the game's baked source mesh: Meshy re-exports a retexture centred and scaled to a 2 m
// long axis, with the source's orientation. This scales it uniformly and moves it so its bounds match the source GLB's
// (Apex convention: front toward -z, wheels on y = 0, centred on x and z). No rotation: run tools/apex/bake-vehicle.mjs
// first if a retexture ever comes back facing -x. Prints both bounds and a 20-slice height profile distance (same vs flipped).
// usage: node apps/showcase-roadster-rush/tools/fit-retexture.mjs <source.glb> <retexture.glb> <out.glb>  (from the repo root)
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../../../package.json", import.meta.url).pathname);
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [srcFile, retexFile, outFile] = process.argv.slice(2);
const positions = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).map((p) => p.getAttribute("POSITION"));
const bounds = (doc) => {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = [0, 0, 0];
  for (const a of positions(doc)) for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
  return { mn, mx, size: mx.map((m, k) => m - mn[k]) };
};
const profile = (doc) => {
  const b = bounds(doc), h = new Array(20).fill(0), v = [0, 0, 0];
  for (const a of positions(doc)) for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const s = Math.min(19, Math.floor(((v[2] - b.mn[2]) / b.size[2]) * 20)); h[s] = Math.max(h[s], (v[1] - b.mn[1]) / b.size[1]); }
  return h;
};
const src = await io.read(srcFile);
const doc = await io.read(retexFile);
for (const n of doc.getRoot().listNodes()) { const t = n.getTranslation(), r = n.getRotation(), s = n.getScale(); if (t.some((x) => x !== 0) || r[3] !== 1 || s.some((x) => x !== 1)) throw new Error(`node ${n.getName()} carries a transform; bake it first`); }
const sb = bounds(src), rb = bounds(doc);
const k = sb.size[2] / rb.size[2];
const v = [0, 0, 0];
for (const a of positions(doc)) for (let i = 0; i < a.getCount(); i++) {
  a.getElement(i, v);
  a.setElement(i, [(v[0] - (rb.mn[0] + rb.mx[0]) / 2) * k + (sb.mn[0] + sb.mx[0]) / 2, (v[1] - rb.mn[1]) * k + sb.mn[1], (v[2] - (rb.mn[2] + rb.mx[2]) / 2) * k + (sb.mn[2] + sb.mx[2]) / 2]);
}
const ob = bounds(doc);
const ps = profile(src), po = profile(doc);
const dist = (x, y) => x.reduce((s, _, i) => s + Math.abs(x[i] - y[i]), 0);
await io.write(outFile, doc);
const fmt = (b) => `min ${b.mn.map((x) => x.toFixed(3)).join(",")} max ${b.mx.map((x) => x.toFixed(3)).join(",")}`;
console.log(JSON.stringify({ source: fmt(sb), retexture: fmt(rb), out: fmt(ob), scale: Number(k.toFixed(4)), profileSame: Number(dist(ps, po).toFixed(3)), profileFlipped: Number(dist(ps, [...po].reverse()).toFixed(3)), sha256: createHash("sha256").update(readFileSync(outFile)).digest("hex") }, null, 1));
