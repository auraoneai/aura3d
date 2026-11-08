// Native Aura3D source for the bridged "stylized-car" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./stylized-car.bridge.ts and the GLB.
//
// NATIVE EDITS (kept across regeneration; evidence/2026-11-08/README.md):
//   1. the chrome bumper is hidden by its stable id,
//   2. a native traffic cone stands beside the car,
//   3. the exported wheel_spin clip plays on loop.
import { createAuraApp, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { stylizedCarBackground, stylizedCarCamera, stylizedCarLights, stylizedCarModel, stylizedCarOutput } from "./stylized-car.bridge";

export function createStylizedCarScene(): AuraSceneBuilder {
  const stage = scene(stylizedCarBackground ? { background: stylizedCarBackground } : {})
    .add(stylizedCarModel({ hiddenNodeNames: ["car__bumper"] }).animate({ clip: "wheel_spin", loop: true }))
    .add(primitives.cone({ name: "native-cone", size: [0.5, 0.8, 0.5], material: material.pbr({ color: "#ff7a1a", roughness: 0.6 }) }).position(2.6, 0.4, 1.4))
    .addMany(stylizedCarLights());
  return stylizedCarCamera ? stage.camera(stylizedCarCamera) : stage;
}

export function mountStylizedCar(selector = "#app") {
  return createAuraApp(selector, { scene: createStylizedCarScene(), output: stylizedCarOutput });
}
