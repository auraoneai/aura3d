// Native Aura3D source for the bridged "ruin" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./ruin.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { ruinBackground, ruinCamera, ruinLights, ruinModel, ruinOutput } from "./ruin.bridge";

export function createRuinScene(): AuraSceneBuilder {
  const stage = scene(ruinBackground ? { background: ruinBackground } : {})
    .add(ruinModel())
    .addMany(ruinLights());
  return ruinCamera ? stage.camera(ruinCamera) : stage;
}

export function mountRuin(selector = "#app") {
  return createAuraApp(selector, { scene: createRuinScene(), output: ruinOutput });
}
