// Native Aura3D source for the bridged "glass" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./glass.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { glassBackground, glassCamera, glassLights, glassModel, glassOutput } from "./glass.bridge";

export function createGlassScene(): AuraSceneBuilder {
  const stage = scene(glassBackground ? { background: glassBackground } : {})
    .add(glassModel())
    .addMany(glassLights());
  return glassCamera ? stage.camera(glassCamera) : stage;
}

export function mountGlass(selector = "#app") {
  return createAuraApp(selector, { scene: createGlassScene(), output: glassOutput });
}
