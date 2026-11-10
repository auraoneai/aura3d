#!/usr/bin/env node
// Region-aware UV atlas color grading + subtle tangent-space PBR micro-normal restoration
// for Wonder World's 54 committed GLB models (WP-2).
//
// 1. Resets whole-mesh multiplicative `baseColorFactor` tints to `[1, 1, 1, 1]` on all 19 tinted models
//    and instead color-grades ONLY the body/surface texels in `baseColorTexture` (using rasterized 3D
//    UV coordinates + pixel HSV/luminance masks) so character eye sclera (#FFFFFF), dark pupils,
//    orange beaks, white/black piano keys, tires, and cabin windows stay crisp and untinted.
// 2. Recolors `barn`'s green wall texels to classic warm barn-red (#C94A3E) while preserving its
//    cream roof & trim (#FAF3E3) and warm wood accents.
// 3. Synthesizes subtle tangent-space micro-detail `normalTexture` (4:4:4 JPEG) and calibrated
//    `roughnessFactor` / `metallicFactor` for the 48 non-cast models whose maps were previously stripped,
//    keeping total `src/assets/models/` well under 28 MiB.
// 4. Preserves `asset.extras.aura3d.orientation` and verifies byte-identical primitive POSITION + INDICES
//    geometry hashes before and after on every mesh (matching aura3d-retexture's geometry-hash.mjs).
//
//   node apps/veer-wonder-world/tools/recolor-atlas-regions.mjs [--only key1,key2] [--force]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..", "..");
const rootRequire = createRequire(join(repo, "package.json"));
const { NodeIO } = rootRequire("@gltf-transform/core");
const { ALL_EXTENSIONS } = rootRequire("@gltf-transform/extensions");
const sharp = rootRequire("sharp");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const modelsDir = join(app, "src", "assets", "models");
const provDir = join(app, "provenance", "models");
const review = JSON.parse(readFileSync(join(app, "tools", "model-review.json"), "utf8"));

const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const force = args.includes("--force");

const MAIN_CAST = new Set(["momo", "lulu", "sheru", "gogo", "lumi", "peeko"]);
const FACE_CHARACTERS = new Set(["lulu", "sheru", "peeko", "lumi", "robot", "bird"]);
const NORMAL_JPEG_OPTS = { quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true };
const BASE_JPEG_OPTS = { quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true };

