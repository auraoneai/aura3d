#!/usr/bin/env node
// Teleoperator vehicles: the Meshy GLBs bake the paint, glass and tyres into a shard-shaped atlas (noisy fragments, invented
// emblem-like marks). This tool splits the same mesh by region into flat PBR materials and drops the baked textures and the
// plain cover discs that were added over invented marks. Triangles that straddle a region boundary are subdivided so the
// edges are clean; geometry, scale and origin are unchanged, so wiring, colliders and the shared bake stay valid.
// Usage: node tools/teleop-vehicle-retexture/retexture.mjs <in.glb> <classifier.mjs> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";

const [, , inFile, classifierFile, outFile] = process.argv;
if (!inFile || !classifierFile || !outFile) { console.error("usage: retexture.mjs <in.glb> <classifier.mjs> <out.glb>"); process.exit(2); }
const { classify, MATERIALS } = await import(new URL(classifierFile, `file://${process.cwd()}/`).href);

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prims = mesh.listPrimitives();
const src = prims.reduce((a, b) => (a.getAttribute("POSITION").getCount() >= b.getAttribute("POSITION").getCount() ? a : b));
const pos = src.getAttribute("POSITION").getArray();
const nor = src.getAttribute("NORMAL").getArray();
const idx = src.getIndices().getArray();
const buffer = root.listBuffers()[0];

const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 2);
const COARSE = new Set(["tyre", "rim", "under"]);
const groups = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, { p: [], n: [], ind: [], map: new Map() }]));
const tris = [];
const cls = (v) => classify(v.p[0], v.p[1], v.p[2], v.n[1]);
const mid = (a, b) => {
  const n = [(a.n[0] + b.n[0]) / 2, (a.n[1] + b.n[1]) / 2, (a.n[2] + b.n[2]) / 2];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return { p: [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2], n: [n[0] / l, n[1] / l, n[2] / l] };
};
function emit(a, b, c, depth) {
  const centroid = { p: [(a.p[0] + b.p[0] + c.p[0]) / 3, (a.p[1] + b.p[1] + c.p[1]) / 3, (a.p[2] + b.p[2] + c.p[2]) / 3], n: [(a.n[0] + b.n[0] + c.n[0]) / 3, (a.n[1] + b.n[1] + c.n[1]) / 3, (a.n[2] + b.n[2] + c.n[2]) / 3] };
  const ca = cls(a), cb = cls(b), cc = cls(c), cm = cls(centroid);
  // Wheel and underbody boundaries are barely visible in play: they keep the original triangles to hold the budget.
  const coarse = [ca, cb, cc, cm].some((c) => COARSE.has(c));
  if (depth < MAX_DEPTH && !coarse && !(ca === cb && cb === cc && cc === cm)) {
    const ab = mid(a, b), bc = mid(b, c), ca2 = mid(c, a);
    emit(a, ab, ca2, depth + 1); emit(ab, b, bc, depth + 1); emit(ca2, bc, c, depth + 1); emit(ab, bc, ca2, depth + 1);
    return;
  }
  tris.push([a.p, b.p, c.p, cm]);
}
const vert = (i) => ({ p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n: [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]] });
for (let i = 0; i < idx.length; i += 3) emit(vert(idx[i]), vert(idx[i + 1]), vert(idx[i + 2]), 0);

// The Meshy mesh carries noisy per-vertex normals that a flat colour turns into blotchy shading. Recompute normals from the
// final triangles: area-weighted, averaged across welded positions, but only over faces within CREASE degrees of this face.
const CREASE = Math.cos((Number(process.env.CREASE ?? 55) * Math.PI) / 180);
const key = (p) => `${Math.round(p[0] * 2e4)},${Math.round(p[1] * 2e4)},${Math.round(p[2] * 2e4)}`;
const faceN = tris.map(([a, b, c]) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const area = Math.hypot(n[0], n[1], n[2]);
  return { n: area > 0 ? [n[0] / area, n[1] / area, n[2] / area] : [0, 1, 0], area };
});
const atKey = new Map();
tris.forEach((t, fi) => { for (let k = 0; k < 3; k++) { const kk = key(t[k]); (atKey.get(kk) ?? atKey.set(kk, []).get(kk)).push(fi); } });
tris.forEach((t, fi) => {
  const g = groups[t[3]];
  for (let k = 0; k < 3; k++) {
    const p = t[k];
    const own = faceN[fi].n;
    let nx = 0, ny = 0, nz = 0;
    for (const fj of atKey.get(key(p))) {
      const o = faceN[fj];
      if (o.n[0] * own[0] + o.n[1] * own[1] + o.n[2] * own[2] < CREASE) continue;
      nx += o.n[0] * o.area; ny += o.n[1] * o.area; nz += o.n[2] * o.area;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    const nn = [nx / l, ny / l, nz / l];
    const mk = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}|${nn[0].toFixed(3)},${nn[1].toFixed(3)},${nn[2].toFixed(3)}`;
    let i = g.map.get(mk);
    if (i === undefined) { i = g.p.length / 3; g.map.set(mk, i); g.p.push(p[0], p[1], p[2]); g.n.push(nn[0], nn[1], nn[2]); }
    g.ind.push(i);
  }
});

for (const old of mesh.listPrimitives()) { mesh.removePrimitive(old); old.dispose(); }
const counts = {};
for (const [name, g] of Object.entries(groups)) {
  if (!g.p.length) continue;
  const spec = MATERIALS[name];
  const mat = doc.createMaterial(`veh-${name}`).setBaseColorFactor(spec.color).setMetallicFactor(spec.metallic).setRoughnessFactor(spec.roughness).setDoubleSided(false);
  if (spec.emissive) mat.setEmissiveFactor(spec.emissive);
  const n = g.p.length / 3;
  const ind = n < 65535 ? new Uint16Array(g.ind) : new Uint32Array(g.ind);
  mesh.addPrimitive(doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.p)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.n)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(ind).setBuffer(buffer))
    .setMaterial(mat));
  counts[name] = g.ind.length / 3;
}
await doc.transform(prune());
await io.write(outFile, doc);
console.log(JSON.stringify(counts));
