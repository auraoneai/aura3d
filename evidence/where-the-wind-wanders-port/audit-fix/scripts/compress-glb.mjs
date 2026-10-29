#!/usr/bin/env node
// Shrink the game's Meshy GLBs for first load (audit WW-8):
//   - textures re-encoded as JPEG (base colour and metal/rough at quality 85, normal maps at 92) and capped at --tex px;
//   - optional --meshopt: gltf-transform `meshopt` (quantise positions/normals/UVs, then EXT_meshopt_compression). The
//     dequantisation moves into the mesh node's transform; the engine computes model bounds through node world matrices
//     (packages/assets/src/GLTFRenderResources.ts computeGLTFRenderResourceBounds), so fit and grounding hold to about
//     1e-4 of the model size. Not used on the skinned hero (its unit tests read raw float accessors).
// Geometry is never welded or simplified (meshopt may reorder vertices for compression).
// Usage: node compress-glb.mjs <in.glb> <out.glb> [--tex 1024] [--meshopt]
import { createRequire } from "node:module";
import { statSync } from "node:fs";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { textureCompress, meshopt } = require("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = require("meshoptimizer");
const sharp = require("sharp");

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) { console.error("usage: compress-glb.mjs <in> <out> [--tex N] [--meshopt]"); process.exit(2); }
const opt = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : fallback; };
const tex = Number(opt("tex", "1024"));

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(input);
await doc.transform(
  textureCompress({ encoder: sharp, resize: [tex, tex], targetFormat: "jpeg", slots: /^(?!normalTexture)/, quality: 85 }),
  textureCompress({ encoder: sharp, resize: [tex, tex], targetFormat: "jpeg", slots: /^normalTexture$/, quality: 92 })
);
if (rest.includes("--meshopt")) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(output, doc);
const images = doc.getRoot().listTextures().map((t) => ({ mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength ?? 0 }));
console.log(JSON.stringify({ in: statSync(input).size, out: statSync(output).size, tex, meshopt: rest.includes("--meshopt"), images }));