const CRAFT_FAMILY_BY_KEY = {
  // Plush & felt toys
  teddy: { family: "plush_felt", roughness: 0.88, metallic: 0.0, normalScale: 0.36 },
  cow: { family: "plush_felt", roughness: 0.84, metallic: 0.0, normalScale: 0.34 },
  sheep: { family: "plush_felt", roughness: 0.9, metallic: 0.0, normalScale: 0.42 },
  horse: { family: "plush_felt", roughness: 0.82, metallic: 0.0, normalScale: 0.34 },
  bird: { family: "plush_felt", roughness: 0.84, metallic: 0.0, normalScale: 0.35 },
  butterfly: { family: "plush_felt", roughness: 0.8, metallic: 0.0, normalScale: 0.32 },
  towel: { family: "plush_felt", roughness: 0.9, metallic: 0.0, normalScale: 0.42 },
  cushion: { family: "plush_felt", roughness: 0.88, metallic: 0.0, normalScale: 0.38 },
  hat: { family: "plush_felt", roughness: 0.85, metallic: 0.0, normalScale: 0.36 },
  bed: { family: "plush_felt", roughness: 0.84, metallic: 0.0, normalScale: 0.35 },
  // Painted wood & woven craft
  door: { family: "wood_painted", roughness: 0.64, metallic: 0.0, normalScale: 0.38 },
  barn: { family: "wood_painted", roughness: 0.68, metallic: 0.0, normalScale: 0.4 },
  house: { family: "wood_painted", roughness: 0.7, metallic: 0.0, normalScale: 0.38 },
  station: { family: "wood_painted", roughness: 0.68, metallic: 0.0, normalScale: 0.38 },
  table: { family: "wood_painted", roughness: 0.62, metallic: 0.0, normalScale: 0.36 },
  chair: { family: "wood_painted", roughness: 0.64, metallic: 0.0, normalScale: 0.36 },
  bench: { family: "wood_painted", roughness: 0.66, metallic: 0.0, normalScale: 0.38 },
  toyBlock: { family: "wood_painted", roughness: 0.6, metallic: 0.0, normalScale: 0.34 },
  toyBox: { family: "wood_painted", roughness: 0.62, metallic: 0.0, normalScale: 0.36 },
  storyBox: { family: "wood_painted", roughness: 0.58, metallic: 0.02, normalScale: 0.36 },
  picnicBasket: { family: "wood_painted", roughness: 0.78, metallic: 0.0, normalScale: 0.44 },
  drum: { family: "wood_painted", roughness: 0.58, metallic: 0.02, normalScale: 0.34 },
  shaker: { family: "wood_painted", roughness: 0.52, metallic: 0.0, normalScale: 0.32 },
  toyPiano: { family: "wood_painted", roughness: 0.48, metallic: 0.02, normalScale: 0.3 },
  lift: { family: "wood_painted", roughness: 0.58, metallic: 0.04, normalScale: 0.34 },
  // Glossy / satin lacquer & ceramic toys
  car: { family: "glossy_toy_lacquer", roughness: 0.36, metallic: 0.05, normalScale: 0.26 },
  gogoCarriage: { family: "glossy_toy_lacquer", roughness: 0.4, metallic: 0.04, normalScale: 0.28 },
  robot: { family: "glossy_toy_lacquer", roughness: 0.42, metallic: 0.12, normalScale: 0.28 },
  colourMachine: { family: "glossy_toy_lacquer", roughness: 0.46, metallic: 0.06, normalScale: 0.3 },
  mirror: { family: "glossy_toy_lacquer", roughness: 0.32, metallic: 0.14, normalScale: 0.24 },
  bubbleWand: { family: "glossy_toy_lacquer", roughness: 0.4, metallic: 0.02, normalScale: 0.26 },
  letterA: { family: "glossy_toy_lacquer", roughness: 0.44, metallic: 0.0, normalScale: 0.28 },
  letterB: { family: "glossy_toy_lacquer", roughness: 0.44, metallic: 0.0, normalScale: 0.28 },
  apple: { family: "glossy_toy_lacquer", roughness: 0.34, metallic: 0.0, normalScale: 0.26 },
  plate: { family: "glossy_toy_lacquer", roughness: 0.32, metallic: 0.0, normalScale: 0.22 },
  sink: { family: "glossy_toy_lacquer", roughness: 0.34, metallic: 0.04, normalScale: 0.24 },
  // Matte clay, baked goods & organic nature
  duck: { family: "organic_clay_food", roughness: 0.72, metallic: 0.0, normalScale: 0.32 },
  banana: { family: "organic_clay_food", roughness: 0.68, metallic: 0.0, normalScale: 0.3 },
  cookie: { family: "organic_clay_food", roughness: 0.84, metallic: 0.0, normalScale: 0.42 },
  cake: { family: "organic_clay_food", roughness: 0.66, metallic: 0.0, normalScale: 0.36 },
  pastryCircle: { family: "organic_clay_food", roughness: 0.62, metallic: 0.0, normalScale: 0.36 },
  pastrySquare: { family: "organic_clay_food", roughness: 0.64, metallic: 0.0, normalScale: 0.36 },
  pastryTriangle: { family: "organic_clay_food", roughness: 0.62, metallic: 0.0, normalScale: 0.36 },
  sponge: { family: "organic_clay_food", roughness: 0.92, metallic: 0.0, normalScale: 0.46 },
  flower: { family: "organic_clay_food", roughness: 0.68, metallic: 0.0, normalScale: 0.32 },
  flowerBud: { family: "organic_clay_food", roughness: 0.68, metallic: 0.0, normalScale: 0.32 },
  tree: { family: "organic_clay_food", roughness: 0.84, metallic: 0.0, normalScale: 0.4 },
  tunnel: { family: "organic_clay_food", roughness: 0.82, metallic: 0.0, normalScale: 0.38 }
};

function parseHexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
};

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

/** Exact primitive POSITION + INDICES hash matching .agents/skills/aura3d-retexture/references/geometry-hash.mjs */
export function primitiveGeometryHash(glbBuffer) {
  const buf = Buffer.isBuffer(glbBuffer) ? glbBuffer : Buffer.from(glbBuffer);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  const compBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const typeCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const accBytes = (idx) => {
    const acc = json.accessors[idx];
    if (acc.bufferView === undefined) return Buffer.alloc(0);
    const view = json.bufferViews[acc.bufferView];
    const elem = compBytes[acc.componentType] * typeCount[acc.type];
    const stride = view.byteStride ?? elem;
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const out = Buffer.alloc(elem * acc.count);
    for (let i = 0; i < acc.count; i += 1) {
      bin.copy(out, i * elem, start + i * stride, start + i * stride + elem);
    }
    return out;
  };
  const whole = createHash("sha256");
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.POSITION === undefined) continue;
      const posB = accBytes(prim.attributes.POSITION);
      const idxB = prim.indices === undefined ? Buffer.alloc(0) : accBytes(prim.indices);
      const h = createHash("sha256").update(posB).update(idxB).digest("hex");
      whole.update(h);
    }
  }
  return `sha256-${whole.digest("hex")}`;
}

