#!/usr/bin/env node
// Palette repaint with clean hems and a flat stylised face, for any of the rigged athlete models (the 15-joint rig).
// Input can be the shard-atlas original, a multi-material "Clean" model, or an earlier palette model: all primitives are
// merged and every vertex is classified by body region from its own skin weights. Edges that straddle two regions are
// split (conforming, down to 1.5 cm, 6 mm on the head) so hems, sleeves and face features are clean cuts. Each vertex's
// UV then points at one cell of a tiny flat palette (NEAREST). Row 0 holds the body colours, row 1 the face ink: the ink
// cells sit directly under the skin cell so a triangle between skin and ink only samples those two. Skeleton and clips are
// untouched. One primitive, one tiny texture.
// Usage: node tools/hoops-athlete-retexture/retexture-face.mjs <in.glb> <out-dir> <name> [config.json | inline-json]
// Config: { fit: true (derive palette, legs, sleeves and shortsHem from the input model's own regions), minEdge: 0.006, palette: {hair, skin, jersey, shorts, sock, shoe, ink}, legs: "shorts"|"pants", sleeves: "short"|"long", shortsHem: 0.4, materials: false,
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
const PAL = { hair: [30, 24, 20], skin: [168, 108, 78], jersey: [236, 236, 230], shorts: [52, 58, 74], sock: [232, 232, 226], shoe: [40, 42, 48], ink: [34, 26, 24], white: [226, 220, 208], ...(CONFIG.palette ?? {}) };
let LEGS = CONFIG.legs ?? "shorts";
let SLEEVES = CONFIG.sleeves ?? "short";
const HAIR_LINE = CONFIG.hairLine ?? 0.68;
const FACE = CONFIG.face ?? true;
let SHORTS_HEM = CONFIG.shortsHem ?? 0.4; // leg height fraction where the shorts end
const MATERIALS = CONFIG.materials ?? false; // true: one flat material per part (kit, shorts, socks, skin, dark) so a game can tint them by name
const FRONT = (CONFIG.faceFront ?? "+z") === "+z" ? 1 : -1;
// cells: 0 hair | 1 skin | 2 jersey | 3 shorts | 4 lower leg (skin, or trousers) | 5 sock | 6 shoe | 7 ink (row 1, under cell 1)
//   8 eye white | 9 skin around the eyes | 10 pupil: a second column (col 7) stacked skin2 / white / pupil so a triangle between two
//   neighbouring eye cells only samples those two (round eyes with a white sclera and a pupil dot).
const CELL_PX = 10, COLS = 8, ROWS = 3;
const uvCell = (c) => (c <= 6 ? [c, 0] : c === 7 ? [1, 1] : c === 8 ? [7, 1] : c === 9 ? [7, 0] : [7, 2]);
const MIN_EDGE = CONFIG.minEdge ?? 0.006, MIN_EDGE_FACE = 0.004, PASSES = CONFIG.passes ?? 6;
const FACE_CELLS = new Set([7, 8, 9, 10]);
const ROUGH = CONFIG.roughness ?? 0.86; // flat colours under a bright sky look glossy at lower roughness
const SMOOTH = CONFIG.smoothNormals ?? true;
const CREASE = Math.cos(((CONFIG.creaseDeg ?? 55) * Math.PI) / 180);

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const skin = root.listSkins()[0];
const jointNames = skin.listJoints().map((j) => j.getName());

