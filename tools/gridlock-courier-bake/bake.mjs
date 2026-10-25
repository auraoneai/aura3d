// Gridlock Courier hero car: bake a prepped Meshy GLB to the port's car convention.
// Meshy cars face -x with their length along x; the port wants +z forward, lowest point at y = 0.
// usage: node tools/gridlock-courier-bake/bake.mjs <in.glb> <out.glb>
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [input, output] = process.argv.slice(2);
const doc = await io.read(input);
for (const node of doc.getRoot().listNodes()) {
  const t = node.getTranslation(), r = node.getRotation(), s = node.getScale();
  if (t.some((v) => v) || r[0] || r[1] || r[2] || s.some((v) => v !== 1)) throw new Error("node transforms must be baked first");
}
let minY = Infinity;
const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
for (const p of prims) { const a = p.getAttribute("POSITION"); const v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); minY = Math.min(minY, v[1]); } }
const v = [0, 0, 0];
for (const p of prims) {
  const pos = p.getAttribute("POSITION");
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); pos.setElement(i, [v[2], v[1] - minY, -v[0]]); }
  const nor = p.getAttribute("NORMAL");
  if (nor) for (let i = 0; i < nor.getCount(); i++) { nor.getElement(i, v); nor.setElement(i, [v[2], v[1], -v[0]]); }
  const tan = p.getAttribute("TANGENT");
  if (tan) { const t4 = [0, 0, 0, 0]; for (let i = 0; i < tan.getCount(); i++) { tan.getElement(i, t4); tan.setElement(i, [t4[2], t4[1], -t4[0], t4[3]]); } }
}
await io.write(output, doc);
console.log(JSON.stringify({ output, lift: -minY, sha256: createHash("sha256").update(readFileSync(output)).digest("hex") }));
