#!/usr/bin/env node
// Palette repaint with clean hems and a flat stylised face, for any of the rigged athlete models (the 15-joint rig).
// Input can be the shard-atlas original, a multi-material "Clean" model, or an earlier palette model: all primitives are
// merged and every vertex is classified by body region from its own skin weights. Edges that straddle two regions are
// split (conforming, down to 1.5 cm, 6 mm on the head) so hems, sleeves and face features are clean cuts. Each vertex's
// UV then points at one cell of a tiny flat palette (NEAREST). Row 0 holds the body colours, row 1 the face ink: the ink
// cells sit directly under the skin cell so a triangle between skin and ink only samples those two. Skeleton and clips are
// untouched. One primitive, one tiny texture.
// Usage: node tools/hoops-athlete-retexture/retexture-face.mjs <in.glb> <out-dir> <name> [config.json | inline-json]
// Config: { palette: {hair, skin, jersey, shorts, sock, shoe, ink}, legs: "shorts"|"pants", sleeves: "short"|"long", shortsHem: 0.4, materials: false,
//   hairLine: 0.68 (head height fraction where hair/cap starts at the front), face: true, faceFront: "+z"|"-z" }
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const [, , inFile, outDir, name, configArg] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: retexture-face.mjs <in.glb> <out-dir> <name> [config]"); process.exit(2); }
const CONFIG = configArg ? JSON.parse(configArg.trim().startsWith("{") ? configArg : readFileSync(configArg, "utf8")) : {};
const PAL = { hair: [30, 24, 20], skin: [168, 108, 78], jersey: [236, 236, 230], shorts: [52, 58, 74], sock: [232, 232, 226], shoe: [40, 42, 48], ink: [34, 26, 24], ...(CONFIG.palette ?? {}) };
const LEGS = CONFIG.legs ?? "shorts";
const SLEEVES = CONFIG.sleeves ?? "short";
const HAIR_LINE = CONFIG.hairLine ?? 0.68;
const FACE = CONFIG.face ?? true;
const SHORTS_HEM = CONFIG.shortsHem ?? 0.4; // leg height fraction where the shorts end
const MATERIALS = CONFIG.materials ?? false; // true: one flat material per part (kit, shorts, socks, skin, dark) so a game can tint them by name
const FRONT = (CONFIG.faceFront ?? "+z") === "+z" ? 1 : -1;
// cells: 0 hair | 1 skin | 2 jersey | 3 shorts | 4 lower leg (skin, or trousers) | 5 sock | 6 shoe | 7 ink (row 1, under cell 1)
const CELL_PX = 10, COLS = 7;
const ROW0 = [PAL.hair, PAL.skin, PAL.jersey, PAL.shorts, LEGS === "pants" ? PAL.shorts : PAL.skin, PAL.sock, PAL.shoe];
const MIN_EDGE = 0.015, MIN_EDGE_FACE = 0.006, PASSES = 5;

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const skin = root.listSkins()[0];
const jointNames = skin.listJoints().map((j) => j.getName());

const P = [], N = [], J = [], W = [];
let tris = [];
for (const prim of mesh.listPrimitives()) {
  const base = P.length;
  const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL"), jts = prim.getAttribute("JOINTS_0"), wts = prim.getAttribute("WEIGHTS_0");
  const n = pos.getCount();
  for (let i = 0; i < n; i += 1) {
    P.push(pos.getElement(i, []));
    N.push(nor.getElement(i, []));
    J.push(jts.getElement(i, []).slice(0, 4));
    W.push(wts.getElement(i, []).slice(0, 4));
  }
  const ia = prim.getIndices();
  const ix = ia ? Array.from(ia.getArray()) : Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < ix.length; t += 3) tris.push([base + ix[t], base + ix[t + 1], base + ix[t + 2]]);
}
const n0 = P.length;