/** Rasterizes 3D world positions onto UV texels (with 4px gutter dilation to prevent UV seam bleed). */
function rasterizeUvPositions(doc, width, height) {
  const n = width * height;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const covered = new Uint8Array(n);

  const walkNode = (node, parentOffset) => {
    const t = node.getTranslation();
    const worldOff = [parentOffset[0] + t[0], parentOffset[1] + t[1], parentOffset[2] + t[2]];
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        const uv = prim.getAttribute("TEXCOORD_0");
        const indices = prim.getIndices();
        if (!pos || !uv) continue;
        const triCount = indices ? indices.getCount() / 3 : pos.getCount() / 3;
        const p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0];
        const t0 = [0, 0], t1 = [0, 0], t2 = [0, 0];
        for (let ti = 0; ti < triCount; ti += 1) {
          const i0 = indices ? indices.getScalar(3 * ti) : 3 * ti;
          const i1 = indices ? indices.getScalar(3 * ti + 1) : 3 * ti + 1;
          const i2 = indices ? indices.getScalar(3 * ti + 2) : 3 * ti + 2;
          pos.getElement(i0, p0); pos.getElement(i1, p1); pos.getElement(i2, p2);
          uv.getElement(i0, t0); uv.getElement(i1, t1); uv.getElement(i2, t2);
          p0[0] += worldOff[0]; p0[1] += worldOff[1]; p0[2] += worldOff[2];
          p1[0] += worldOff[0]; p1[1] += worldOff[1]; p1[2] += worldOff[2];
          p2[0] += worldOff[0]; p2[1] += worldOff[1]; p2[2] += worldOff[2];

          const u0 = (((t0[0] % 1) + 1) % 1) * width;
          const v0 = (((t0[1] % 1) + 1) % 1) * height;
          const u1 = (((t1[0] % 1) + 1) % 1) * width;
          const v1 = (((t1[1] % 1) + 1) % 1) * height;
          const u2 = (((t2[0] % 1) + 1) % 1) * width;
          const v2 = (((t2[1] % 1) + 1) % 1) * height;
          // Skip wrap-straddling triangles
          if (Math.max(Math.abs(u1 - u0), Math.abs(u2 - u0)) > width * 0.5) continue;
          if (Math.max(Math.abs(v1 - v0), Math.abs(v2 - v0)) > height * 0.5) continue;

          const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)));
          const maxX = Math.min(width - 1, Math.ceil(Math.max(u0, u1, u2)));
          const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)));
          const maxY = Math.min(height - 1, Math.ceil(Math.max(v0, v1, v2)));
          const denom = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
          if (Math.abs(denom) < 1e-6) continue;
          const invDenom = 1 / denom;

          for (let y = minY; y <= maxY; y += 1) {
            const cy = y + 0.5;
            for (let x = minX; x <= maxX; x += 1) {
              const cx = x + 0.5;
              const w0 = ((v1 - v2) * (cx - u2) + (u2 - u1) * (cy - v2)) * invDenom;
              const w1 = ((v2 - v0) * (cx - u2) + (u0 - u2) * (cy - v2)) * invDenom;
              const w2 = 1 - w0 - w1;
              if (w0 >= -0.05 && w1 >= -0.05 && w2 >= -0.05) {
                const idx = y * width + x;
                px[idx] = w0 * p0[0] + w1 * p1[0] + w2 * p2[0];
                py[idx] = w0 * p0[1] + w1 * p1[1] + w2 * p2[1];
                pz[idx] = w0 * p0[2] + w1 * p1[2] + w2 * p2[2];
                covered[idx] = 1;
              }
            }
          }
        }
      }
    }
    for (const child of node.listChildren()) walkNode(child, worldOff);
  };

  for (const scene of doc.getRoot().listScenes()) {
    for (const rootNode of scene.listChildren()) walkNode(rootNode, [0, 0, 0]);
  }

  // Dilate 4px into UV gutter margins so bilinear mip filtering never bleeds ungraded padding
  for (let pass = 0; pass < 4; pass += 1) {
    const nextCov = Uint8Array.from(covered);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (covered[idx]) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        if (x > 0 && covered[idx - 1]) { sx += px[idx - 1]; sy += py[idx - 1]; sz += pz[idx - 1]; cnt += 1; }
        if (x + 1 < width && covered[idx + 1]) { sx += px[idx + 1]; sy += py[idx + 1]; sz += pz[idx + 1]; cnt += 1; }
        if (y > 0 && covered[idx - width]) { sx += px[idx - width]; sy += py[idx - width]; sz += pz[idx - width]; cnt += 1; }
        if (y + 1 < height && covered[idx + width]) { sx += px[idx + width]; sy += py[idx + width]; sz += pz[idx + width]; cnt += 1; }
        if (cnt > 0) {
          px[idx] = sx / cnt;
          py[idx] = sy / cnt;
          pz[idx] = sz / cnt;
          nextCov[idx] = 1;
        }
      }
    }
    covered.set(nextCov);
  }
  return { px, py, pz, covered };
}

