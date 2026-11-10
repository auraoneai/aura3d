// Native Aura3D source for the bridged "car" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./car.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { carBackground, carCamera, carLights, carModel, carOutput } from "./car.bridge";

export function createCarScene(): AuraSceneBuilder {
  const stage = scene(carBackground ? { background: carBackground } : {})
    .add(carModel())
    .addMany(carLights());
  return carCamera ? stage.camera(carCamera) : stage;
}

export function mountCar(selector = "#app") {
  return createAuraApp(selector, { scene: createCarScene(), output: carOutput });
}
