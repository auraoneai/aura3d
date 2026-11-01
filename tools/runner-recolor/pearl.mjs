#!/usr/bin/env node
// GU47 phase 4 (distinctness): Serpentine Sky Run's runner outfit from the teal-and-silver atlas (recolor.mjs) to a red
// lacquer pilgrim robe over pearl (identity row: red lacquer, mother-of-pearl). Teal outfit pixels become red lacquer, the
// silver trim becomes warm pearl; skin and hair (low saturation or dark) stay as generated. Per-colourway tints: styles.ts.
// Usage: node tools/runner-recolor/pearl.mjs <in.glb> <out.glb>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("usage: pearl.mjs <in.glb> <out.glb>"); process.exit(2); }

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max === 0 ? 0 : d / max, max / 255];
}
function rgb(h, s, v) {
  const c = v * s, hp = h / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
export function pearlPixel(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (h > 150 && h < 200 && s > 0.3 && v > 0.12) return rgb(356, 0.74, Math.min(0.62, 0.2 + v * 0.62)); // teal outfit to red lacquer
  if (h > 200 && h < 230 && s <= 0.14 && v > 0.35) return rgb(34, 0.1, Math.min(0.9, 0.3 + v * 0.7)); // silver trim to warm pearl
  return [r, g, b];
}

const io = new NodeIO();
const doc = await io.read(inFile);
const tex = doc.getRoot().listMaterials()[0].getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let changed = 0;
for (let i = 0; i < data.length; i += 3) { const o = pearlPixel(data[i], data[i + 1], data[i + 2]); if (o[0] !== data[i] || o[1] !== data[i + 1] || o[2] !== data[i + 2]) changed++; data[i] = o[0]; data[i + 1] = o[1]; data[i + 2] = o[2]; }
const jpeg = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
tex.setImage(new Uint8Array(jpeg)).setMimeType("image/jpeg");
const bytes = await io.writeBinary(doc);
writeFileSync(outFile, bytes);
console.log(JSON.stringify({ out: outFile, bytes: bytes.length, changedPixels: changed, sha256: createHash("sha256").update(readFileSync(outFile)).digest("hex") }));
