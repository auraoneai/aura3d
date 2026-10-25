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
for (const m of root.listMaterials()) if (!m.getName().startsWith("car-")) m.dispose();
for (const t of root.listTextures()) t.dispose();
await doc.transform(prune());
const bytes = await io.writeBinary(doc);
writeFileSync(outFile, bytes);
console.log(JSON.stringify({ out: outFile, bytes: bytes.length, triangles: counts, sha256: createHash("sha256").update(readFileSync(outFile)).digest("hex") }));
