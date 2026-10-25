#!/usr/bin/env node
// Flat stylised faces for the Iron Crown fighter rigs. The baked atlas carries realistic eyes, ears and skin noise as shard-shaped
// fragments. This tool (1) flattens every skin-family texel of the atlas to one skin colour (keeping a little of the shading),
// (2) moves the head's skin triangles into their own primitive with a small flat face texture (eyes, brows, nose, mouth) mapped by
// planar projection from the front of the head, and (3) paints the head's dark triangles (hair, headband) with a flat hair colour.
// Skeleton, skin weights, clips, cloth and every non-head triangle are untouched.
// Usage: node tools/iron-crown-restyle/flatface.mjs <in.glb> <out-dir> <name> [config-json]
// Config: { hair: [r,g,b], eye: [r,g,b], brow: [r,g,b], mouth: [r,g,b] } (0..255). Prints the output file name and sha256.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const [, , inFile, outDir, name, configArg] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: flatface.mjs <in.glb> <out-dir> <name> [config-json]"); process.exit(2); }
const CONFIG = configArg ? JSON.parse(configArg.trim().startsWith("{") ? configArg : readFileSync(configArg, "utf8")) : {};
const HAIR = CONFIG.hair ?? [24, 18, 16];
const EYE = CONFIG.eye ?? [22, 18, 20];
const BROW = CONFIG.brow ?? [34, 24, 20];
const MOUTH = CONFIG.mouth ?? [120, 52, 48];
const HEAD_JOINTS = new Set(["Head", "head_end", "headfront"]);

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max === 0 ? 0 : d / max, max];
}
const isSkin = (r, g, b) => { const [h, s, v] = rgbToHsv(r / 255, g / 255, b / 255); return h >= 8 && h <= 42 && s > 0.18 && s < 0.75 && v > 0.3; };

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const skin = root.listSkins()[0];
const joints = skin.listJoints();
const jname = joints.map((j) => j.getName());
const tex = root.listTextures()[0];
const baseMat = prim.getMaterial();

// 1. decode the atlas, find the median skin colour, flatten skin texels
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const samples = [];
for (let i = 0; i < data.length; i += 4 * 37) if (isSkin(data[i], data[i + 1], data[i + 2])) samples.push([data[i], data[i + 1], data[i + 2]]);
const vivid = samples.filter((c) => rgbToHsv(c[0] / 255, c[1] / 255, c[2] / 255)[1] > 0.3);
const pool = vivid.length > 200 ? vivid : samples;
pool.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
const SKIN = CONFIG.skin ?? pool[Math.floor(pool.length * 0.6)] ?? [210, 160, 125];
const skinLuma = 0.3 * SKIN[0] + 0.59 * SKIN[1] + 0.11 * SKIN[2];
const atlas = Buffer.from(data);
for (let i = 0; i < atlas.length; i += 4) {
  if (!isSkin(atlas[i], atlas[i + 1], atlas[i + 2])) continue;
  const l = 0.3 * atlas[i] + 0.59 * atlas[i + 1] + 0.11 * atlas[i + 2];
  const k = Math.max(0.9, Math.min(1.08, l / skinLuma));
  atlas[i] = Math.min(255, SKIN[0] * k); atlas[i + 1] = Math.min(255, SKIN[1] * k); atlas[i + 2] = Math.min(255, SKIN[2] * k);
}
const atlasPng = await sharp(atlas, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
tex.setImage(new Uint8Array(atlasPng));

// 2. read geometry
const attrNames = prim.listSemantics();
const A = Object.fromEntries(attrNames.map((s) => [s, prim.getAttribute(s)]));
const n = A.POSITION.getCount();
const P = Array.from({ length: n }, (_, i) => A.POSITION.getElement(i, []));
const UV = Array.from({ length: n }, (_, i) => A.TEXCOORD_0.getElement(i, []));
const J = Array.from({ length: n }, (_, i) => A.JOINTS_0.getElement(i, []));
const W = Array.from({ length: n }, (_, i) => A.WEIGHTS_0.getElement(i, []));
const idx = Array.from(prim.getIndices().getArray());
const dominant = (i) => { const m = new Map(); for (let k = 0; k < 4; k++) m.set(J[i][k], (m.get(J[i][k]) ?? 0) + W[i][k]); let b = J[i][0], bw = -1; for (const [id, w] of m) if (w > bw) { bw = w; b = id; } return jname[b]; };
const headVert = new Uint8Array(n);
const neckVert = new Uint8Array(n);
for (let i = 0; i < n; i++) { const d = dominant(i); headVert[i] = HEAD_JOINTS.has(d) ? 1 : 0; neckVert[i] = d === "neck" ? 1 : 0; }

// head frame
const headNode = joints.find((j) => j.getName() === "Head");
const frontNode = joints.find((j) => j.getName() === "headfront");
const hw = headNode.getWorldTranslation(), fw = frontNode.getWorldTranslation();
let fx = fw[0] - hw[0], fz = fw[2] - hw[2];
const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
const rx = fz, rz = -fx; // right axis in the ground plane
let ymin = 1e9, ymax = -1e9, umin = 1e9, umax = -1e9;
for (let i = 0; i < n; i++) if (headVert[i]) {
  const p = P[i]; ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]);
  const u = p[0] * rx + p[2] * rz; umin = Math.min(umin, u); umax = Math.max(umax, u);
}
let hcx = 0, hcz = 0, hn = 0;
for (let i = 0; i < n; i++) if (headVert[i]) { hcx += P[i][0]; hcz += P[i][2]; hn++; }
hcx /= hn; hcz /= hn;
const hr = (umax - umin) / 2;
const HAIRLINE = CONFIG.hairline ?? 0.3, BACKLINE = CONFIG.backline ?? -0.2;
const faceUV = (p) => [(p[0] * rx + p[2] * rz - umin) / (umax - umin), (ymax - p[1]) / (ymax - ymin)];

