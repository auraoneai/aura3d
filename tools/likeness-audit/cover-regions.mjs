#!/usr/bin/env node
// Paints out marks in a GLB's base-colour texture: each region (x, y, rx, ry in texels, fill sampled from a nearby point) is
// covered by a flat ellipse of the surrounding body colour. Same output contract as soften-basecolor.mjs.
// Usage: node tools/likeness-audit/cover-regions.mjs <in.glb> <out-dir> <name> <regions.json>
//   regions.json: { "sample": [x, y], "regions": [[x, y, rx, ry], ...] }  (coordinates in the base-colour image's own pixel size)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , inFile, outDir, name, regionsFile] = process.argv;
if (!inFile || !outDir || !name || !regionsFile) { console.error("usage: cover-regions.mjs <in.glb> <out-dir> <name> <regions.json>"); process.exit(2); }
const cfg = JSON.parse(readFileSync(regionsFile, "utf8"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inFile);
let replaced = 0;
for (const mat of doc.getRoot().listMaterials()) {
  const tex = mat.getBaseColorTexture();
  if (!tex) continue;
  const src = Buffer.from(tex.getImage());
  const meta = await sharp(src).metadata();
  const raw = await sharp(src).removeAlpha().raw().toBuffer();
  const [sx, sy] = cfg.sample;
  const o = (sy * meta.width + sx) * 3;
  const fill = `rgb(${raw[o]},${raw[o + 1]},${raw[o + 2]})`;
  const shapes = cfg.regions.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${shapes}</svg>`);
  const out = meta.format === "png" ? await sharp(src).composite([{ input: svg }]).png().toBuffer() : await sharp(src).composite([{ input: svg }]).jpeg({ quality: 92 }).toBuffer();
  tex.setImage(new Uint8Array(out)).setMimeType(meta.format === "png" ? "image/png" : "image/jpeg");
  replaced += 1;
}
if (!replaced) { console.error("no base-colour texture found"); process.exit(1); }
const glb = Buffer.from(await io.writeBinary(doc));
const hash = createHash("sha256").update(glb).digest("hex");
const file = `${name}.${hash.slice(0, 8)}.glb`;
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, file), glb);
console.log(JSON.stringify({ file, sha256: hash, sizeBytes: glb.length, replaced }));
