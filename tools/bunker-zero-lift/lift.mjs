#!/usr/bin/env node
// Lifts a near-black base-colour atlas to a readable brightness with a per-asset gamma (v' = v^e), keeping its detail.
// A multiply tint cannot brighten a texture, so very dark models either stay black or get flooded with emissive (flat).
// Usage: node tools/bunker-zero-lift/lift.mjs <in.glb> <out-dir> <name> [--target 95]
// Prints {"file","sizeBytes","sha256","meanBefore","meanAfter","exponent"}; the output is <out-dir>/<name>.<sha256-8>.glb.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const [, , inFile, outDir, name, ...rest] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: lift.mjs <in.glb> <out-dir> <name> [--target 95]"); process.exit(2); }
const target = Number(rest[rest.indexOf("--target") + 1] || 95);

const io = new NodeIO();
const doc = await io.read(inFile);
const mat = doc.getRoot().listMaterials().find((m) => m.getBaseColorTexture());
if (!mat) { console.error("no base colour texture"); process.exit(3); }
const tex = mat.getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let sum = 0, n = 0;
for (let i = 0; i < data.length; i += 4) { if (data[i + 3] === 0) continue; sum += (data[i] + data[i + 1] + data[i + 2]) / 3; n += 1; }
const mean = sum / n;
const exponent = mean >= target ? 1 : Math.log(target / 255) / Math.log(Math.max(mean, 1) / 255);
const lut = new Uint8Array(256);
for (let v = 0; v < 256; v += 1) lut[v] = Math.round(255 * Math.pow(v / 255, exponent));
let after = 0;
for (let i = 0; i < data.length; i += 4) {
  data[i] = lut[data[i]]; data[i + 1] = lut[data[i + 1]]; data[i + 2] = lut[data[i + 2]];
  if (data[i + 3] !== 0) after += (data[i] + data[i + 1] + data[i + 2]) / 3;
}
const mime = tex.getMimeType();
const enc = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
const out = mime === "image/jpeg" ? await enc.removeAlpha().jpeg({ quality: 88 }).toBuffer() : await enc.png({ compressionLevel: 9 }).toBuffer();
tex.setImage(new Uint8Array(out));
mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, `${name}.tmp.glb`);
await io.write(tmp, doc);
const buf = readFileSync(tmp);
const hash = createHash("sha256").update(buf).digest("hex");
const file = `${name}.${hash.slice(0, 8)}.glb`;
renameSync(tmp, path.join(outDir, file));
console.log(JSON.stringify({ file, sizeBytes: buf.length, sha256: hash, meanBefore: Math.round(mean), meanAfter: Math.round(after / n), exponent: Number(exponent.toFixed(3)) }));
