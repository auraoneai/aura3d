#!/usr/bin/env node
// Cuts every triangle lying entirely above a height (scene metres, after the normaliser's wrapper) out of an Idol GLB and
// prunes the unused data. Used for the umpire high chair, whose baked sun canopy sits 0.6 m above the seat: a seated
// official's head would go through it, so the canopy (and the top of its pole) is removed. Overwrites the GLB in place.
//
//   node examples/aura-slam/tools/idol-clip-above.mjs <file.glb> <heightMetres>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, prune } from "@gltf-transform/functions";

const [file, cutRaw] = process.argv.slice(2);
const cut = Number(cutRaw);
if (!file || !Number.isFinite(cut)) throw new Error("usage: idol-clip-above.mjs <file.glb> <heightMetres>");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
let removed = 0, kept = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    if (!pos || !idx) continue;
    const y = new Float32Array(pos.getCount());
    const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); y[i] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]; }
    const src = idx.getArray();
    const out = [];
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      if (Math.min(y[a], y[b], y[c]) > cut) { removed++; continue; }
      out.push(a, b, c); kept++;
    }
    idx.setArray(pos.getCount() > 65535 ? new Uint32Array(out) : new Uint16Array(out));
    compactPrimitive(prim); // drop the now-unreferenced vertices (accessor bounds shrink with them)
  }
}
await doc.transform(prune());
await io.write(file, doc);
console.log(`${file}: removed ${removed} triangles above ${cut} m, kept ${kept}`);