const P = [], N = [], J = [], W = [], EX = [];
let tris = [];
for (const prim of mesh.listPrimitives()) {
  const base = P.length;
  const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL"), jts = prim.getAttribute("JOINTS_0"), wts = prim.getAttribute("WEIGHTS_0"), uvs = prim.getAttribute("TEXCOORD_0");
  const n = pos.getCount();
  const primMat = prim.getMaterial();
  for (let i = 0; i < n; i += 1) {
    P.push(pos.getElement(i, []));
    N.push(nor.getElement(i, []));
    J.push(jts.getElement(i, []).slice(0, 4));
    W.push(wts.getElement(i, []).slice(0, 4));
    EX.push({ uv: uvs ? uvs.getElement(i, []) : null, mat: primMat });
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

let WAIST_Y = null; // clean jersey/shorts line (set below); until then the dominant joint decides
function cellOf(v) {
  const j = dominant(v);
  const y = P[v][1];
  const h = (y - ymin) / H;
  if (j === "Head") {
    const fh = (y - hy0) / hh;
    const front = N[v][2] * FRONT > 0.35 && (P[v][2] - hcz) * FRONT > 0;
    if (FACE && front) {
      const u = Math.abs(P[v][0] - hcx) / hw;
      // round eyes: white sclera ellipse with a pupil dot toward the nose, a thin brow and a small mouth
      const ex = (u - 0.42) / 0.15, ey = (fh - 0.535) / 0.05;
      if (ex * ex + ey * ey < 1) {
        const px = (u - 0.38) / 0.085, py = (fh - 0.535) / 0.032;
        return px * px + py * py < 1 ? 10 : 8;
      }
      if (fh > 0.615 && fh < 0.645 && u > 0.24 && u < 0.62) return 7; // brow
      if (fh > 0.215 && fh < 0.255 && u < 0.17) return 7; // mouth
      if (fh > 0.40 && fh < 0.70 && u < 0.78 && fh <= HAIR_LINE) return 9; // skin around the eyes keeps its own palette column
    }
    if (fh > HAIR_LINE) return 0;
    if (!front && fh > 0.42) return 0; // hair wraps the sides and back lower than the front hairline
    return 1;
  }
  if (WAIST_Y !== null && (j === "Chest" || j === "Spine" || j === "Hips")) return h > 0.835 ? 1 : y < WAIST_Y ? 3 : 2;
  if (j === "Chest" || j === "Spine") return h > 0.835 ? 1 : 2;
  if (j === "Hips") return 3;
  if (j.endsWith("UpperLeg")) return h > SHORTS_HEM || LEGS === "pants" ? 3 : 4;
  if (j.endsWith("LowerLeg")) return h < 0.13 ? 5 : 4;
  if (j.endsWith("Foot")) return 6;
  if (j.endsWith("UpperArm")) return SLEEVES === "long" || h > 0.74 ? 2 : 1;
  if (j.endsWith("Forearm")) return SLEEVES === "long" && h > 0.55 ? 2 : 1;
  return 1;
}

// Waist line: the jersey hem and the shorts waistband meet at one clean height instead of wherever the skin-weight dominant
// joint flips (which is noisy and produced a ragged fringe). Midpoint between the lowest jersey vertices and the highest
// pelvis vertices, using robust percentiles.
{
  const up = [], low = [];
  for (let i = 0; i < n0; i += 1) {
    const j = dominant(i), h = (P[i][1] - ymin) / H;
    if ((j === "Chest" || j === "Spine") && h <= 0.835) up.push(P[i][1]);
    else if (j === "Hips") low.push(P[i][1]);
  }
  const pct = (a, q) => { a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))]; };
  if (up.length && low.length) WAIST_Y = (pct(up, 0.03) + pct(low, 0.97)) / 2;
}

