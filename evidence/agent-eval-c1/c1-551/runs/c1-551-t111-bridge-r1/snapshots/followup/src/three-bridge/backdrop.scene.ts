// Native Aura3D source for the bridged "backdrop" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./backdrop.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { backdropBackground, backdropCamera, backdropLights, backdropModel, backdropOutput } from "./backdrop.bridge";

export function createBackdropScene(): AuraSceneBuilder {
  const stage = scene(backdropBackground ? { background: backdropBackground } : {})
    .add(backdropModel())
    .addMany(backdropLights());
  return backdropCamera ? stage.camera(backdropCamera) : stage;
}

export function mountBackdrop(selector = "#app") {
  return createAuraApp(selector, { scene: createBackdropScene(), output: backdropOutput });
}
