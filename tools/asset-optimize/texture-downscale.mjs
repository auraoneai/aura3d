#!/usr/bin/env node
// Usage: node tools/asset-optimize/texture-downscale.mjs <in.glb> <out.glb> [--max-verts 20000] [--tex 1024] [--no-simplify]
// Standalone copy of the pipeline used to shrink Cross Hop vehicle textures (2048 to 1024). Uses the repo node_modules: dedup, weld, simplify, prune, resize textures
// (sharp; colour/ORM -> jpeg, normal -> png), EXT_meshopt_compression.
import { createRequire } from "node:module";
import { statSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { dedup, weld, simplify, prune, textureCompress, meshopt, resample, reorder } = require("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = require("meshoptimizer");
const sharp = require("sharp");

const [inp, out, ...rest] = process.argv.slice(2);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const maxVerts = Number(opt("max-verts", 20000));
const tex = Number(opt("tex", 1024));

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(inp);
const countVerts = () => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getAttribute("POSITION")?.getCount() ?? 0), 0), 0);
const before = countVerts();
const skinned = doc.getRoot().listSkins().length > 0;
await doc.transform(dedup(), weld());
if (!rest.includes("--no-simplify") && before > maxVerts) {
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.02, maxVerts / before), error: Number(opt("error", "0.05")), lockBorder: skinned }));
}
await doc.transform(
  resample(), prune(),
  textureCompress({ encoder: sharp, resize: [tex, tex], targetFormat: "jpeg", slots: /^(?!normal)/, quality: 86 }),
  textureCompress({ encoder: sharp, resize: [tex, tex], slots: /^normal/ }),
  reorder({ encoder: MeshoptEncoder })
);
// Geometry stays float32 (no EXT_meshopt/quantisation): quantisation moves scale into a node transform, which skews
// `assets import-meshy` bounds/grounding checks. Pass --meshopt only for static background props you will not measure.
if (rest.includes("--meshopt")) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(out, doc);
console.log(JSON.stringify({ in: statSync(inp).size, out: statSync(out).size, vertsBefore: before, vertsAfter: countVerts(), skinned }));