/** Region-aware color grading of baseColorTexture for the 19 pale/tinted models + barn. */
async function recolorBaseTexture(key, texBuffer, doc, targetHex) {
  const { data, info } = await sharp(texBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  const uvMap = rasterizeUvPositions(doc, width, height);

  // Locate face dark pupil centers on face-bearing characters so adjacent sclera stays pure white (#FFFFFF)
  const pupilCenters = [];
  if (FACE_CHARACTERS.has(key)) {
    let sxL = 0, syL = 0, szL = 0, cL = 0;
    let sxR = 0, syR = 0, szR = 0, cR = 0;
    for (let i = 0; i < n; i += 1) {
      if (!uvMap.covered[i]) continue;
      const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const x = uvMap.px[i], y = uvMap.py[i], z = uvMap.pz[i];
      if (lum < 72 && z > 0.14 && y > -0.05 && Math.abs(x) > 0.04 && Math.abs(x) < 0.42) {
        if (x >= 0) { sxL += x; syL += y; szL += z; cL += 1; }
        else { sxR += x; syR += y; szR += z; cR += 1; }
      }
    }
    if (cL > 4) pupilCenters.push([sxL / cL, syL / cL, szL / cL]);
    if (cR > 4) pupilCenters.push([sxR / cR, syR / cR, szR / cR]);
  }

  // Barn special path: green wall texels -> warm barn-red (#C94A3E), keeping cream roof/trim (#FAF3E3) & wood intact
  if (key === "barn") {
    const barnRed = [201, 74, 62]; // #C94A3E
    const creamTrim = [250, 243, 227]; // #FAF3E3
    const greenLums = [];
    for (let i = 0; i < n; i += 4) {
      if (!uvMap.covered[i]) continue;
      const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
      const [h, s] = rgbToHsv(r, g, b);
      if (h >= 56 && h <= 180 && s > 0.12) {
        greenLums.push(0.299 * r + 0.587 * g + 0.114 * b);
      }
    }
    greenLums.sort((a, b) => a - b);
    const refLum = Math.max(125, Math.min(205, greenLums[Math.floor(greenLums.length * 0.6)] ?? 168));
    const out = Buffer.from(data);
    let recoloredPixels = 0;
    for (let i = 0; i < n; i += 1) {
      const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const [h, s] = rgbToHsv(r, g, b);
      // Smooth green mask (avoids cream trim s < 0.12 and warm wood h < 48)
      const hueW = smoothstep(48, 66, h) * (1 - smoothstep(168, 192, h));
      const satW = smoothstep(0.09, 0.2, s);
      const lumW = smoothstep(35, 65, lum);
      const wGreen = hueW * satW * lumW;
      if (wGreen > 0.02) {
        const shade = Math.pow(Math.max(0.18, lum / refLum), 0.82);
        const nr = clamp255(barnRed[0] * shade);
        const ng = clamp255(barnRed[1] * shade);
        const nb = clamp255(barnRed[2] * shade);
        out[i * 3] = clamp255(r + (nr - r) * wGreen);
        out[i * 3 + 1] = clamp255(g + (ng - g) * wGreen);
        out[i * 3 + 2] = clamp255(b + (nb - b) * wGreen);
        if (wGreen > 0.4) recoloredPixels += 1;
      } else if (lum > 195 && s < 0.22) {
        // Keep roof & door-frame trim crisp warm cream (#FAF3E3)
        const wCream = smoothstep(195, 222, lum) * (1 - smoothstep(0.14, 0.24, s)) * 0.55;
        out[i * 3] = clamp255(r + (creamTrim[0] - r) * wCream);
        out[i * 3 + 1] = clamp255(g + (creamTrim[1] - g) * wCream);
        out[i * 3 + 2] = clamp255(b + (creamTrim[2] - b) * wCream);
      }
    }
    const encoded = await sharp(out, { raw: { width, height, channels: 3 } }).jpeg(BASE_JPEG_OPTS).toBuffer();
    return { buffer: encoded, recoloredPixels, totalPixels: n, targetHex: "#c94a3e" };
  }

  const targetRgb = parseHexRgb(targetHex);
  if (!targetRgb) return null;

  // Gather reference body luminance on covered non-dark texels
  const bodyLums = [];
  for (let i = 0; i < n; i += 4) {
    if (!uvMap.covered[i]) continue;
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 85 && lum < 238) bodyLums.push(lum);
  }
  bodyLums.sort((a, b) => a - b);
  const refLum = Math.max(135, Math.min(215, bodyLums[Math.floor(bodyLums.length * 0.62)] ?? 180));

  const out = Buffer.from(data);
  let recoloredPixels = 0;
  let preservedPixels = 0;

  for (let i = 0; i < n; i += 1) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const [h, s] = rgbToHsv(r, g, b);
    const x = uvMap.px[i], y = uvMap.py[i], z = uvMap.pz[i];
    const has3d = uvMap.covered[i] === 1;

    // 1. Protect dark pupils, eyelashes, mouths, chocolate chips, tires
    const darkCutoff = key === "cookie" ? 96 : 66;
    let wBody = smoothstep(darkCutoff - 12, darkCutoff + 18, lum);

    // 2. Character eye sclera & specular highlights -> pure crisp #FFFFFF (never tinted!)
    if (has3d && FACE_CHARACTERS.has(key)) {
      let nearEye = false;
      for (const [ex, ey, ez] of pupilCenters) {
        const d2 = (x - ex) * (x - ex) + (y - ey) * (y - ey) + (z - ez) * (z - ez);
        if (d2 < 0.042) {
          nearEye = true;
          break;
        }
      }
      if ((nearEye && lum > 178 && s < 0.34) || (z > 0.15 && y > 0.0 && lum > 232 && s < 0.14)) {
        const wSclera = smoothstep(178, 212, lum) * (1 - smoothstep(0.24, 0.38, s));
        wBody *= 1 - wSclera;
        // Clean warm Meshy cast off eye sclera toward #FFFFFF
        const clean = wSclera * 0.72;
        out[i * 3] = clamp255(r + (255 - r) * clean);
        out[i * 3 + 1] = clamp255(g + (255 - g) * clean);
        out[i * 3 + 2] = clamp255(b + (255 - b) * clean);
        preservedPixels += 1;
        continue;
      }
    }

    // 3. Model-specific anatomical & prop feature protections
    if (has3d && key === "lulu") {
      // Soft cream belly patch (#FAF0D7) on lower front torso
      if (z > 0.24 && Math.abs(x) < 0.25 && y > -0.62 && y < 0.04 && lum > 182) {
        const wBelly = smoothstep(0.24, 0.36, z) * (1 - smoothstep(0.16, 0.25, Math.abs(x))) * smoothstep(182, 208, lum) * 0.75;
        const shade = Math.pow(Math.max(0.25, lum / refLum), 0.75);
        const br = clamp255(250 * shade), bg = clamp255(240 * shade), bb = clamp255(215 * shade);
        const mr = clamp255(targetRgb[0] * shade), mg = clamp255(targetRgb[1] * shade), mb = clamp255(targetRgb[2] * shade);
        out[i * 3] = clamp255(mr + (br - mr) * wBelly);
        out[i * 3 + 1] = clamp255(mg + (bg - mg) * wBelly);
        out[i * 3 + 2] = clamp255(mb + (bb - mb) * wBelly);
        recoloredPixels += 1;
        continue;
      }
    } else if (has3d && (key === "peeko" || key === "bird")) {
      // Keep beak & feet warm tangerine-orange (#F59B42) instead of body yellow/blue
      const isBeak = z > 0.33 && Math.abs(x) < 0.17 && y > 0.12 && y < 0.52;
      const isFeet = y < -0.72;
      if (isBeak || isFeet) {
        const shade = Math.pow(Math.max(0.25, lum / refLum), 0.75);
        out[i * 3] = clamp255(245 * shade);
        out[i * 3 + 1] = clamp255(155 * shade);
        out[i * 3 + 2] = clamp255(66 * shade);
        preservedPixels += 1;
        continue;
      }
    } else if (has3d && key === "robot") {
      // Keep white chest/faceplate trim crisp
      if (z > 0.16 && lum > 220 && s < 0.18) {
        wBody *= 0.15;
        preservedPixels += 1;
      }
    } else if (has3d && key === "toyPiano") {
      // Keep piano keys on front shelf crisp ivory (#FCF9F2) and ebony (#353142)
      const onKeyboard = z > 0.18 && y > -0.22 && y < 0.22 && Math.abs(x) < 0.76;
      if (onKeyboard) {
        if (lum >= 145) {
          const kShade = 0.88 + 0.12 * clamp01((lum - 145) / 85);
          out[i * 3] = clamp255(252 * kShade);
          out[i * 3 + 1] = clamp255(249 * kShade);
          out[i * 3 + 2] = clamp255(242 * kShade);
        } else {
          out[i * 3] = clamp255(r * 0.45 + 24);
          out[i * 3 + 1] = clamp255(g * 0.45 + 22);
          out[i * 3 + 2] = clamp255(b * 0.45 + 30);
        }
        preservedPixels += 1;
        continue;
      }
    } else if (has3d && key === "car") {
      // Vehicles face -X: protect tires (y < -0.26), neutral rims, front headlights (x < -0.78), and cabin glass (y > 0.12)
      const isTireOrRim = y < -0.26 && (lum < 115 || s < 0.16);
      const isHeadlight = x < -0.78 && Math.abs(z) < 0.44 && y > -0.26 && lum > 190;
      const isWindow = y > 0.14 && Math.abs(x) < 0.56 && (s < 0.18 || b > r);
      if (isHeadlight) {
        out[i * 3] = 255; out[i * 3 + 1] = 248; out[i * 3 + 2] = 230;
        preservedPixels += 1;
        continue;
      }
      if (isTireOrRim || isWindow) {
        if (isWindow) {
          // Clean pale sky-glass tint on window panes, never body-saturated
          out[i * 3] = clamp255(lum * 0.92 + 18);
          out[i * 3 + 1] = clamp255(lum * 0.97 + 22);
          out[i * 3 + 2] = clamp255(lum * 1.03 + 28);
        }
        preservedPixels += 1;
        continue;
      }
    } else if (has3d && key === "gogoCarriage") {
      // Protect dark wheels/undercarriage and bright window panes/trim
      const isWheel = y < -0.24 && lum < 115;
      const isWindowPane = y > -0.02 && y < 0.36 && lum > 208 && s < 0.14;
      if (isWheel || isWindowPane) {
        if (isWindowPane) {
          out[i * 3] = 246; out[i * 3 + 1] = 250; out[i * 3 + 2] = 255;
        }
        preservedPixels += 1;
        continue;
      }
    } else if (has3d && key === "apple") {
      // Protect top stem and green leaf
      if (y > 0.34 || (h >= 65 && h <= 165 && s > 0.18)) {
        preservedPixels += 1;
        continue;
      }
    } else if (has3d && key === "banana") {
      if (lum < 95) {
        preservedPixels += 1;
        continue;
      }
    } else if (has3d && key === "butterfly") {
      // Protect dark central body & warm yellow wing spots
      if (Math.abs(x) < 0.12 || (h >= 38 && h <= 68 && lum > 185 && s > 0.25)) {
        preservedPixels += 1;
        continue;
      }
    }

    if (wBody > 0.02) {
      const shade = Math.pow(Math.max(0.18, lum / refLum), 0.78);
      const nr = clamp255(targetRgb[0] * shade);
      const ng = clamp255(targetRgb[1] * shade);
      const nb = clamp255(targetRgb[2] * shade);
      out[i * 3] = clamp255(r + (nr - r) * wBody);
      out[i * 3 + 1] = clamp255(g + (ng - g) * wBody);
      out[i * 3 + 2] = clamp255(b + (nb - b) * wBody);
      if (wBody > 0.4) recoloredPixels += 1;
    } else {
      preservedPixels += 1;
    }
  }

  const encoded = await sharp(out, { raw: { width, height, channels: 3 } }).jpeg(BASE_JPEG_OPTS).toBuffer();
  return { buffer: encoded, recoloredPixels, preservedPixels, totalPixels: n, targetHex };
}

