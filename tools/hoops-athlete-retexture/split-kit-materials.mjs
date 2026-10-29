#!/usr/bin/env node
// Splits a palette athlete (one primitive, one material, a NEAREST 80x3 palette strip) into three primitives, each with its
// own named material that still samples the same palette texture, so a route can retint the team kit with
// `materialOverrides: [{ target: /-kit$/, color, colorMode: "replace", replaceTextures: true }]`:
//   -kit     jersey + socks (cells 2 and 5)
//   -shorts  shorts (cell 3)
//   -body    everything else, textured as before: hair, skin, face detail, kicks
// Every extra primitive draws in several passes (forward, depth, contact depth, shadow cascades), so the split is kept to
// the regions a team kit needs. Geometry, skin weights, skeleton and clips are copied unchanged (vertices are only
// duplicated where two regions meet). Prints the position-accessor hash before and after.
// Usage: node tools/hoops-athlete-retexture/split-kit-materials.mjs <in.glb> <out-dir> <name>
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";

const [, , inFile, outDir, name] = process.argv;
if (!inFile || !outDir || !name) { console.error("usage: split-kit-materials.mjs <in.glb> <out-dir> <name>"); process.exit(2); }

const W = 80, H = 3, CELL = 10;
const GROUP_OF_CELL = ["body", "body", "kit", "shorts", "body", "kit", "body", "body"];
// a triangle touching a face-detail texel (brows 1:1, eye whites 7:1, pupils 7:2) stays in the textured body
const FACE_TEXELS = new Set(["1:1", "7:1", "7:2"]);
const ORDER = ["body", "kit", "shorts"];

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const mesh = root.listMeshes()[0];
const prims = mesh.listPrimitives();
if (prims.length !== 1) throw new Error(`expected one primitive, found ${prims.length}`);
const prim = prims[0];
const baseMat = prim.getMaterial();
const uv = prim.getAttribute("TEXCOORD_0");
const idx = prim.getIndices();
const semantics = prim.listSemantics();
const attrs = Object.fromEntries(semantics.map((s) => [s, prim.getAttribute(s)]));

const posHash = (accs) => {
  const h = createHash("sha256");
  for (const a of accs) h.update(Buffer.from(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength));
  return h.digest("hex").slice(0, 16);
};
const texel = (i) => {
  const t = uv.getElement(i, []);
  const x = Math.min(W - 1, Math.max(0, Math.floor(t[0] * W)));
  const y = Math.min(H - 1, Math.max(0, Math.floor(t[1] * H)));
  return [Math.floor(x / CELL), y];
};

// classify triangles
const triCount = idx.getCount() / 3;
const groupTris = new Map(ORDER.map((g) => [g, []]));
let crossRegion = 0;
for (let t = 0; t < triCount; t += 1) {
  const v = [idx.getScalar(3 * t), idx.getScalar(3 * t + 1), idx.getScalar(3 * t + 2)];
  const tx = v.map(texel);
  let group;
  if (tx.some(([c, r]) => FACE_TEXELS.has(`${c}:${r}`))) group = "body";
  else {
    const votes = new Map();
    for (const [c] of tx) votes.set(GROUP_OF_CELL[c], (votes.get(GROUP_OF_CELL[c]) ?? 0) + 1);
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    if (ranked.length > 1) crossRegion += 1;
    group = ranked[0][0];
  }
  groupTris.get(group).push(v);
}

// one compact primitive per group
const report = {};
const newPositions = [];
for (const g of ORDER) {
  const tris = groupTris.get(g);
  if (tris.length === 0) continue;
  const remap = new Map();
  const order = [];
  const indices = new Uint32Array(tris.length * 3);
  tris.flat().forEach((old, k) => {
    let n = remap.get(old);
    if (n === undefined) { n = order.length; remap.set(old, n); order.push(old); }
    indices[k] = n;
  });
  const p = doc.createPrimitive().setMode(prim.getMode());
  for (const s of semantics) {
    const src = attrs[s];
    const size = src.getElementSize();
    const Arr = src.getArray().constructor;
    const out = new Arr(order.length * size);
    const el = [];
    order.forEach((old, k) => { src.getElement(old, el); for (let c = 0; c < size; c += 1) out[k * size + c] = el[c]; });
    const acc = doc.createAccessor().setType(src.getType()).setArray(out).setBuffer(buffer).setNormalized(src.getNormalized());
    p.setAttribute(s, acc);
    if (s === "POSITION") newPositions.push(acc);
  }
  p.setIndices(doc.createAccessor().setType("SCALAR").setArray(order.length > 65535 ? indices : Uint16Array.from(indices)).setBuffer(buffer));
  const m = baseMat.clone().setName(`${name}-${g}`);
  p.setMaterial(m);
  mesh.addPrimitive(p);
  report[g] = { triangles: tris.length, vertices: order.length };
}
const beforeHash = posHash([attrs.POSITION]);
mesh.removePrimitive(prim);
prim.dispose();
baseMat.dispose();
for (const s of semantics) if (attrs[s].listParents().length <= 1) attrs[s].dispose();
idx.dispose();

// the triangle set is unchanged: every original triangle lands in exactly one group, with its original vertex positions
const total = Object.values(report).reduce((n, r) => n + r.triangles, 0);
if (total !== triCount) throw new Error(`triangle count changed ${triCount} -> ${total}`);

mkdirSync(outDir, { recursive: true });
const glb = await io.writeBinary(doc);
const hash = createHash("sha256").update(glb).digest("hex");
const file = path.join(outDir, `${name}.${hash.slice(0, 8)}.glb`);
writeFileSync(file, glb);
console.log(JSON.stringify({ file, sha256: hash, sizeBytes: glb.length, triangles: triCount, crossRegionTriangles: crossRegion, groups: report, positionHashBefore: beforeHash, positionHashAfterGroups: posHash(newPositions), materials: root.listMaterials().map((m) => m.getName()) }, null, 2));
