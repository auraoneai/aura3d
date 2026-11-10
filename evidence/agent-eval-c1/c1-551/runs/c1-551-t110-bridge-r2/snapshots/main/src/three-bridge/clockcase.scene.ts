// Native Aura3D source for the bridged "clockcase" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./clockcase.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { clockcaseBackground, clockcaseCamera, clockcaseLights, clockcaseModel, clockcaseOutput } from "./clockcase.bridge";

export function createClockcaseScene(): AuraSceneBuilder {
  const stage = scene(clockcaseBackground ? { background: clockcaseBackground } : {})
    .add(clockcaseModel())
    .addMany(clockcaseLights());
  return clockcaseCamera ? stage.camera(clockcaseCamera) : stage;
}

export function mountClockcase(selector = "#app") {
  return createAuraApp(selector, { scene: createClockcaseScene(), output: clockcaseOutput });
}
