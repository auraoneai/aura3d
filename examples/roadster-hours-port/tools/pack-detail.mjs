#!/usr/bin/env node
// GU47 RH47-10: packs one ambientCG CC0 1K-JPG set into a single 512 px detail map for the custom GLSL surfaces.
// R = colour luminance re-centred on 0.5 with a fixed contrast (the shader multiplies albedo by 0.5 + (R - 0.5) * k),
// G, B = the NormalGL x and y (the shader rebuilds z). One map per surface keeps each custom program to one sampler.
// Output: ../assets/detail/<name>.jpg (4:4:4, no chroma subsampling, linear data) plus ../assets/detail/detail.json (sha256).
// Usage (repo root): node examples/roadster-hours-port/tools/pack-detail.mjs <unzipped set dir> <ambientCG id> <name>
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const sharp = createRequire(resolve(root, "package.json"))("sharp");

const [setDir, id, name] = process.argv.slice(2);
if (!setDir || !id || !name || !/^[a-z-]+$/.test(name)) throw new Error("usage: pack-detail.mjs <set dir> <ambientCG id> <name>");
const SIZE = 512;
const CONTRAST = 0.2; // target standard deviation of R around 0.5

const read = async (suffix) => {
  const file = join(setDir, `${id}_1K-JPG_${suffix}.jpg`);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  return sharp(file).resize(SIZE, SIZE, { kernel: "lanczos3" }).removeAlpha().raw().toBuffer();
};
const color = await read("Color");
const normal = await read("NormalGL");

const n = SIZE * SIZE;
const lum = new Float32Array(n);
let sum = 0;
for (let i = 0; i < n; i++) { lum[i] = 0.2126 * color[i * 3] + 0.7152 * color[i * 3 + 1] + 0.0722 * color[i * 3 + 2]; sum += lum[i]; }
const mean = sum / n;
let variance = 0;
for (let i = 0; i < n; i++) variance += (lum[i] - mean) ** 2;
const std = Math.sqrt(variance / n) || 1;
const out = Buffer.alloc(n * 3);
for (let i = 0; i < n; i++) {
  out[i * 3] = Math.max(0, Math.min(255, Math.round(127.5 + ((lum[i] - mean) / std) * CONTRAST * 255)));
  out[i * 3 + 1] = normal[i * 3];
  out[i * 3 + 2] = normal[i * 3 + 1];
}
const dir = resolve(here, "../assets/detail");
mkdirSync(dir, { recursive: true });
const jpg = await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
writeFileSync(join(dir, `${name}.jpg`), jpg);
const indexFile = join(dir, "detail.json");
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : {};
index[name] = {
  file: `${name}.jpg`, bytes: jpg.length, sha256: createHash("sha256").update(jpg).digest("hex"), size: SIZE,
  source: { id: `ambientcg:${id}`, page: `https://ambientcg.com/a/${id}`, download: `https://ambientcg.com/get?file=${id}_1K-JPG.zip`, maps: ["Color", "NormalGL"], license: "CC0-1.0", author: "ambientCG" }
};
writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
console.log(`${name}: ${jpg.length} bytes`);
