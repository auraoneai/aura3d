#!/usr/bin/env node
// Lamplight Line Idol post-process: find the dark glass texels of an Idol GLB's baked windows and either cut them out
// (tram: alpha MASK + double-sided, so riders and the procedural saloon show through) or turn them into an emissive
// window mask (houses, clock towers: the band scenes light them at dusk with a model materialOverride).
//
//   node examples/last-train-port/scripts/idol-windows.mjs <in.glb> <out.glb> --mode cut|glow
//        [--region '{"x":[a,b],"y":[a,b],"z":[a,b],"side":true,"ends":true}'] [--lum 0.4] [--sat 0.62] [--minArea 24]
//        [--dilate 1] [--debug mask.png]
//
// Region bounds are in the normalised model frame (metres, grounded, +Z forward). `side` keeps texels on faces whose normal
// points along +/-X, `ends` along +/-Z; omit both for every vertical face. The GLB is rewritten in place when in == out.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const args = process.argv.slice(2);
const [input, output] = args;
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const mode = opt("mode", "cut");
const region = JSON.parse(opt("region", "{}"));
const lumMax = Number(opt("lum", "0.4"));
/** Max saturation (chroma / max channel): smoked glass and dim interiors are muted; lacquer, shutters and wood doors are not. */
const satMax = Number(opt("sat", "0.62"));
const minArea = Number(opt("minArea", "24"));
const dilate = Number(opt("dilate", "1"));
const debug = opt("debug", "");
if (!input || !output || !["cut", "glow"].includes(mode)) {
  console.error("usage: idol-windows.mjs <in.glb> <out.glb> --mode cut|glow [--region json] [--lum n] [--sat n] [--minArea n] [--dilate n] [--debug png]");
  process.exit(2);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

function mat4MulVec(m, v, w) {
  return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w, m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w, m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w];
}
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const inRange = (r, v) => !r || (v >= r[0] && v <= r[1]);

const touched = new Map(); // material -> { tex, W, H, rgba, mask }
let texelsMarked = 0;
/** Model-space extent of the marked glass (reported, so the procedural interior can be fitted inside the shell). */
const ext = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
const grow = (r, v) => { if (v < r[0]) r[0] = v; if (v > r[1]) r[1] = v; };
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const tex = mat?.getBaseColorTexture();
    const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0"), nrm = prim.getAttribute("NORMAL");
    if (!mat || !tex || !pos || !uv) continue;
    let entry = touched.get(mat);
    if (!entry) {
      const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      entry = { tex, W: info.width, H: info.height, rgba: data, mask: new Uint8Array(info.width * info.height) };
      touched.set(mat, entry);
    }
    const { W, H, rgba, mask } = entry;
    const idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();
    const P = [], U = [], N = [];
    for (let t = 0; t < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getScalar(t + k) : t + k;
        P[k] = mat4MulVec(world, pos.getElement(vi, []), 1);
        U[k] = uv.getElement(vi, []);
        N[k] = nrm ? norm3(mat4MulVec(world, nrm.getElement(vi, []), 0)) : null;
      }
      // Face normal from the transformed triangle (robust to missing / smoothed normals).
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const fn = norm3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
      if (Math.abs(fn[1]) > 0.55) continue; // windows sit on vertical faces
      const sideFace = Math.abs(fn[0]) > 0.6, endFace = Math.abs(fn[2]) > 0.6;
      if ((region.side || region.ends) && !((region.side && sideFace) || (region.ends && endFace))) continue;
      const px = U.map((u) => [u[0] * W, u[1] * H]);
      const minX = Math.max(0, Math.floor(Math.min(px[0][0], px[1][0], px[2][0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(px[0][0], px[1][0], px[2][0])));
      const minY = Math.max(0, Math.floor(Math.min(px[0][1], px[1][1], px[2][1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(px[0][1], px[1][1], px[2][1])));
      const den = (px[1][1] - px[2][1]) * (px[0][0] - px[2][0]) + (px[2][0] - px[1][0]) * (px[0][1] - px[2][1]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          const a = ((px[1][1] - px[2][1]) * (cx - px[2][0]) + (px[2][0] - px[1][0]) * (cy - px[2][1])) / den;
          const b = ((px[2][1] - px[0][1]) * (cx - px[2][0]) + (px[0][0] - px[2][0]) * (cy - px[2][1])) / den;
          const c = 1 - a - b;
          const eps = -0.02;
          if (a < eps || b < eps || c < eps) continue;
          const wx = a * P[0][0] + b * P[1][0] + c * P[2][0], wy = a * P[0][1] + b * P[1][1] + c * P[2][1], wz = a * P[0][2] + b * P[1][2] + c * P[2][2];
          if (!inRange(region.x, Math.abs(wx)) || !inRange(region.y, wy) || !inRange(region.z, wz)) continue;
          const o = (y * W + x) * 4;
          const r = rgba[o] / 255, g = rgba[o + 1] / 255, bl = rgba[o + 2] / 255;
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
          const mx = Math.max(r, g, bl), sat = mx > 0 ? (mx - Math.min(r, g, bl)) / mx : 0;
          // Hue tests only above near-black: JPEG noise gives black glass random tints.
          const tinted = mx > 0.16 && ((g > r * 1.04 && g > bl) || (r > g * 1.6 && r > bl * 1.6));
          if (lum <= lumMax && (sat <= satMax || mx <= 0.16) && !tinted) { if (!mask[y * W + x]) texelsMarked++; mask[y * W + x] = 255; grow(ext.x, Math.abs(wx)); grow(ext.y, wy); grow(ext.z, wz); }
        }
      }
    }
  }
}

