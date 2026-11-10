// Native Aura3D source for the bridged "ruins" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./ruins.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { ruinsBackground, ruinsCamera, ruinsLights, ruinsModel, ruinsOutput } from "./ruins.bridge";

export function createRuinsScene(): AuraSceneBuilder {
  const stage = scene(ruinsBackground ? { background: ruinsBackground } : {})
    .add(ruinsModel())
    .addMany(ruinsLights());
  return ruinsCamera ? stage.camera(ruinsCamera) : stage;
}

export function mountRuins(selector = "#app") {
  return createAuraApp(selector, { scene: createRuinsScene(), output: ruinsOutput });
}
