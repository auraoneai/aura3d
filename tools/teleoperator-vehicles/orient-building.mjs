// node orient-building.mjs <in.glb> <out.glb> : centre x/z on the origin and rest the model on y = 0 (no rotation; the facade faces +Z).
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [inp, out] = process.argv.slice(2);
const d = await io.read(inp);
const prims = d.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const p of prims) { const a = p.getAttribute("POSITION"); for (let i = 0; i < a.getCount(); i++) { const v = a.getElement(i, [0, 0, 0]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } }
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
for (const p of prims) { const a = p.getAttribute("POSITION"); for (let i = 0; i < a.getCount(); i++) { const v = a.getElement(i, [0, 0, 0]); a.setElement(i, [v[0] - cx, v[1] - mn[1], v[2] - cz]); } }
for (const n of d.getRoot().listNodes()) if (n.getMesh()) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }
await io.write(out, d);
console.log(inp.split("/").slice(-2).join("/"), "size", mx.map((v, i) => +(v - mn[i]).toFixed(3)).join("x"));
