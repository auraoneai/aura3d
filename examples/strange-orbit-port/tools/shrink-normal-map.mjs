#!/usr/bin/env node
// Craterline GP: re-encode the lossless PNG normal map of an Idol GLB (about 2 MB at 1024 px, 4.6 MB at 2048 px) as a
// high-quality JPEG, optionally downsized, so each model stays near 1-3 MB. Base colour and metallic-roughness (already
// JPEG) are left untouched.
//   node examples/strange-orbit-port/tools/shrink-normal-map.mjs <in.glb> <out.glb> [size=1024]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [input, output, sizeArg] = process.argv.slice(2);
if (!input || !output) { console.error("usage: shrink-normal-map.mjs <in.glb> <out.glb> [size]"); process.exit(2); }
const size = Number(sizeArg ?? 1024);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const done = new Set();
for (const mat of doc.getRoot().listMaterials()) {
  const tex = mat.getNormalTexture();
  if (!tex || done.has(tex)) continue;
  done.add(tex);
  const [w] = tex.getSize() ?? [0];
  const jpg = await sharp(Buffer.from(tex.getImage())).resize(Math.min(w, size), Math.min(w, size), { kernel: "lanczos3" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  tex.setImage(new Uint8Array(jpg)).setMimeType("image/jpeg");
}
await io.write(output, doc);
