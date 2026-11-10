// Native Aura3D source for the bridged "cosmos" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./cosmos.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { cosmosBackground, cosmosCamera, cosmosLights, cosmosModel, cosmosOutput } from "./cosmos.bridge";

export function createCosmosScene(): AuraSceneBuilder {
  const stage = scene(cosmosBackground ? { background: cosmosBackground } : {})
    .add(cosmosModel())
    .addMany(cosmosLights());
  return cosmosCamera ? stage.camera(cosmosCamera) : stage;
}

export function mountCosmos(selector = "#app") {
  return createAuraApp(selector, { scene: createCosmosScene(), output: cosmosOutput });
}