let ymin = Infinity, ymax = -Infinity;
for (const p of P) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
const H = ymax - ymin;
const dominant = (v) => {
  const sums = new Map();
  for (let k = 0; k < 4; k += 1) sums.set(J[v][k], (sums.get(J[v][k]) ?? 0) + W[v][k]);
  let best = J[v][0], bw = -1;
  for (const [id, sum] of sums) if (sum > bw) { bw = sum; best = id; }
  return jointNames[best] ?? "Root";
};
let hy0 = Infinity, hy1 = -Infinity, hx0 = Infinity, hx1 = -Infinity, hz0 = Infinity, hz1 = -Infinity;
for (let i = 0; i < n0; i += 1) if (dominant(i) === "Head") {
  hy0 = Math.min(hy0, P[i][1]); hy1 = Math.max(hy1, P[i][1]);
  hx0 = Math.min(hx0, P[i][0]); hx1 = Math.max(hx1, P[i][0]);
  hz0 = Math.min(hz0, P[i][2]); hz1 = Math.max(hz1, P[i][2]);
}
const hcx = (hx0 + hx1) / 2, hcz = (hz0 + hz1) / 2, hw = (hx1 - hx0) / 2, hh = hy1 - hy0;

function cellOf(v) {
  const j = dominant(v);
  const y = P[v][1];
  const h = (y - ymin) / H;
  if (j === "Head") {
    const fh = (y - hy0) / hh;
    const front = N[v][2] * FRONT > 0.35 && (P[v][2] - hcz) * FRONT > 0;
    if (FACE && front) {
      const u = Math.abs(P[v][0] - hcx) / hw;
      if (fh > 0.47 && fh < 0.61 && u > 0.22 && u < 0.62) return 7; // eyes
      if (fh > 0.2 && fh < 0.285 && u < 0.3) return 7; // mouth
    }
    if (fh > HAIR_LINE) return 0;
    if (!front && fh > 0.42) return 0; // hair wraps the sides and back lower than the front hairline
    return 1;
  }
  if (j === "Chest" || j === "Spine") return h > 0.835 ? 1 : 2;
  if (j === "Hips") return 3;
  if (j.endsWith("UpperLeg")) return h > SHORTS_HEM || LEGS === "pants" ? 3 : 4;
  if (j.endsWith("LowerLeg")) return h < 0.13 ? 5 : 4;
  if (j.endsWith("Foot")) return 6;
  if (j.endsWith("UpperArm")) return SLEEVES === "long" || h > 0.74 ? 2 : 1;
  if (j.endsWith("Forearm")) return SLEEVES === "long" && h > 0.55 ? 2 : 1;
  return 1;
}

