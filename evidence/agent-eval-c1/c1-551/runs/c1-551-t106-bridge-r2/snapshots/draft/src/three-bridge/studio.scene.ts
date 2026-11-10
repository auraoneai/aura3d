// Native Aura3D source for the bridged "studio" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./studio.bridge.ts and the GLB.
import { createAuraApp, environments, lights, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { studioCamera, studioModel, studioOutput } from "./studio.bridge";

export const KEY_BASE = [-3.2, 4.6, 4.2] as const;
export const KEY_TARGET = [0, 0.4, 0] as const;

export function createStudioScene(): AuraSceneBuilder {
  return scene({ background: "#b9bbc0" })
    // Reflection / image-based light source for the metal and glass.
    .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
    .add(studioModel({ castShadow: true, receiveShadow: true }).runtime({ id: "studio" }))
    // One large soft key (drifts side to side), a dimmer fill from the opposite side, a rim from behind.
    .add(lights.key({
      name: "key", position: [...KEY_BASE], target: [...KEY_TARGET], intensity: 3.2, color: "#fff4e6",
      shadow: { filter: "pcss", softness: 1.6, lightSize: 1.2, mapSize: 2048, intensity: 0.8, bias: 0.002 }
    }).runtime({ id: "key", mutable: true }))
    .add(lights.directional({ name: "fill", position: [5, 2.6, 4], target: [0, 0.5, 0], intensity: 0.9, color: "#dbe6ff" }))
    .add(lights.directional({ name: "rim", position: [1.5, 3.2, -5.5], target: [0, 0.6, 0], intensity: 2.2, color: "#ffffff" }))
    .camera(studioCamera);
}

export function mountStudio(selector = "#app") {
  return createAuraApp(selector, { scene: createStudioScene(), output: studioOutput });
}
