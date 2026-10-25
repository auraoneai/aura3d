#!/usr/bin/env node
// The golf cart's baked atlas is a shard mosaic (skin-toned fragments, noise), and its UVs tear across the whole sheet, so
// no repaint of the texture can fix it. This tool classifies the mesh's triangles by height and facing into flat-colour
// material groups (body, roof, seat, dark) and drops the three textures. Four draws, no texture memory.
// Usage: node tools/links-cart-retexture/retexture-cart.mjs <in.glb> <out-dir> <name> [config-json]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";

const [, , inFile, outDir, name, configArg] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: retexture-cart.mjs <in.glb> <out-dir> <name> [config]"); process.exit(2); }
const PAL = { body: [238, 236, 226], roof: [34, 92, 70], seat: [176, 140, 96], dark: [36, 38, 42], ...(configArg ? JSON.parse(configArg) : {}) };

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const pos = prim.getAttribute("POSITION");
const nor = prim.getAttribute("NORMAL");
const idxAcc = prim.getIndices();
const n = pos.getCount();
const P = [];
for (let i = 0; i < n; i += 1) P.push(pos.getElement(i, []));
const N = [];
for (let i = 0; i < n; i += 1) N.push(nor.getElement(i, []));
// All primitives share the one vertex buffer (a previous run of this tool splits by material), so concatenate their indices.
const idx = [];
for (const pr of mesh.listPrimitives()) { const ia = pr.getIndices(); if (ia) idx.push(...ia.getArray()); else for (let i = 0; i < n; i += 1) idx.push(i); }
const mn = pos.getMinNormalized([]), mx = pos.getMaxNormalized([]);
const H = mx[1] - mn[1];
const rel = (y) => (y - mn[1]) / H;

const groups = { body: [], roof: [], seat: [], dark: [] };
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
  const cy = (P[a][1] + P[b][1] + P[c][1]) / 3;
  const cz = (P[a][2] + P[b][2] + P[c][2]) / 3;
  const ny = (N[a][1] + N[b][1] + N[c][1]) / 3;
  const r = rel(cy);
  let g = "body";
  if (r < 0.26 || (ny < -0.5 && r < 0.5)) g = "dark";
  else if (r > 0.78) g = "roof";
  else if (r < 0.6 && ny > 0.55 && Math.abs(cz) < 0.3) g = "seat";
  groups[g].push(a, b, c);
}

// The Meshy mesh carries noisy per-vertex normals that a flat colour turns into a glossy sheen under a bright sky: recompute them
// (area-weighted over welded positions, only across faces within the crease angle of this vertex's own faces).
const CREASE = Math.cos((Number(process.env.CREASE ?? 55) * Math.PI) / 180);
const faceN = [];
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [P[idx[t]], P[idx[t + 1]], P[idx[t + 2]]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const area = Math.hypot(...nn);
  faceN.push(area > 0 ? { n: nn.map((x) => x / area), area } : { n: [0, 1, 0], area: 0 });
}
const wk = (i) => `${Math.round(P[i][0] * 2e4)},${Math.round(P[i][1] * 2e4)},${Math.round(P[i][2] * 2e4)}`;
const atWeld = new Map(), atVert = Array.from({ length: n }, () => []);
for (let f = 0; f < faceN.length; f += 1) for (let k = 0; k < 3; k += 1) { const v = idx[f * 3 + k]; atVert[v].push(f); const key = wk(v); (atWeld.get(key) ?? atWeld.set(key, []).get(key)).push(f); }
const NN = new Float32Array(n * 3);
for (let v = 0; v < n; v += 1) {
  let mx2 = 0, my2 = 0, mz2 = 0;
  for (const f of atVert[v]) { mx2 += faceN[f].n[0] * faceN[f].area; my2 += faceN[f].n[1] * faceN[f].area; mz2 += faceN[f].n[2] * faceN[f].area; }
  const ml = Math.hypot(mx2, my2, mz2);
  if (ml < 1e-12) { NN.set(N[v], v * 3); continue; }
  const own = [mx2 / ml, my2 / ml, mz2 / ml];
  let nx = 0, ny = 0, nz = 0;
  for (const f of atWeld.get(wk(v)) ?? atVert[v]) { const o = faceN[f]; if (o.n[0] * own[0] + o.n[1] * own[1] + o.n[2] * own[2] < CREASE) continue; nx += o.n[0] * o.area; ny += o.n[1] * o.area; nz += o.n[2] * o.area; }
  const l = Math.hypot(nx, ny, nz) || 1;
  NN.set([nx / l, ny / l, nz / l], v * 3);
}

for (const tex of root.listTextures()) tex.dispose();
for (const mat of root.listMaterials()) mat.dispose();
prim.dispose();
const toLin = (v) => Math.pow(v / 255, 2.2);
const MATS = {
  body: { rough: 0.85, metal: 0 }, roof: { rough: 0.85, metal: 0 }, seat: { rough: 0.9, metal: 0 }, dark: { rough: 0.85, metal: 0 }
};
const buffer = root.listBuffers()[0];
const smoothNormals = doc.createAccessor(`${name}-nor`).setType("VEC3").setArray(NN).setBuffer(buffer);
for (const [g, tris] of Object.entries(groups)) {
  if (tris.length === 0) continue;
  const material = doc.createMaterial(`cart_${g}`).setBaseColorFactor([...PAL[g].map(toLin), 1]).setRoughnessFactor(MATS[g].rough).setMetallicFactor(MATS[g].metal);
  const indices = doc.createAccessor(`cart_${g}_idx`).setType("SCALAR").setArray(new Uint32Array(tris)).setBuffer(buffer);
  const p = doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", smoothNormals).setIndices(indices).setMaterial(material);
  mesh.addPrimitive(p);
}
const bin = await io.writeBinary(doc);
const hash = createHash("sha256").update(bin).digest("hex");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${name}.${hash.slice(0, 8)}.glb`);
writeFileSync(outFile, bin);
console.log(JSON.stringify({ outFile, bytes: bin.length, groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length / 3])) }));
