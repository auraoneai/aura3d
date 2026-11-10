// Native Aura3D source for the bridged "showroom" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./showroom.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { showroomBackground, showroomCamera, showroomLights, showroomModel, showroomOutput } from "./showroom.bridge";

export function createShowroomScene(): AuraSceneBuilder {
  const stage = scene(showroomBackground ? { background: showroomBackground } : {})
    .add(showroomModel())
    .addMany(showroomLights());
  return showroomCamera ? stage.camera(showroomCamera) : stage;
}

export function mountShowroom(selector = "#app") {
  return createAuraApp(selector, { scene: createShowroomScene(), output: showroomOutput });
}
