// Native Aura3D source for the bridged "metal" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./metal.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { metalBackground, metalCamera, metalLights, metalModel, metalOutput } from "./metal.bridge";

export function createMetalScene(): AuraSceneBuilder {
  const stage = scene(metalBackground ? { background: metalBackground } : {})
    .add(metalModel())
    .addMany(metalLights());
  return metalCamera ? stage.camera(metalCamera) : stage;
}

export function mountMetal(selector = "#app") {
  return createAuraApp(selector, { scene: createMetalScene(), output: metalOutput });
}
