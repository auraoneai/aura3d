#!/usr/bin/env node
// GU47 phase 7 (4.7.6) Task B: bake the static set dressing that used to be one model() node per placement into a few
// app-local GLBs, one primitive per material, so the island costs a handful of draws per pass instead of 95 meshes.
// Presentation only: each placement keeps the exact transform the stage's model() node had. A default ("normalized")
// model node draws T(position) R_y(yaw) S(scale * 1.55 / maxExtent) T(-centreX, -minY, -centreZ) over the source GLB's
// scene (createModelMatrixV2 in packages/engine/src/agent-api/compiler/sceneGraph.ts); the bake writes exactly that per
// placement, and the stage draws the baked GLB with scaleMode "world" (no second normalisation). Geometry, UVs,
// materials and textures are the source asset's, unchanged.
//
//   node apps/showcase-slingshot-siege/tools/bake-static-sets.mjs
//
// Writes apps/showcase-slingshot-siege/src/assets/models/sling_{islandTrees,rocksA,rocksB}.glb.
// The placements are imported from ../src/art/staticSets.placements.json, the same file the stage reads.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join as joinPrims, mergeDocuments, prune } from "@gltf-transform/functions";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const repo = join(app, "..", "..");
const sets = JSON.parse(readFileSync(join(app, "src/art/staticSets.placements.json"), "utf8"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** AURA_NORMALIZED_MODEL_MAX_DIMENSION (packages/engine/src/agent-api/SceneGroundingUtils.ts). */
const NORMALIZED_MAX_DIMENSION = 1.55;
const quatY = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];

for (const [key, set] of Object.entries(sets.sets)) {
  const out = new Document();
  const buffer = out.createBuffer("baked");
  const scene = out.createScene(key);
  out.getRoot().setDefaultScene(scene);
  for (const [i, pl] of set.placements.entries()) {
    const src = await io.read(join(repo, sets.sources[pl.source]));
    const map = mergeDocuments(out, src);
    const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
    const merged = map.get(srcScene);
    const b = getBounds(srcScene);
    const extent = [0, 1, 2].map((k) => Math.max(0.001, b.max[k] - b.min[k]));
    const fit = NORMALIZED_MAX_DIMENSION / Math.max(...extent);
    const s = (typeof pl.scale === "number" ? [pl.scale, pl.scale, pl.scale] : pl.scale).map((v) => v * fit);
    const wrap = out.createNode(`${key}-${i}`).setTranslation(pl.position).setRotation(quatY(pl.yaw ?? 0)).setScale(s);
    const offset = out.createNode(`${key}-${i}-normalize`).setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
    for (const child of merged.listChildren()) { merged.removeChild(child); offset.addChild(child); }
    wrap.addChild(offset);
    scene.addChild(wrap);
    merged.dispose();
  }
  for (const accessor of out.getRoot().listAccessors()) accessor.setBuffer(buffer);
  for (const b of out.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  await out.transform(dedup(), flatten(), joinPrims({ keepMeshes: false, keepNamed: false }), prune(), dedup());
  const meshes = out.getRoot().listMeshes();
  const prims = meshes.reduce((n, m) => n + m.listPrimitives().length, 0);
  const file = join(app, "src/assets/models", `${key}.glb`);
  await io.write(file, out);
  console.log(`${key}: ${set.placements.length} placements -> ${meshes.length} meshes, ${prims} primitives, ${out.getRoot().listMaterials().length} materials -> ${file}`);
}
