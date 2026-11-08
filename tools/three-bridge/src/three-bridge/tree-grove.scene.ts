// Native Aura3D source for the bridged "tree-grove" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./tree-grove.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { treeGroveBackground, treeGroveCamera, treeGroveLights, treeGroveModel, treeGroveOutput } from "./tree-grove.bridge";

export function createTreeGroveScene(): AuraSceneBuilder {
  const stage = scene(treeGroveBackground ? { background: treeGroveBackground } : {})
    .add(treeGroveModel())
    .addMany(treeGroveLights());
  return treeGroveCamera ? stage.camera(treeGroveCamera) : stage;
}

export function mountTreeGrove(selector = "#app") {
  return createAuraApp(selector, { scene: createTreeGroveScene(), output: treeGroveOutput });
}
