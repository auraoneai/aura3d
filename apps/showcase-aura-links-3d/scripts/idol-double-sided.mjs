#!/usr/bin/env node
// Marks the materials of the rigged Idol GLBs (golfers, caddie) double-sided and opaque, in place. The skinned trousers and
// sleeves fold through themselves at the hips / armpits in the swing (Idol skin weights bridge the legs), and with
// single-sided culling those folds showed as see-through patches of the turf behind. Geometry and textures are untouched.
// Run: node apps/showcase-aura-links-3d/scripts/idol-double-sided.mjs   (then re-admit each with tools/idol/admit.sh)
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RIGGED = ["linksIdolGolferBlue", "linksIdolGolferRed", "linksIdolGolferWhite", "linksIdolGolferNavy", "linksIdolGolferOrange", "linksIdolCaddie"];
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
for (const key of RIGGED) {
  const file = resolve(appDir, `assets/idol/${key}.glb`);
  const doc = await io.read(file);
  for (const m of doc.getRoot().listMaterials()) { m.setDoubleSided(true); m.setAlphaMode("OPAQUE"); }
  await io.write(file, doc);
  console.log(`${key}: double-sided opaque`);
}
