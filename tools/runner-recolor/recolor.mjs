#!/usr/bin/env node
// Serpentine Sky Run runner: the Meshy base-colour atlas is orange outfit shards, dark blue trim and peach skin. Recolour only the
// saturated pixels (orange to teal, blue to silver); skin and hair are low saturation or dark and stay as generated.
// Usage: node tools/runner-recolor/recolor.mjs <in.glb> <out.glb>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("usage: recolor.mjs <in.glb> <out.glb>"); process.exit(2); }

export function recolorPixel(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max / 255, s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  let nh = h, ns = s, nv = v;
  if (s > 0.62 && v > 0.45 && (h < 45 || h > 345)) { nh = 176 + (h - 20) * 0.3; ns = Math.min(0.66, s * 0.7); nv = Math.min(0.72, v * 0.66); } // orange outfit to teal
  else if (h > 195 && h < 260 && s > 0.3 && v > 0.12) { nh = 215; ns = 0.1; nv = Math.min(0.82, 0.38 + v * 0.7); } // blue trim to silver
  const c = nv * ns, hp = nh / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  let [rr, gg, bb] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = nv - c;
  return [Math.round((rr + m) * 255), Math.round((gg + m) * 255), Math.round((bb + m) * 255)];
}

const io = new NodeIO();
const doc = await io.read(inFile);
const mat = doc.getRoot().listMaterials()[0];
const tex = mat.getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 3) { const [r, g, b] = recolorPixel(data[i], data[i + 1], data[i + 2]); data[i] = r; data[i + 1] = g; data[i + 2] = b; }
const jpeg = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
tex.setImage(new Uint8Array(jpeg)).setMimeType("image/jpeg");
const bytes = await io.writeBinary(doc);
writeFileSync(outFile, bytes);
console.log(JSON.stringify({ out: outFile, bytes: bytes.length, sha256: createHash("sha256").update(readFileSync(outFile)).digest("hex") }));