/** Drops specks smaller than `minArea` texels, then grows the mask by `dilate` texels (closes seams at window edges). */
function clean(mask, W, H) {
  const seen = new Uint8Array(W * H), out = new Uint8Array(W * H), stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp = [];
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop(); comp.push(p);
      const x = p % W, y = (p - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (comp.length >= minArea) for (const p of comp) out[p] = 255;
  }
  for (let d = 0; d < dilate; d++) {
    const grown = out.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (out[y * W + x]) continue;
      if ((x > 0 && out[y * W + x - 1]) || (x < W - 1 && out[y * W + x + 1]) || (y > 0 && out[(y - 1) * W + x]) || (y < H - 1 && out[(y + 1) * W + x])) grown[y * W + x] = 255;
    }
    out.set(grown);
  }
  return out;
}

let kept = 0;
for (const [mat, e] of touched) {
  const m = clean(e.mask, e.W, e.H);
  for (const v of m) if (v) kept++;
  if (debug) await sharp(Buffer.from(m), { raw: { width: e.W, height: e.H, channels: 1 } }).png().toFile(debug);
  if (mode === "cut") {
    const out = Buffer.from(e.rgba);
    for (let i = 0; i < e.W * e.H; i++) out[i * 4 + 3] = m[i] ? 0 : 255;
    const png = await sharp(out, { raw: { width: e.W, height: e.H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    e.tex.setImage(new Uint8Array(png)).setMimeType("image/png");
    mat.setAlphaMode("MASK").setAlphaCutoff(0.5).setDoubleSided(true);
  } else {
    const rgb = Buffer.alloc(e.W * e.H * 3);
    for (let i = 0; i < e.W * e.H; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = m[i];
    const jpg = await sharp(rgb, { raw: { width: e.W, height: e.H, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    const glowTex = doc.createTexture(`${mat.getName() || "material"}-window-glow`).setImage(new Uint8Array(jpg)).setMimeType("image/jpeg");
    mat.setEmissiveTexture(glowTex).setEmissiveFactor([0, 0, 0]);
    const info = mat.getEmissiveTextureInfo(), base = mat.getBaseColorTextureInfo();
    if (info && base) info.setTexCoord(base.getTexCoord());
  }
}
const asset = root.getAsset();
const extras = asset.extras ?? {};
const aura = extras.aura3d ?? {};
asset.extras = { ...extras, aura3d: { ...aura, lamplightWindows: { mode, region, lumMax, satMax, minArea, dilate, texels: kept } } };
await io.write(output, doc);
const r2 = (r) => r.map((v) => Math.round(v * 1000) / 1000);
console.log(JSON.stringify({ input, output, mode, marked: texelsMarked, kept, materials: touched.size, glassExtent: { absX: r2(ext.x), y: r2(ext.y), z: r2(ext.z) } }));
