import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/gurbakshchahal/platforms/aura3d/package.json");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const dir = "/Users/gurbakshchahal/platforms/aura3d/examples/drift-and-deliver-port/assets/models/";
const below = { hypercar: 0.25, sedan: 0.32, hatch: 0.47, van: 0.52, truck: 0.49 };
for (const [k, b] of Object.entries(below)) {
  const doc = await io.read(dir + k + ".glb");
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute("POSITION"); const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); pos.setElement(i, [v[2], v[1] + b, -v[0]]); }
    const nor = p.getAttribute("NORMAL");
    if (nor) for (let i = 0; i < nor.getCount(); i++) { nor.getElement(i, v); nor.setElement(i, [v[2], v[1], -v[0]]); }
  }
  await io.write(dir + k + ".glb", doc);
  console.log(k, createHash("sha256").update(readFileSync(dir + k + ".glb")).digest("hex"));
}
