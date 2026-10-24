// Bakes a Meshy vehicle GLB to the Apex convention: long axis along z, front toward -z (the player drives toward -z),
// centred on x and z, wheels on y = 0. Meshy cars come out with the front toward -x; positions, normals and tangents are rotated.
// usage: node tools/apex/bake-vehicle.mjs <model.glb> [more.glb ...]   (run from the repo root; uses the repo's node_modules)
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url).pathname);
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const v = [0, 0, 0];
  for (const p of prims) {
    const pos = p.getAttribute("POSITION");
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); pos.setElement(i, [-v[2], v[1], v[0]]); }
    for (const name of ["NORMAL"]) {
      const a = p.getAttribute(name);
      if (a) for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); a.setElement(i, [-v[2], v[1], v[0]]); }
    }
    const t = p.getAttribute("TANGENT");
    if (t) { const w = [0, 0, 0, 0]; for (let i = 0; i < t.getCount(); i++) { t.getElement(i, w); t.setElement(i, [-w[2], w[1], w[0], w[3]]); } }
  }
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of prims) { const pos = p.getAttribute("POSITION"); for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } }
  const off = [-(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2];
  for (const p of prims) { const pos = p.getAttribute("POSITION"); for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); pos.setElement(i, [v[0] + off[0], v[1] + off[1], v[2] + off[2]]); } }
  for (const n of doc.getRoot().listNodes()) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }
  await io.write(file, doc);
  console.log(file.split("/").slice(-2).join("/"), "size", mx.map((m, k) => (m - mn[k]).toFixed(2)).join("x"), "sha256", createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12));
}
