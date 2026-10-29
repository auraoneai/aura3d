#!/usr/bin/env node
// Re-encodes the opaque PNG base-colour textures in examples/ninja-runner-port/assets/meshy/*.glb as JPEG (core glTF
// image/jpeg, no extension or decoder needed). Only RGB PNGs (no alpha channel) are converted; geometry, skins,
// animations, materials and the other maps are copied unchanged. Then regenerate the manifest:
//   node tools/crayon-capture/ninja-runner-jpeg-textures.mjs [quality=90]
//   node tools/crayon-capture/ninja-runner-meshy-manifest.mjs
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const sharp = require("sharp");

const quality = Number(process.argv[2] ?? 90);
const dir = new URL("../../examples/ninja-runner-port/assets/meshy/", import.meta.url).pathname;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let before = 0, after = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith(".glb")).sort()) {
  const buf = readFileSync(dir + f);
  const doc = await io.readBinary(new Uint8Array(buf));
  let changed = 0;
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.getMimeType() !== "image/png") continue;
    const image = tex.getImage();
    if (!image) continue;
    const meta = await sharp(Buffer.from(image)).metadata();
    if (meta.hasAlpha || meta.channels !== 3) continue;
    const jpg = await sharp(Buffer.from(image)).jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    tex.setImage(new Uint8Array(jpg)).setMimeType("image/jpeg");
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.png$/i, ".jpg"));
    changed++;
  }
  if (!changed) continue;
  const out = await io.writeBinary(doc);
  writeFileSync(dir + f, out);
  before += buf.length; after += out.length;
  console.log(`${f}: ${buf.length} -> ${out.length} bytes (${changed} texture${changed > 1 ? "s" : ""})`);
}
console.log(`total ${before} -> ${after} bytes`);
