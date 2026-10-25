// node orient.mjs <in.glb> <out.glb>  : rotate so length (X) runs along -Z (front -X -> -Z), centre x/z, rest on y=0
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [inp, out, sign = "1"] = process.argv.slice(2);
const s = Number(sign); // 1: x'=-z, z'=x ; -1: x'=z, z'=-x
const d = await io.read(inp);
const prims = [];
for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) prims.push(p);
const rot = (v) => s === 1 ? [-v[2], v[1], v[0]] : [v[2], v[1], -v[0]];
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const p of prims) for (const name of ["POSITION", "NORMAL", "TANGENT"]) {
  const a = p.getAttribute(name); if (!a) continue;
  const n = a.getCount(), w = a.getElementSize();
  for (let i = 0; i < n; i++) { const v = a.getElement(i, new Array(w)); const r = rot(v); for (let k = 0; k < 3; k++) v[k] = r[k]; a.setElement(i, v);
    if (name === "POSITION") for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
}
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, y0 = mn[1];
for (const p of prims) { const a = p.getAttribute("POSITION"); for (let i = 0; i < a.getCount(); i++) { const v = a.getElement(i, [0, 0, 0]); a.setElement(i, [v[0] - cx, v[1] - y0, v[2] - cz]); } }
// drop any node transforms on mesh nodes
for (const n of d.getRoot().listNodes()) { if (n.getMesh()) { n.setTranslation([0,0,0]); n.setRotation([0,0,0,1]); n.setScale([1,1,1]); } }
await io.write(out, d);
console.log(inp.split("/").slice(-2).join("/"), "size", mx.map((v, i) => +(v - mn[i]).toFixed(3)).join("x"));
