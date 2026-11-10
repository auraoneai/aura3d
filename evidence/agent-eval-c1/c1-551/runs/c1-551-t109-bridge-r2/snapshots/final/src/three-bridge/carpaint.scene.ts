// Native Aura3D source for the bridged "carpaint" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./carpaint.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { carpaintBackground, carpaintCamera, carpaintLights, carpaintModel, carpaintOutput } from "./carpaint.bridge";

export function createCarpaintScene(): AuraSceneBuilder {
  const stage = scene(carpaintBackground ? { background: carpaintBackground } : {})
    .add(carpaintModel())
    .addMany(carpaintLights());
  return carpaintCamera ? stage.camera(carpaintCamera) : stage;
}

export function mountCarpaint(selector = "#app") {
  return createAuraApp(selector, { scene: createCarpaintScene(), output: carpaintOutput });
}
