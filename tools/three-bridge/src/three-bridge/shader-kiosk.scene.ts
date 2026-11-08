// Native Aura3D source for the bridged "shader-kiosk" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./shader-kiosk.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { shaderKioskBackground, shaderKioskCamera, shaderKioskLights, shaderKioskModel, shaderKioskOutput } from "./shader-kiosk.bridge";

export function createShaderKioskScene(): AuraSceneBuilder {
  const stage = scene(shaderKioskBackground ? { background: shaderKioskBackground } : {})
    .add(shaderKioskModel())
    .addMany(shaderKioskLights());
  return shaderKioskCamera ? stage.camera(shaderKioskCamera) : stage;
}

export function mountShaderKiosk(selector = "#app") {
  return createAuraApp(selector, { scene: createShaderKioskScene(), output: shaderKioskOutput });
}