// 3. classify head triangles: hair (dark in the atlas) or skin
const lumaAt = (u, v) => { const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height))); const o = (y * info.width + x) * 4; return 0.3 * data[o] + 0.59 * data[o + 1] + 0.11 * data[o + 2]; };
const bodyTris = [], skinTris = [], hairTris = [];
for (let t = 0; t < idx.length; t += 3) {
  const v = [idx[t], idx[t + 1], idx[t + 2]];
  const heads = v.filter((i) => headVert[i]).length;
  const necks = v.filter((i) => neckVert[i]).length;
  // jaw triangles straddle the head and neck joints: one head vertex plus two head-or-neck vertices counts as head
  const triY = (P[v[0]][1] + P[v[1]][1] + P[v[2]][1]) / 3;
  const jaw = necks >= 2 && triY >= ymin + (ymax - ymin) * 0.02 && heads + necks === 3;
  if (!(heads >= 2 || (heads >= 1 && heads + necks >= 2) || jaw)) { bodyTris.push(...v); continue; }
  const cx = (P[v[0]][0] + P[v[1]][0] + P[v[2]][0]) / 3, cy = (P[v[0]][1] + P[v[1]][1] + P[v[2]][1]) / 3, cz = (P[v[0]][2] + P[v[1]][2] + P[v[2]][2]) / 3;
  const vt = (ymax - cy) / (ymax - ymin);
  const frontness = ((cx - hcx) * fx + (cz - hcz) * fz) / hr; // +1 at the face, -1 at the back of the skull
  const hair = vt < HAIRLINE || (frontness < BACKLINE && vt < 0.8);
  (hair ? hairTris : skinTris).push(...v);
}

