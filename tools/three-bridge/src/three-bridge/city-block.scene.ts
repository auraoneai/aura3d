// Native Aura3D source for the bridged "city-block" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./city-block.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { cityBlockBackground, cityBlockCamera, cityBlockLights, cityBlockModel, cityBlockOutput } from "./city-block.bridge";

export function createCityBlockScene(): AuraSceneBuilder {
  const stage = scene(cityBlockBackground ? { background: cityBlockBackground } : {})
    .add(cityBlockModel())
    .addMany(cityBlockLights());
  return cityBlockCamera ? stage.camera(cityBlockCamera) : stage;
}

export function mountCityBlock(selector = "#app") {
  return createAuraApp(selector, { scene: createCityBlockScene(), output: cityBlockOutput });
}