const dist = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2]);
function midpoint(a, b) {
  const m = P.length;
  P.push([(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2]);
  const nn = [(N[a][0] + N[b][0]) / 2, (N[a][1] + N[b][1]) / 2, (N[a][2] + N[b][2]) / 2];
  const l = Math.hypot(...nn) || 1;
  N.push(nn.map((x) => x / l));
  const merged = new Map();
  for (const v of [a, b]) for (let k = 0; k < 4; k += 1) merged.set(J[v][k], (merged.get(J[v][k]) ?? 0) + W[v][k] * 0.5);
  const top = [...merged.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
  while (top.length < 4) top.push([0, 0]);
  const sum = top.reduce((s, e) => s + e[1], 0) || 1;
  J.push(top.map((e) => e[0]));
  W.push(top.map((e) => e[1] / sum));
  return m;
}

let splitEdges = 0;
for (let pass = 0; pass < PASSES; pass += 1) {
  const cls = new Map();
  const cell = (v) => { let c = cls.get(v); if (c === undefined) { c = cellOf(v); cls.set(v, c); } return c; };
  const mids = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const wantSplit = (a, b) => {
    const ca = cell(a), cb = cell(b);
    if (ca === cb) return false;
    return dist(a, b) > (ca === 7 || cb === 7 || (dominant(a) === "Head" && dominant(b) === "Head") ? MIN_EDGE_FACE : MIN_EDGE);
  };
  const next = [];
  for (const [a, b, c] of tris) {
    const e = [wantSplit(a, b), wantSplit(b, c), wantSplit(c, a)];
    const count = e.filter(Boolean).length;
    if (count === 0) { next.push([a, b, c]); continue; }
    const mid = (u, v) => { const k = key(u, v); let m = mids.get(k); if (m === undefined) { m = midpoint(u, v); mids.set(k, m); splitEdges += 1; } return m; };
    const mab = e[0] ? mid(a, b) : -1, mbc = e[1] ? mid(b, c) : -1, mca = e[2] ? mid(c, a) : -1;
    if (count === 3) { next.push([a, mab, mca], [mab, b, mbc], [mca, mbc, c], [mab, mbc, mca]); continue; }
    if (count === 1) {
      if (e[0]) next.push([a, mab, c], [mab, b, c]);
      else if (e[1]) next.push([b, mbc, a], [mbc, c, a]);
      else next.push([c, mca, b], [mca, a, b]);
      continue;
    }
    if (!e[0]) { next.push([c, mca, mbc], [mca, a, b], [mca, b, mbc]); }
    else if (!e[1]) { next.push([a, mab, mca], [mab, b, c], [mab, c, mca]); }
    else { next.push([b, mbc, mab], [mbc, c, a], [mbc, a, mab]); }
  }
  tris = next;
}

const n = P.length;
const W_PX = COLS * CELL_PX, H_PX = 2;
const raw = new Uint8Array(W_PX * H_PX * 3);
for (let y = 0; y < H_PX; y += 1) for (let c = 0; c < COLS; c += 1) for (let x = 0; x < CELL_PX; x += 1) {
  const col = y === 0 ? ROW0[c] : PAL.ink;
  const o = (y * W_PX + c * CELL_PX + x) * 3;
  raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
}
const cellCount = new Array(8).fill(0);
const posArr = new Float32Array(n * 3), norArr = new Float32Array(n * 3), uvArr = new Float32Array(n * 2), jArr = new Uint16Array(n * 4), wArr = new Float32Array(n * 4);
for (let v = 0; v < n; v += 1) {
  const c = cellOf(v);
  cellCount[c] += 1;
  posArr.set(P[v], v * 3); norArr.set(N[v], v * 3);
  const col = c === 7 ? 1 : c;
  uvArr[v * 2] = (col * CELL_PX + CELL_PX / 2) / W_PX;
  uvArr[v * 2 + 1] = c === 7 ? 0.75 : 0.25;
  jArr.set(J[v], v * 4); wArr.set(W[v], v * 4);
}
const flat = new Uint32Array(tris.length * 3);
tris.forEach((t, i) => { flat[i * 3] = t[0]; flat[i * 3 + 1] = t[1]; flat[i * 3 + 2] = t[2]; });

// Rebuild as a single primitive on fresh accessors; drop every old primitive, material and texture.
const buffer = root.listBuffers()[0];
const oldPrims = mesh.listPrimitives();
for (const p of oldPrims) mesh.removePrimitive(p);
for (const p of oldPrims) p.dispose();
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
const acc = (label, type, array, normalized = false) => doc.createAccessor(`${name}-${label}`).setType(type).setArray(array).setBuffer(buffer).setNormalized(normalized);
let prim;
if (MATERIALS) {
  const GROUPS = { kit: [2], shorts: [3], socks: [5], skin: [1], dark: [0, 6, 7] };
  if (LEGS === "pants") GROUPS.shorts.push(4); else GROUPS.skin.push(4);
  const groupOfCell = new Map();
  for (const [g, cells] of Object.entries(GROUPS)) for (const c of cells) groupOfCell.set(c, g);
  const colours = { kit: PAL.jersey, shorts: PAL.shorts, socks: PAL.sock, skin: PAL.skin, dark: PAL.hair };
  const cellOfVertex = new Array(n);
  for (let v = 0; v < n; v += 1) cellOfVertex[v] = cellOf(v);
  const buckets = new Map(Object.keys(GROUPS).map((g) => [g, []]));
  for (const [a, b, c] of tris) {
    const gs = [a, b, c].map((v) => groupOfCell.get(cellOfVertex[v]));
    const pick = gs[0] === gs[1] || gs[0] === gs[2] ? gs[0] : gs[1] === gs[2] ? gs[1] : gs[0];
    buckets.get(pick).push(a, b, c);
  }
  const lin = (c) => [...c.map((x) => Math.pow(x / 255, 2.2)), 1];
  for (const [g, list] of buckets) {
    if (list.length === 0) continue;
    // compact per-primitive vertex data (some loaders concatenate primitives and expect distinct accessors)
    const remap = new Map();
    const order = [];
    const local = new Uint32Array(list.length);
    for (let i = 0; i < list.length; i += 1) {
      let m = remap.get(list[i]);
      if (m === undefined) { m = order.length; remap.set(list[i], m); order.push(list[i]); }
      local[i] = m;
    }
    const m = order.length;
    const pp = new Float32Array(m * 3), nn = new Float32Array(m * 3), jj = new Uint16Array(m * 4), ww = new Float32Array(m * 4);
    order.forEach((v, k) => { pp.set(P[v], k * 3); nn.set(N[v], k * 3); jj.set(J[v], k * 4); ww.set(W[v], k * 4); });
    const mat = doc.createMaterial(`${name}-${g}`).setBaseColorFactor(lin(colours[g])).setRoughnessFactor(0.74).setMetallicFactor(0);
    const pr = doc.createPrimitive()
      .setAttribute("POSITION", acc(`pos-${g}`, "VEC3", pp)).setAttribute("NORMAL", acc(`nor-${g}`, "VEC3", nn))
      .setAttribute("JOINTS_0", acc(`jts-${g}`, "VEC4", jj)).setAttribute("WEIGHTS_0", acc(`wts-${g}`, "VEC4", ww))
      .setIndices(acc(`idx-${g}`, "SCALAR", local)).setMaterial(mat);
    mesh.addPrimitive(pr);
  }
} else {
const png = await sharp(Buffer.from(raw), { raw: { width: W_PX, height: H_PX, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
const tex = doc.createTexture(`${name}-palette`).setImage(new Uint8Array(png)).setMimeType("image/png");
const material = doc.createMaterial(name).setBaseColorTexture(tex).setRoughnessFactor(0.74).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]);
material.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728).setWrapS(33071).setWrapT(33071);
prim = doc.createPrimitive()
  .setAttribute("POSITION", acc("pos", "VEC3", posArr))
  .setAttribute("NORMAL", acc("nor", "VEC3", norArr))
  .setAttribute("TEXCOORD_0", acc("uv", "VEC2", uvArr))
  .setAttribute("JOINTS_0", acc("jts", "VEC4", jArr))
  .setAttribute("WEIGHTS_0", acc("wts", "VEC4", wArr))
  .setIndices(acc("idx", "SCALAR", flat))
  .setMaterial(material);
mesh.addPrimitive(prim);
}

await doc.transform(prune()); // drop orphaned accessors left by earlier weight-smoothing passes
const glb = await io.writeBinary(doc);
const hash = createHash("sha256").update(glb).digest("hex");
mkdirSync(outDir, { recursive: true });
const file = `${name}.${hash.slice(0, 8)}.glb`;
writeFileSync(path.join(outDir, file), glb);
console.log(JSON.stringify({ file, sha256: hash, sizeBytes: glb.length, verts: n, vertsBefore: n0, triangles: tris.length, splitEdges, cells: Object.fromEntries(cellCount.map((c, i) => [`cell${i}`, c])), inputBytes: readFileSync(inFile).length }));