/** Deterministic hash-based 2D value noise in [-1, 1] for subtle clay/wood/felt micro-relief. */
function hash2d(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 2147483648 - 1;
}

function valueNoiseTileable(x, y, periodX, periodY, seed) {
  const gx = (x / periodX) * 64;
  const gy = (y / periodY) * 64;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (v) => ((v % 64) + 64) % 64;
  const a = hash2d(wrap(x0), wrap(y0), seed);
  const b = hash2d(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2d(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2d(wrap(x0 + 1), wrap(y0 + 1), seed);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

/** Synthesizes a clean tangent-space micro-detail normal map (JPEG 4:4:4) from luminance bevel + craft micro-relief. */
async function synthesizeMicroNormalJpeg(key, baseBuffer, family) {
  const { data, info } = await sharp(baseBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  let seed = 2166136261;
  for (let i = 0; i < key.length; i += 1) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);

  // Smooth luminance with a 3x3 box pass to suppress JPEG macroblock chatter
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    lum[i] = (0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2]) / 255;
  }
  const heightField = new Float32Array(n);
  for (let y = 0; y < height; y += 1) {
    const ym = Math.max(0, y - 1), yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1);
      const smoothL =
        (lum[ym * width + xm] + 2 * lum[ym * width + x] + lum[ym * width + xp] +
         2 * lum[y * width + xm] + 4 * lum[y * width + x] + 2 * lum[y * width + xp] +
         lum[yp * width + xm] + 2 * lum[yp * width + x] + lum[yp * width + xp]) / 16;

      let micro = 0;
      if (family === "plush_felt") {
        // Fine woven felt nap
        const weave = Math.sin((x * Math.PI * 2) / 6) * Math.sin((y * Math.PI * 2) / 6) * 0.35;
        micro = (weave + valueNoiseTileable(x * 3, y * 3, width, height, seed) * 0.65) * 0.045;
      } else if (family === "wood_painted") {
        // Directional painted wood grain
        const grain = valueNoiseTileable(x * 1.2, y * 5.5, width, height, seed);
        micro = grain * 0.038;
      } else if (family === "glossy_toy_lacquer") {
        // Smooth lacquer with ultra-subtle molded clay undulation
        micro = valueNoiseTileable(x * 0.8, y * 0.8, width, height, seed) * 0.015;
      } else {
        // Organic matte clay / baked pores
        micro = (valueNoiseTileable(x * 2, y * 2, width, height, seed) * 0.6 + valueNoiseTileable(x * 5, y * 5, width, height, seed ^ 99) * 0.4) * 0.042;
      }
      heightField[y * width + x] = smoothL * 0.16 + micro;
    }
  }

  const normRgb = Buffer.alloc(n * 3);
  const maxSlope = 0.22;
  for (let y = 0; y < height; y += 1) {
    const ym = Math.max(0, y - 1), yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1);
      const gx =
        heightField[ym * width + xp] - heightField[ym * width + xm] +
        2 * (heightField[y * width + xp] - heightField[y * width + xm]) +
        heightField[yp * width + xp] - heightField[yp * width + xm];
      const gy =
        heightField[yp * width + xm] - heightField[ym * width + xm] +
        2 * (heightField[yp * width + x] - heightField[ym * width + x]) +
        heightField[yp * width + xp] - heightField[ym * width + xp];

      const dx = Math.tanh(gx * 2.2) * maxSlope;
      const dy = Math.tanh(gy * 2.2) * maxSlope;
      const nx = -dx;
      const ny = dy; // OpenGL +Y up tangent space
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      const idx = (y * width + x) * 3;
      normRgb[idx] = clamp255((nx * invLen * 0.5 + 0.5) * 255);
      normRgb[idx + 1] = clamp255((ny * invLen * 0.5 + 0.5) * 255);
      normRgb[idx + 2] = clamp255((nz * invLen * 0.5 + 0.5) * 255);
    }
  }
  return sharp(normRgb, { raw: { width, height, channels: 3 } }).jpeg(NORMAL_JPEG_OPTS).toBuffer();
}

