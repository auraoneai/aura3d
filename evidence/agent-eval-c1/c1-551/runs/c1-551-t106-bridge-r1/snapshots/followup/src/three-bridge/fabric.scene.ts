// Native Aura3D source for the bridged "fabric" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./fabric.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { fabricBackground, fabricCamera, fabricLights, fabricModel, fabricOutput } from "./fabric.bridge";

export function createFabricScene(): AuraSceneBuilder {
  const stage = scene(fabricBackground ? { background: fabricBackground } : {})
    .add(fabricModel())
    .addMany(fabricLights());
  return fabricCamera ? stage.camera(fabricCamera) : stage;
}

export function mountFabric(selector = "#app") {
  return createAuraApp(selector, { scene: createFabricScene(), output: fabricOutput });
}
