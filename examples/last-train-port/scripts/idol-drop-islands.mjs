#!/usr/bin/env node
// Drops small disconnected fragments (Idol sometimes leaves a floating sliver beside a building) from an Idol GLB in place.
//   node examples/last-train-port/scripts/idol-drop-islands.mjs <glb> [--min 0.02]   (components under min x triangles go)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld } from "@gltf-transform/functions";

const args = process.argv.slice(2);
const file = args[0];
const i = args.indexOf("--min");
const minFrac = i >= 0 ? Number(args[i + 1]) : 0.02;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const report = [];
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const idx = prim.getIndices(), pos = prim.getAttribute("POSITION");
  if (!idx || !pos) continue;
  // Union-find over vertices that share a position (UV seams split vertices but not surfaces).
  const n = pos.getCount(), parent = new Int32Array(n).map((_, k) => k);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const byPos = new Map(), v = [0, 0, 0];
  for (let k = 0; k < n; k++) { pos.getElement(k, v); const key = `${v[0].toFixed(5)},${v[1].toFixed(5)},${v[2].toFixed(5)}`; const o = byPos.get(key); if (o === undefined) byPos.set(key, k); else unite(k, o); }
  const tri = idx.getCount() / 3;
  for (let t = 0; t < tri; t++) { const a = idx.getScalar(t * 3), b = idx.getScalar(t * 3 + 1), c = idx.getScalar(t * 3 + 2); unite(a, b); unite(b, c); }
  const count = new Map();
  for (let t = 0; t < tri; t++) { const r = find(idx.getScalar(t * 3)); count.set(r, (count.get(r) ?? 0) + 1); }
  const keep = [];
  let dropped = 0;
  for (let t = 0; t < tri; t++) {
    const r = find(idx.getScalar(t * 3));
    if (count.get(r) / tri < minFrac) { dropped++; continue; }
    keep.push(idx.getScalar(t * 3), idx.getScalar(t * 3 + 1), idx.getScalar(t * 3 + 2));
  }
  const Arr = n > 65535 ? Uint32Array : Uint16Array;
  idx.setArray(new Arr(keep));
  report.push({ components: count.size, triangles: tri, dropped });
}
await doc.transform(weld({ overwrite: false }));
await io.write(file, doc);
console.log(JSON.stringify({ file, report }));
