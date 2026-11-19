#!/usr/bin/env node
// Lamplight Line Idol byte budget: re-encode the lossless PNG maps of Idol GLBs (normal / ORM) as JPEG and optionally cap their
// size, keeping any texture that carries alpha a material reads (alpha-MASK base colour) as a palette PNG.
//   node examples/last-train-port/scripts/idol-shrink.mjs [--max 1024] [--quality 90] <glb...>   (rewrites in place)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const max = Number(opt("max", "0"));
const quality = Number(opt("quality", "90"));
const files = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of files) {
  const doc = await io.read(file);
  const alphaTextures = new Set();
  for (const m of doc.getRoot().listMaterials()) if (m.getAlphaMode() !== "OPAQUE" && m.getBaseColorTexture()) alphaTextures.add(m.getBaseColorTexture());
  let before = 0, after = 0;
  for (const t of doc.getRoot().listTextures()) {
    const img = Buffer.from(t.getImage());
    before += img.length;
    let pipe = sharp(img);
    const meta = await pipe.metadata();
    if (max > 0 && (meta.width ?? 0) > max) pipe = pipe.resize(max, max, { fit: "inside" });
    const keepPng = alphaTextures.has(t);
    const out = keepPng
      ? await pipe.png({ compressionLevel: 9, palette: true, quality: 92, effort: 10, dither: 0.6 }).toBuffer()
      : await pipe.removeAlpha().jpeg({ quality, chromaSubsampling: t.getMimeType() === "image/png" ? "4:4:4" : "4:2:0" }).toBuffer();
    if (out.length < img.length || max > 0) {
      t.setImage(new Uint8Array(out)).setMimeType(keepPng ? "image/png" : "image/jpeg");
      after += out.length;
    } else after += img.length;
  }
  await io.write(file, doc);
  console.log(JSON.stringify({ file, texturesMB: [+(before / 1e6).toFixed(2), +(after / 1e6).toFixed(2)] }));
}
