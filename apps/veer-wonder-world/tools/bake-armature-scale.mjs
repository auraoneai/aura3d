#!/usr/bin/env node
// Bakes a uniform scale on a Meshy rig's "Armature" node into the skeleton so `aura3d assets repair-skin
// --refit-skeleton` (which refuses scaled nodes) can run. Joint translations and translation keyframes are
// multiplied by the scale, the Armature scale becomes 1, and every inverse bind matrix is left-multiplied by
// S(scale). The skinned result is unchanged: J_new x IBM_new = (J_old x S(1/s)) x (S(s) x IBM_old).
//
//   node tools/bake-armature-scale.mjs <in.glb> <out.glb>
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const req = createRequire(join(repo, "package.json"));
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: bake-armature-scale.mjs <in.glb> <out.glb>");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const skins = root.listSkins();
if (skins.length === 0) throw new Error("no skin");

const scaled = root.listNodes().filter((n) => n.getScale().some((v) => Math.abs(v - 1) > 1e-6));
if (scaled.length !== 1) throw new Error(`expected exactly one scaled node, found ${scaled.length}: ${scaled.map((n) => n.getName()).join(", ")}`);
const armature = scaled[0];
const [sx, sy, sz] = armature.getScale();
if (Math.abs(sx - sy) > 1e-6 || Math.abs(sx - sz) > 1e-6) throw new Error("non-uniform armature scale is not supported");
const s = sx;

// Every node below the armature lives in its scaled space.
const below = new Set();
const collect = (n) => { for (const c of n.listChildren()) { below.add(c); collect(c); } };
collect(armature);
for (const n of below) {
  const [x, y, z] = n.getTranslation();
  n.setTranslation([x * s, y * s, z * s]);
}
armature.setScale([1, 1, 1]);

for (const skin of skins) {
  const ibm = skin.getInverseBindMatrices();
  if (!ibm) continue;
  const array = ibm.getArray().slice();
  for (let i = 0; i < array.length; i += 1) if (i % 16 % 4 < 3) array[i] *= s; // rows 0-2 of each column-major 4x4
  ibm.setArray(array);
}

const scaledAccessors = new Set();
for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    if (channel.getTargetPath() !== "translation" || !below.has(channel.getTargetNode())) continue;
    const out = channel.getSampler()?.getOutput();
    if (!out || scaledAccessors.has(out)) continue;
    scaledAccessors.add(out);
    const values = out.getArray().slice();
    for (let i = 0; i < values.length; i += 1) values[i] *= s;
    out.setArray(values);
  }
}

await io.write(output, doc);
console.log(JSON.stringify({ ok: true, armature: armature.getName(), scale: s, nodes: below.size, translationAccessors: scaledAccessors.size, output }));
