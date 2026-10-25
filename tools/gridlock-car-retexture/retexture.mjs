#!/usr/bin/env node
// Gridlock Courier hero car: the Meshy GLB bakes glass, interior and reflections into a shard-shaped atlas, and its closed
// shell carries a second layer of inward-facing triangles, so the baked car reads as see-through. This tool splits the same
// mesh by region (body, glass, tyre, rim, lights, underbody) into flat PBR materials and drops the baked textures: the
// geometry, scale and origin are untouched, so wiring, colliders and the shared bake stay valid.
// Usage: node tools/gridlock-car-retexture/retexture.mjs <in.glb> <out.glb>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("usage: retexture.mjs <in.glb> <out.glb>"); process.exit(2); }

import { MATERIALS, classify, paintShade } from "./classify.mjs";

const io = new NodeIO();
const doc = await io.read(inFile);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const src = mesh.listPrimitives()[0];
const pos = src.getAttribute("POSITION").getArray();
const nor = src.getAttribute("NORMAL").getArray();
const idx = src.getIndices().getArray();
const buffer = root.listBuffers()[0];

const groups = Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, []]));
for (let i = 0; i < idx.length; i += 3) {
  let cx = 0, cy = 0, cz = 0, ny = 0, nz = 0;
  for (let k = 0; k < 3; k++) { const j = idx[i + k] * 3; cx += pos[j]; cy += pos[j + 1]; cz += pos[j + 2]; ny += nor[j + 1]; nz += nor[j + 2]; }
  groups[classify(cx / 3, cy / 3, cz / 3, ny / 3, nz / 3)].push(idx[i], idx[i + 1], idx[i + 2]);
}

for (const old of mesh.listPrimitives()) { mesh.removePrimitive(old); old.dispose(); }
const counts = {};
for (const [cls, tris] of Object.entries(groups)) {
  if (!tris.length) continue;
  const remap = new Map();
  const p = [], n = [], ind = [], col = [];
  for (const v of tris) {
    let m = remap.get(v);
    if (m === undefined) { m = remap.size; remap.set(v, m); p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); { const s = cls === "body" || cls === "under" ? paintShade(pos[v * 3 + 1]) : 1; const b = Math.round(s * 255); col.push(b, b, b, 255); } n.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); }
    ind.push(m);
  }
  const spec = MATERIALS[cls];
  const mat = doc.createMaterial(`car-${cls}`).setBaseColorFactor(spec.color).setMetallicFactor(spec.metallic).setRoughnessFactor(spec.roughness).setDoubleSided(true);
  if (spec.emissive) mat.setEmissiveFactor(spec.emissive);
  mesh.addPrimitive(doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(p)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(n)).setBuffer(buffer))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Uint8Array(col)).setNormalized(true).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(remap.size > 65535 ? new Uint32Array(ind) : new Uint16Array(ind)).setBuffer(buffer))
    .setMaterial(mat));
  counts[cls] = tris.length / 3;
}
// The baked mesh is thin overlapping plates with gaps between them, so the interior shows through the paint. A smaller solid core
// (a loft of rings along the car, in body colour, dark glass colour under the cabin) sits behind the plates so gaps show paint.
{
  const SLICES = 40, Z0 = -0.93, Z1 = 0.93, dz = (Z1 - Z0) / (SLICES - 1);
  const rings = [];
  for (let i = 0; i < SLICES; i++) {
    const zc = Z0 + i * dz;
    let wmax = 0, ytop = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const j = idx[t] * 3, z = pos[j + 2];
      if (Math.abs(z - zc) > dz * 0.75) continue;
      const x = Math.abs(pos[j]), y = pos[j + 1];
      if (y < 0.13 && x > 0.3) continue; // wheels and tyres
      if (x > wmax) wmax = x;
      if (y > ytop) ytop = y;
    }
    rings.push({ z: zc, w: Math.max(0.12, wmax * 0.86), top: Math.max(0.2, ytop * 0.94), cabin: zc > -0.2 && zc < 0.42 });
  }
  const mk = (cabin) => ({ p: [], n: [], ind: [], col: [] });
  const parts = { body: mk(), glass: mk() };
  const ringPts = (r) => [[-r.w, 0.1], [-r.w, r.top * 0.62], [-r.w * 0.55, r.top], [r.w * 0.55, r.top], [r.w, r.top * 0.62], [r.w, 0.1]];
  for (let i = 0; i < SLICES - 1; i++) {
    const a = rings[i], b = rings[i + 1], part = parts[a.cabin && b.cabin ? "glass" : "body"];
    const pa = ringPts(a), pb = ringPts(b);
    for (let k = 0; k < pa.length; k++) {
      const k2 = (k + 1) % pa.length;
      const q = [[pa[k][0], pa[k][1], a.z], [pa[k2][0], pa[k2][1], a.z], [pb[k2][0], pb[k2][1], b.z], [pb[k][0], pb[k][1], b.z]];
      const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const base = part.p.length / 3;
      for (const v of q) { part.p.push(v[0], v[1], v[2]); part.n.push(nx, ny, nz); const sh = Math.round(paintShade(v[1]) * 255); part.col.push(sh, sh, sh, 255); }
      part.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  for (const [cls, part] of Object.entries(parts)) {
    if (!part.ind.length) continue;
    const mat = root.listMaterials().find((m) => m.getName() === `car-${cls}`);
    mesh.addPrimitive(doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(part.p)).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(part.n)).setBuffer(buffer))
      .setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Uint8Array(part.col)).setNormalized(true).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(part.ind)).setBuffer(buffer))
      .setMaterial(mat));
    counts[`core-${cls}`] = part.ind.length / 3;
  }
}
for (const m of root.listMaterials()) if (!m.getName().startsWith("car-")) m.dispose();
for (const t of root.listTextures()) t.dispose();
await doc.transform(prune());
const bytes = await io.writeBinary(doc);
writeFileSync(outFile, bytes);
console.log(JSON.stringify({ out: outFile, bytes: bytes.length, triangles: counts, sha256: createHash("sha256").update(readFileSync(outFile)).digest("hex") }));
