// Native Aura3D source for the bridged "canyon" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./canyon.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { canyonBackground, canyonCamera, canyonLights, canyonModel, canyonOutput } from "./canyon.bridge";

export function createCanyonScene(): AuraSceneBuilder {
  const stage = scene(canyonBackground ? { background: canyonBackground } : {})
    .add(canyonModel())
    .addMany(canyonLights());
  return canyonCamera ? stage.camera(canyonCamera) : stage;
}

export function mountCanyon(selector = "#app") {
  return createAuraApp(selector, { scene: createCanyonScene(), output: canyonOutput });
}
