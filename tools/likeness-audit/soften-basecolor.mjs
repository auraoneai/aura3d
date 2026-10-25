#!/usr/bin/env node
// Replaces a GLB's base-colour texture with a heavily downsampled, smoothly upscaled copy: the colour layout of the atlas
// survives (wood, red, gold, black patches) but any small-scale detail (framed photographs, faces, lettering) cannot.
// Usage: node tools/likeness-audit/soften-basecolor.mjs <in.glb> <out-dir> <name> [grid=40] [size=512]
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , inFile, outDir, name, gridArg, sizeArg] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: soften-basecolor.mjs <in.glb> <out-dir> <name> [grid] [size]"); process.exit(2); }
const GRID = Number(gridArg ?? 40), SIZE = Number(sizeArg ?? 512);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inFile);
let replaced = 0;
for (const mat of doc.getRoot().listMaterials()) {
  const tex = mat.getBaseColorTexture();
  if (!tex) continue;
  const small = await sharp(Buffer.from(tex.getImage())).resize(GRID, GRID, { kernel: "lanczos3", fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const jpg = await sharp(small.data, { raw: small.info }).resize(SIZE, SIZE, { kernel: "cubic", fit: "fill" }).blur(2).jpeg({ quality: 88 }).toBuffer();
  tex.setImage(new Uint8Array(jpg)).setMimeType("image/jpeg");
  replaced += 1;
}
if (!replaced) { console.error("no base-colour texture found"); process.exit(1); }
const glb = Buffer.from(await io.writeBinary(doc));
const hash = createHash("sha256").update(glb).digest("hex");
const file = `${name}.${hash.slice(0, 8)}.glb`;
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, file), glb);
console.log(JSON.stringify({ file, sha256: hash, sizeBytes: glb.length, replaced, inputBytes: (await import("node:fs")).readFileSync(inFile).length }));