// Fit mode: take the palette and the leg/sleeve/hem configuration from the input model itself. The existing region of every
// vertex comes from its UV cell (palette models) or its material name (named flat materials); the variant of the rules that
// agrees with it on the most body vertices wins, so re-running the tool keeps the kit exactly as shipped.
let fitReport = null;
if (CONFIG.fit) {
  const srgb = (c) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, c)), 1 / 2.2));
  const exGroup = new Array(n0).fill(null), exCell = new Array(n0).fill(null);
  let mode = "none";
  const firstTex = EX.find((e) => e.mat && e.mat.getBaseColorTexture())?.mat.getBaseColorTexture();
  if (firstTex && EX[0].uv) {
    mode = "palette";
    const dec = await sharp(Buffer.from(firstTex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = dec.info;
    const cols = Math.round(width / CELL_PX);
    const px = (c, r) => { const o = (Math.min(height - 1, r) * width + c * CELL_PX + 5) * 3; return [dec.data[o], dec.data[o + 1], dec.data[o + 2]]; };
    PAL.hair = px(0, 0); PAL.skin = px(1, 0); PAL.jersey = px(2, 0); PAL.shorts = px(3, 0); PAL.sock = px(5, 0); PAL.shoe = px(6, 0); PAL.ink = px(1, 1);
    for (let i = 0; i < n0; i += 1) {
      const uv = EX[i].uv; if (!uv) continue;
      const c = Math.min(cols - 1, Math.floor(uv[0] * width / CELL_PX)), r = Math.min(height - 1, Math.floor(uv[1] * height));
      exCell[i] = r >= 1 && c === 1 ? 7 : c === 7 && cols >= 8 ? (r === 0 ? 9 : r === 1 ? 8 : 10) : c;
    }
  } else {
    mode = "materials";
    const byName = {};
    for (const m of root.listMaterials()) { const nm = m.getName().split("-").pop(); byName[nm] = m.getBaseColorFactor(); }
    const col = (k, d) => (byName[k] ? byName[k].slice(0, 3).map(srgb) : d);
    PAL.jersey = col("kit", PAL.jersey); PAL.shorts = col("shorts", PAL.shorts); PAL.sock = col("socks", PAL.sock); PAL.skin = col("skin", PAL.skin);
    PAL.hair = col("dark", PAL.hair); PAL.shoe = PAL.hair; PAL.ink = PAL.hair;
    for (let i = 0; i < n0; i += 1) exGroup[i] = (EX[i].mat?.getName() ?? "").split("-").pop();
  }
  const groupOfCell = (c, legs) => (c === 0 || c === 6 || c === 7 || c === 10 ? "dark" : c === 1 || c === 9 ? "skin" : c === 2 ? "kit" : c === 3 ? "shorts" : c === 4 ? (legs === "pants" ? "shorts" : "skin") : c === 5 ? "socks" : c === 8 ? "eyes" : "?");
  const variants = [];
  for (const legs of ["shorts", "pants"]) for (const sleeves of ["short", "long"]) for (const hem of legs === "pants" ? [0.4] : [0.3, 0.33, 0.36, 0.4, 0.45, 0.5]) variants.push({ legs, sleeves, hem });
  let best = null;
  for (const v of variants) {
    LEGS = v.legs; SLEEVES = v.sleeves; SHORTS_HEM = v.hem;
    let ok = 0, tot = 0;
    for (let i = 0; i < n0; i += 1) {
      if (dominant(i) === "Head") continue;
      const g0 = mode === "palette" ? (exCell[i] === null ? null : groupOfCell(exCell[i], v.legs)) : exGroup[i];
      if (!g0) continue;
      tot += 1;
      if (groupOfCell(cellOf(i), v.legs) === g0) ok += 1;
    }
    const score = tot ? ok / tot : 0;
    if (!best || score > best.score + 1e-9) best = { ...v, score, tot };
  }
  LEGS = best.legs; SLEEVES = best.sleeves; SHORTS_HEM = best.hem;
  fitReport = { mode, legs: LEGS, sleeves: SLEEVES, shortsHem: SHORTS_HEM, agreement: Number(best.score.toFixed(4)), palette: PAL };
}
const ROW0 = [PAL.hair, PAL.skin, PAL.jersey, PAL.shorts, LEGS === "pants" ? PAL.shorts : PAL.skin, PAL.sock, PAL.shoe];

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
    return dist(a, b) > (FACE_CELLS.has(ca) || FACE_CELLS.has(cb) || (dominant(a) === "Head" && dominant(b) === "Head") ? MIN_EDGE_FACE : MIN_EDGE);
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

// The Meshy mesh carries noisy per-vertex normals that a flat colour turns into glossy blotches under a bright sky. Recompute them
// from the final triangles: area-weighted over welded positions, but only across faces within the crease angle of this vertex's
// own incident faces, so hems, jersey edges and fingers stay crisp. The skinned bind pose is what is smoothed.
if (SMOOTH) {
  const nv = P.length;
  const faceN = tris.map(([a, b, c]) => {
    const u = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]], v = [P[c][0] - P[a][0], P[c][1] - P[a][1], P[c][2] - P[a][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(n[0], n[1], n[2]);
    return area > 0 ? { n: [n[0] / area, n[1] / area, n[2] / area], area } : { n: [0, 1, 0], area: 0 };
  });
  const wkey = (i) => `${Math.round(P[i][0] * 2e4)},${Math.round(P[i][1] * 2e4)},${Math.round(P[i][2] * 2e4)}`;
  const atWeld = new Map();
  const atVert = Array.from({ length: nv }, () => []);
  tris.forEach((t, fi) => { for (const v of t) { atVert[v].push(fi); const k = wkey(v); (atWeld.get(k) ?? atWeld.set(k, []).get(k)).push(fi); } });
  const NN = new Array(nv);
  for (let v = 0; v < nv; v += 1) {
    let mx = 0, my = 0, mz = 0;
    for (const fi of atVert[v]) { mx += faceN[fi].n[0] * faceN[fi].area; my += faceN[fi].n[1] * faceN[fi].area; mz += faceN[fi].n[2] * faceN[fi].area; }
    const ml = Math.hypot(mx, my, mz);
    if (ml < 1e-12) { NN[v] = N[v]; continue; }
    const own = [mx / ml, my / ml, mz / ml];
    let nx = 0, ny = 0, nz = 0;
    for (const fj of atWeld.get(wkey(v))) {
      const o = faceN[fj];
      if (o.n[0] * own[0] + o.n[1] * own[1] + o.n[2] * own[2] < CREASE) continue;
      nx += o.n[0] * o.area; ny += o.n[1] * o.area; nz += o.n[2] * o.area;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    NN[v] = [nx / l, ny / l, nz / l];
  }
  for (let v = 0; v < nv; v += 1) N[v] = NN[v];
}

const n = P.length;
const W_PX = COLS * CELL_PX, H_PX = ROWS;
const raw = new Uint8Array(W_PX * H_PX * 3);
const colAt = (c, y) => (c === 7 ? (y === 0 ? PAL.skin : y === 1 ? PAL.white : PAL.ink) : y === 0 ? ROW0[c] : y === 1 && c === 1 ? PAL.ink : ROW0[c]);
for (let y = 0; y < H_PX; y += 1) for (let c = 0; c < COLS; c += 1) for (let x = 0; x < CELL_PX; x += 1) {
  const col = colAt(c, y);
  const o = (y * W_PX + c * CELL_PX + x) * 3;
  raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
}
const cellCount = new Array(11).fill(0);
const posArr = new Float32Array(n * 3), norArr = new Float32Array(n * 3), uvArr = new Float32Array(n * 2), jArr = new Uint16Array(n * 4), wArr = new Float32Array(n * 4);
for (let v = 0; v < n; v += 1) {
  const c = cellOf(v);
  cellCount[c] += 1;
  posArr.set(P[v], v * 3); norArr.set(N[v], v * 3);
  const [uc, ur] = uvCell(c);
  uvArr[v * 2] = (uc * CELL_PX + CELL_PX / 2) / W_PX;
  uvArr[v * 2 + 1] = (ur + 0.5) / ROWS;
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
  const GROUPS = { kit: [2], shorts: [3], socks: [5], skin: [1, 9], dark: [0, 6, 7, 10], eyes: [8] };
  if (LEGS === "pants") GROUPS.shorts.push(4); else GROUPS.skin.push(4);
  const groupOfCell = new Map();
  for (const [g, cells] of Object.entries(GROUPS)) for (const c of cells) groupOfCell.set(c, g);
  const colours = { kit: PAL.jersey, shorts: PAL.shorts, socks: PAL.sock, skin: PAL.skin, dark: PAL.hair, eyes: PAL.white };
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
    const mat = doc.createMaterial(`${name}-${g}`).setBaseColorFactor(lin(colours[g])).setRoughnessFactor(ROUGH).setMetallicFactor(0);
    const pr = doc.createPrimitive()
      .setAttribute("POSITION", acc(`pos-${g}`, "VEC3", pp)).setAttribute("NORMAL", acc(`nor-${g}`, "VEC3", nn))
      .setAttribute("JOINTS_0", acc(`jts-${g}`, "VEC4", jj)).setAttribute("WEIGHTS_0", acc(`wts-${g}`, "VEC4", ww))
      .setIndices(acc(`idx-${g}`, "SCALAR", local)).setMaterial(mat);
    mesh.addPrimitive(pr);
  }
} else {
const png = await sharp(Buffer.from(raw), { raw: { width: W_PX, height: H_PX, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
const tex = doc.createTexture(`${name}-palette`).setImage(new Uint8Array(png)).setMimeType("image/png");
const material = doc.createMaterial(name).setBaseColorTexture(tex).setRoughnessFactor(ROUGH).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]);
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
console.log(JSON.stringify({ fit: fitReport, file, sha256: hash, sizeBytes: glb.length, verts: n, vertsBefore: n0, triangles: tris.length, splitEdges, cells: Object.fromEntries(cellCount.map((c, i) => [`cell${i}`, c])), inputBytes: readFileSync(inFile).length }));
