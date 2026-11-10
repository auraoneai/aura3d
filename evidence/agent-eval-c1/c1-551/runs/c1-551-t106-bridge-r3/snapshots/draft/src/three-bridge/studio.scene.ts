// Native Aura3D source for the bridged "studio" asset (geometry and materials come from recipes/studio.mjs).
import { camera, createAuraApp, environments, lights, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { studioModel, studioOutput } from "./studio.bridge";

export const KEY_Y = 5.2;
export const KEY_Z = 4.5;

export function createStudioScene(): AuraSceneBuilder {
  return scene({ background: "#c9cacd" })
    .add(
      studioModel({
        castShadow: true,
        receiveShadow: true,
        materialOverrides: [
          { target: "metal", material: { anisotropy: 0.85, anisotropyRotation: 0, roughness: 0.34, metallic: 1, envMapIntensity: 1.3 } },
          { target: "glass", material: { envMapIntensity: 1.8 } }
        ]
      })
    )
    .add(environments.studio({ preset: "softbox", intensity: 0.9, background: false }))
    // Key: large soft light, drifts side to side (see main.ts).
    .add(
      lights
        .directional({
          name: "key",
          position: [-3, KEY_Y, KEY_Z],
          target: [0, 0.4, 0],
          intensity: 2.6,
          color: "#fff4e6",
          shadow: { filter: "pcss", softness: 3, lightSize: 6, mapSize: 2048, bias: 0.0005, normalBias: 0.02 }
        })
        .runtime({ id: "key", mutable: true })
    )
    // Fill: dimmer, opposite side, no shadow.
    .add(lights.directional({ name: "fill", position: [6, 3, 5], target: [0, 0.6, 0], intensity: 0.7, color: "#dbe6ff" }))
    // Rim: from behind and above.
    .add(lights.directional({ name: "rim", position: [0, 4, -6], target: [0, 0.8, 0], intensity: 1.8, color: "#ffffff" }))
    .camera(camera.perspective({ position: [0, 2.5, 8], target: [0, 0.75, 0], fov: 30 }));
}

export function mountStudio(selector = "#app") {
  return createAuraApp(selector, { scene: createStudioScene(), output: studioOutput });
}