// 4. face texture (flat skin, eyes, brows, nose, mouth) as an SVG rasterised by sharp
const S = 256, rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${rgb(SKIN)}"/>
  <ellipse cx="${S * 0.36}" cy="${S * 0.5}" rx="${S * 0.055}" ry="${S * 0.04}" fill="${rgb(EYE)}"/>
  <ellipse cx="${S * 0.64}" cy="${S * 0.5}" rx="${S * 0.055}" ry="${S * 0.04}" fill="${rgb(EYE)}"/>
  <circle cx="${S * 0.37}" cy="${S * 0.485}" r="${S * 0.012}" fill="rgb(240,240,240)"/>
  <circle cx="${S * 0.65}" cy="${S * 0.485}" r="${S * 0.012}" fill="rgb(240,240,240)"/>
  <path d="M ${S * 0.29} ${S * 0.43} L ${S * 0.43} ${S * 0.415}" stroke="${rgb(BROW)}" stroke-width="${S * 0.022}" stroke-linecap="round"/>
  <path d="M ${S * 0.71} ${S * 0.43} L ${S * 0.57} ${S * 0.415}" stroke="${rgb(BROW)}" stroke-width="${S * 0.022}" stroke-linecap="round"/>
  <path d="M ${S * 0.5} ${S * 0.52} L ${S * 0.485} ${S * 0.6} L ${S * 0.515} ${S * 0.6}" stroke="${rgb(shade(SKIN, 0.78))}" stroke-width="${S * 0.014}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M ${S * 0.42} ${S * 0.72} Q ${S * 0.5} ${S * 0.745} ${S * 0.58} ${S * 0.72}" stroke="${rgb(MOUTH)}" stroke-width="${S * 0.02}" fill="none" stroke-linecap="round"/>
</svg>`;
const facePng = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

// 5. rebuild primitives: body (original material and atlas), head skin (face material), head hair (flat colour)
const buffer = root.listBuffers()[0];
function makePrim(tris, material, uvMode) {
  if (!tris.length) return null;
  const remap = new Map(); const order = [];
  for (const v of tris) if (!remap.has(v)) { remap.set(v, order.length); order.push(v); }
  const out = doc.createPrimitive();
  for (const sem of attrNames) {
    const src = A[sem];
    const arr = new (src.getArray().constructor)(order.length * src.getElementSize());
    order.forEach((vi, k) => { const e = src.getElement(vi, []); if (sem === "TEXCOORD_0" && uvMode === "face") { const f = faceUV(P[vi]); e[0] = f[0]; e[1] = f[1]; } arr.set(e, k * src.getElementSize()); });
    const acc = doc.createAccessor().setType(src.getType()).setArray(arr).setNormalized(src.getNormalized()).setBuffer(buffer);
    out.setAttribute(sem, acc);
  }
  const ind = order.length < 65535 ? new Uint16Array(tris.map((v) => remap.get(v))) : new Uint32Array(tris.map((v) => remap.get(v)));
  out.setIndices(doc.createAccessor().setType("SCALAR").setArray(ind).setBuffer(buffer));
  out.setMaterial(material);
  return out;
}
const faceTex = doc.createTexture("face").setImage(new Uint8Array(facePng)).setMimeType("image/png");
const faceMat = doc.createMaterial("face").setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(faceTex).setMetallicFactor(0).setRoughnessFactor(0.7).setDoubleSided(baseMat.getDoubleSided());
faceMat.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071);
const hairMat = doc.createMaterial("hair").setBaseColorFactor([HAIR[0] / 255, HAIR[1] / 255, HAIR[2] / 255, 1]).setMetallicFactor(0).setRoughnessFactor(0.85).setDoubleSided(baseMat.getDoubleSided());
const parts = [makePrim(bodyTris, baseMat, "body"), makePrim(skinTris, faceMat, "face"), makePrim(hairTris, hairMat, "hair")].filter(Boolean);
mesh.removePrimitive(prim); prim.dispose();
for (const p of parts) mesh.addPrimitive(p);

mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, `${name}.tmp.glb`);
await io.write(tmp, doc);
const buf = readFileSync(tmp);
const hash = createHash("sha256").update(buf).digest("hex");
const file = `${name}.${hash.slice(0, 8)}.glb`;
renameSync(tmp, path.join(outDir, file));
console.log(JSON.stringify({ file, sizeBytes: buf.length, sha256: hash, skin: SKIN, headTris: { skin: skinTris.length / 3, hair: hairTris.length / 3, body: bodyTris.length / 3 }, front: [fx, fz] }));
