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
const idx = idxAcc ? Array.from(idxAcc.getArray()) : Array.from({ length: n }, (_, i) => i);
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

for (const tex of root.listTextures()) tex.dispose();
for (const mat of root.listMaterials()) mat.dispose();
prim.dispose();
const toLin = (v) => Math.pow(v / 255, 2.2);
const MATS = {
  body: { rough: 0.55, metal: 0 }, roof: { rough: 0.6, metal: 0 }, seat: { rough: 0.8, metal: 0 }, dark: { rough: 0.7, metal: 0.1 }
};
const buffer = root.listBuffers()[0];
for (const [g, tris] of Object.entries(groups)) {
  if (tris.length === 0) continue;
  const material = doc.createMaterial(`cart_${g}`).setBaseColorFactor([...PAL[g].map(toLin), 1]).setRoughnessFactor(MATS[g].rough).setMetallicFactor(MATS[g].metal);
  const indices = doc.createAccessor(`cart_${g}_idx`).setType("SCALAR").setArray(new Uint32Array(tris)).setBuffer(buffer);
  const p = doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nor).setIndices(indices).setMaterial(material);
  mesh.addPrimitive(p);
}
const bin = await io.writeBinary(doc);
const hash = createHash("sha256").update(bin).digest("hex");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${name}.${hash.slice(0, 8)}.glb`);
writeFileSync(outFile, bin);
console.log(JSON.stringify({ outFile, bytes: bin.length, groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length / 3])) }));