const provFiles = readdirSync(provDir).filter((f) => f.endsWith(".json")).sort();
const updated = [];
const skipped = [];

for (const provFile of provFiles) {
  const provPath = join(provDir, provFile);
  const prov = JSON.parse(readFileSync(provPath, "utf8"));
  const key = prov.key;
  if (only && !only.has(key)) continue;

  const alreadyRecolored = prov.processing?.atlasRegionRecolor?.version === 1;
  const alreadyNormal = MAIN_CAST.has(key) || prov.processing?.synthesizedNormalMap?.version === 1;
  const rev = review[key] ?? {};
  const needsRecolor = Boolean(rev.tint) || key === "barn";
  const needsNormal = !MAIN_CAST.has(key);

  if (!force && (!needsRecolor || alreadyRecolored) && (!needsNormal || alreadyNormal)) {
    skipped.push(key);
    continue;
  }

  const oldPath = join(app, prov.file);
  if (!existsSync(oldPath)) throw new Error(`${key}: missing GLB ${prov.file}`);
  const beforeBytes = readFileSync(oldPath);
  const geomHashBefore = primitiveGeometryHash(beforeBytes);

  const doc = await io.readBinary(new Uint8Array(beforeBytes));
  const root = doc.getRoot();
  const craft = CRAFT_FAMILY_BY_KEY[key] ?? { family: "organic_clay_food", roughness: 0.72, metallic: 0.0, normalScale: 0.32 };

  let recolorInfo = prov.processing?.atlasRegionRecolor ?? null;
  let synthNormalInfo = prov.processing?.synthesizedNormalMap ?? null;

  for (const material of root.listMaterials()) {
    const baseTex = material.getBaseColorTexture();
    if (needsRecolor && baseTex && (force || !alreadyRecolored)) {
      const res = await recolorBaseTexture(key, Buffer.from(baseTex.getImage()), doc, rev.tint ?? null);
      if (res) {
        baseTex.setImage(new Uint8Array(res.buffer)).setMimeType("image/jpeg");
        recolorInfo = {
          version: 1,
          targetHex: res.targetHex,
          baseColorFactorResetTo: [1, 1, 1, 1],
          recoloredPixels: res.recoloredPixels,
          preservedPixels: res.preservedPixels ?? 0,
          totalPixels: res.totalPixels
        };
      }
      material.setBaseColorFactor([1, 1, 1, 1]);
    } else if (needsRecolor) {
      material.setBaseColorFactor([1, 1, 1, 1]);
    }

    if (needsNormal && baseTex && (!material.getNormalTexture() || force)) {
      const normJpeg = await synthesizeMicroNormalJpeg(key, Buffer.from(baseTex.getImage()), craft.family);
      let normTex = material.getNormalTexture();
      if (!normTex) {
        normTex = doc.createTexture("normal");
        material.setNormalTexture(normTex);
      }
      normTex.setName("normal").setImage(new Uint8Array(normJpeg)).setMimeType("image/jpeg");
      material.setNormalScale(craft.normalScale);
      material.setRoughnessFactor(craft.roughness);
      material.setMetallicFactor(craft.metallic);
      synthNormalInfo = {
        version: 1,
        family: craft.family,
        roughnessFactor: craft.roughness,
        metallicFactor: craft.metallic,
        normalScale: craft.normalScale,
        jpegBytes: normJpeg.length,
        encoding: NORMAL_JPEG_OPTS
      };
    }
  }

  // Preserve orientation metadata required by model-orientation tests & CLI
  const asset = root.getAsset();
  asset.extras = {
    ...(asset.extras ?? {}),
    aura3d: {
      ...(asset.extras?.aura3d ?? {}),
      orientation: asset.extras?.aura3d?.orientation ?? {
        forwardAxis: "+z",
        upAxis: "+y",
        source: "Meshy export convention (faces +z)"
      }
    }
  };

  const afterBytes = Buffer.from(await io.writeBinary(doc));
  const geomHashAfter = primitiveGeometryHash(afterBytes);
  if (geomHashAfter !== geomHashBefore) {
    throw new Error(`${key}: primitive geometry hash changed during retexture (${geomHashBefore} !== ${geomHashAfter})`);
  }

  const newSha = createHash("sha256").update(afterBytes).digest("hex");
  const newFile = `src/assets/models/${key}.${newSha.slice(0, 8)}.glb`;
  const newFullPath = join(app, newFile);

  const previous = { file: prov.file, sha256: prov.sha256, sizeBytes: prov.sizeBytes };
  for (const stale of readdirSync(modelsDir).filter((f) => f.startsWith(`${key}.`) && f.endsWith(".glb"))) {
    rmSync(join(modelsDir, stale));
  }
  writeFileSync(newFullPath, afterBytes);

  const texNames = root.listTextures().map((t, idx) => t.getName() || `texture_${idx}`);
  prov.previous = previous;
  prov.file = newFile;
  prov.sha256 = newSha;
  prov.sizeBytes = afterBytes.length;
  prov.processing = {
    ...(prov.processing ?? {}),
    strippedNormalAndRoughnessMaps: false,
    ...(recolorInfo ? { atlasRegionRecolor: { ...recolorInfo, geometryHash: geomHashAfter } } : {}),
    ...(synthNormalInfo ? { synthesizedNormalMap: { ...synthNormalInfo, geometryHash: geomHashAfter } } : {})
  };
  prov.inspection = {
    ...(prov.inspection ?? {}),
    textures: texNames
  };
  writeFileSync(provPath, `${JSON.stringify(prov, null, 2)}\n`);
  updated.push(`${key.padEnd(14)} ${(previous.sizeBytes / 1024).toFixed(0).padStart(5)} KB -> ${(afterBytes.length / 1024).toFixed(0).padStart(5)} KB  (${newFile})`);
}

const totalBytes = readdirSync(modelsDir)
  .filter((f) => f.endsWith(".glb"))
  .reduce((sum, f) => sum + readFileSync(join(modelsDir, f)).length, 0);

console.log(`recolor-atlas-regions: updated ${updated.length}, skipped ${skipped.length}; total models dir = ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
for (const line of updated) console.log(`  ${line}`);
