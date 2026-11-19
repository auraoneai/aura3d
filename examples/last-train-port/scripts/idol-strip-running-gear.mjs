#!/usr/bin/env node
// Removes the Idol tram's baked (frozen) bogies and wheels so procedural bogies with spinning wheels can sit in their place.
// Deletes every triangle whose centroid lies below `--below` metres inside the bogie span `--z a,b` (the cowcatcher beyond
// the span is kept). Rewrites the GLB in place.
//   node examples/last-train-port/scripts/idol-strip-running-gear.mjs <glb> [--below 0.6] [--z -4.6,4.15] [--outer 1.0 --outerBelow 0.9]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";

const args = process.argv.slice(2);
const file = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const below = Number(opt("below", "0.6"));
const [z0, z1] = opt("z", "-4.6,4.15").split(",").map(Number);
// Wheel tops that poke above the skirt line on the outside of the body.
const outer = Number(opt("outer", "9")), outerBelow = Number(opt("outerBelow", "0"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
let dropped = 0, total = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const M = node.getWorldMatrix();
  const w = (v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices(), pos = prim.getAttribute("POSITION");
    if (!idx || !pos) continue;
    const keep = [];
    for (let t = 0; t < idx.getCount(); t += 3) {
      total++;
      const P = [0, 1, 2].map((k) => w(pos.getElement(idx.getScalar(t + k), [])));
      const c = [0, 1, 2].map((i) => (P[0][i] + P[1][i] + P[2][i]) / 3);
      const inSpan = c[2] >= z0 && c[2] <= z1;
      if (inSpan && (c[1] < below || (Math.abs(c[0]) > outer && c[1] < outerBelow))) { dropped++; continue; }
      keep.push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
    }
    idx.setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
  }
}
await doc.transform(prune());
const asset = doc.getRoot().getAsset();
asset.extras = { ...(asset.extras ?? {}), aura3d: { ...(asset.extras?.aura3d ?? {}), lamplightRunningGearStripped: { below, z: [z0, z1], outer, outerBelow, dropped } } };
await io.write(file, doc);
console.log(JSON.stringify({ file, total, dropped }));
