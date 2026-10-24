#!/usr/bin/env node
// The athlete GLB's UVs tear across the whole atlas (single triangles span hundreds of texels), so no texture repaint can
// fix its shard artefacts. This tool classifies every vertex by body region from the mesh's own skin weights (hair, skin,
// jersey, shorts, socks and shoes, sole), splits only the edges that straddle two regions (conforming, three passes, down
// to 1.5 cm) so the hems and sleeves are clean cuts, and points each vertex's UV at one cell of a tiny flat palette strip
// (NEAREST filtered). The shard atlas, the seam-outlining normal map and the metal/rough map are dropped; skeleton and clips
// are untouched. One primitive and one 70x2 texture per athlete. (The engine ignores glTF COLOR_0 on this skinned path.)
// Usage: node tools/hoops-athlete-retexture/retexture-palette.mjs <in.glb> <out-dir> <name>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const [, , inFile, outDir, name] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: retexture-palette.mjs <in.glb> <out-dir> <name>"); process.exit(2); }

const PALETTE = {
  jersey: [236, 236, 230], shorts: [52, 58, 74], skin: [168, 108, 78], hair: [30, 24, 20], sole: [40, 42, 48]
};
// Seven flat cells ordered so every pair of classes that meets on the body is adjacent in the strip
// (hair|skin|kit|shorts|skin|kit|sole): a triangle spanning two classes only samples those two cells.
const CELL_PX = 10;
const CELLS = [PALETTE.hair, PALETTE.skin, PALETTE.jersey, PALETTE.shorts, PALETTE.skin, PALETTE.jersey, PALETTE.sole];
const MIN_EDGE = 0.015;
const PASSES = 3;

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const skin = root.listSkins()[0];
const jointNames = skin.listJoints().map((j) => j.getName());
const acc = { pos: prim.getAttribute("POSITION"), nor: prim.getAttribute("NORMAL"), uv: prim.getAttribute("TEXCOORD_0"), jts: prim.getAttribute("JOINTS_0"), wts: prim.getAttribute("WEIGHTS_0") };
const idxAcc = prim.getIndices();
const n0 = acc.pos.getCount();

const P = [], N = [], J = [], W = [];
for (let i = 0; i < n0; i += 1) {
  P.push(acc.pos.getElement(i, []));
  N.push(acc.nor.getElement(i, []));
  J.push(acc.jts.getElement(i, []).slice(0, 4));
  W.push(acc.wts.getElement(i, []).slice(0, 4));
}
let tris = [];
{
  const ix = idxAcc ? Array.from(idxAcc.getArray()) : Array.from({ length: n0 }, (_, i) => i);
  for (let t = 0; t < ix.length; t += 3) tris.push([ix[t], ix[t + 1], ix[t + 2]]);
}

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
let hy0 = Infinity, hy1 = -Infinity;
for (let i = 0; i < n0; i += 1) if (dominant(i) === "Head") { hy0 = Math.min(hy0, P[i][1]); hy1 = Math.max(hy1, P[i][1]); }

function cellOf(v) {
  const j = dominant(v);
  const y = P[v][1];
  const h = (y - ymin) / H;
  if (j === "Head") return y > hy1 - (hy1 - hy0) * 0.4 ? 0 : 1;
  if (j === "Chest" || j === "Spine") return h > 0.835 ? 1 : 2;
  if (j === "Hips") return 3;
  if (j.endsWith("UpperLeg")) return h > 0.4 ? 3 : 4;
  if (j.endsWith("LowerLeg")) return h < 0.13 ? 5 : 4;
  if (j.endsWith("Foot")) return h < 0.018 ? 6 : 5;
  if (j.endsWith("UpperArm")) return h > 0.74 ? 2 : 1;
  if (j.endsWith("Forearm")) return 1;
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
  const wantSplit = (a, b) => cell(a) !== cell(b) && dist(a, b) > MIN_EDGE;
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
    // two split edges: split the third corner off as a triangle and the quad in two
    if (!e[0]) { next.push([c, mca, mbc], [mca, a, b], [mca, b, mbc]); }
    else if (!e[1]) { next.push([a, mab, mca], [mab, b, c], [mab, c, mca]); }
    else { next.push([b, mbc, mab], [mbc, c, a], [mbc, a, mab]); }
  }
  tris = next;
}

const n = P.length;
const W_PX = CELLS.length * CELL_PX;
const raw = new Uint8Array(W_PX * 2 * 3);
for (let c = 0; c < CELLS.length; c += 1) for (let x = 0; x < CELL_PX; x += 1) for (let y = 0; y < 2; y += 1) {
  const o = (y * W_PX + c * CELL_PX + x) * 3;
  raw[o] = CELLS[c][0]; raw[o + 1] = CELLS[c][1]; raw[o + 2] = CELLS[c][2];
}
const cellCount = new Array(CELLS.length).fill(0);
const posArr = new Float32Array(n * 3), norArr = new Float32Array(n * 3), uvArr = new Float32Array(n * 2), jArr = new Uint16Array(n * 4), wArr = new Float32Array(n * 4);
for (let v = 0; v < n; v += 1) {
  const c = cellOf(v);
  cellCount[c] += 1;
  posArr.set(P[v], v * 3); norArr.set(N[v], v * 3);
  uvArr[v * 2] = (c * CELL_PX + CELL_PX / 2) / W_PX; uvArr[v * 2 + 1] = 0.5;
  jArr.set(J[v], v * 4); wArr.set(W[v], v * 4);
}
const flat = new Uint32Array(tris.length * 3);
tris.forEach((t, i) => { flat[i * 3] = t[0]; flat[i * 3 + 1] = t[1]; flat[i * 3 + 2] = t[2]; });
acc.pos.setArray(posArr);
acc.nor.setArray(norArr);
acc.uv.setArray(uvArr).setNormalized(false);
acc.jts.setArray(jArr);
acc.wts.setArray(wArr).setNormalized(false);
if (idxAcc) idxAcc.setArray(flat);
else prim.setIndices(doc.createAccessor(`${name}-idx`).setType("SCALAR").setArray(flat).setBuffer(root.listBuffers()[0]));

const png = await sharp(Buffer.from(raw), { raw: { width: W_PX, height: 2, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
const material = prim.getMaterial();
const toDispose = [material.getBaseColorTexture(), material.getNormalTexture(), material.getMetallicRoughnessTexture()].filter(Boolean);
const tex = doc.createTexture(`${name}-palette`).setImage(new Uint8Array(png)).setMimeType("image/png");
material.setBaseColorTexture(tex).setNormalTexture(null).setMetallicRoughnessTexture(null).setRoughnessFactor(0.74).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]);
material.getBaseColorTextureInfo().setMagFilter(9728).setMinFilter(9728).setWrapS(33071).setWrapT(33071);
for (const t of toDispose) t.dispose();
for (const t of root.listTextures()) if (t !== tex) t.dispose();

const glb = await io.writeBinary(doc);
const hash = createHash("sha256").update(glb).digest("hex");
mkdirSync(outDir, { recursive: true });
const file = `${name}.${hash.slice(0, 8)}.glb`;
writeFileSync(path.join(outDir, file), glb);
console.log(JSON.stringify({ file, sha256: hash, sizeBytes: glb.length, verts: n, vertsBefore: n0, triangles: tris.length, splitEdges, cells: Object.fromEntries(cellCount.map((c, i) => [`cell${i}`, c])), inputBytes: readFileSync(inFile).length }));
