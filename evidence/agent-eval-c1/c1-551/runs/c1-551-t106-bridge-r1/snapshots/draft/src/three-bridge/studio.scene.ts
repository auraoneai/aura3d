// Native Aura3D source for the bridged "studio" asset: lights, environment, runtime behaviour.
import { createAuraApp, effects, environments, lights, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { studioCamera, studioModel, studioOutput } from "./studio.bridge";

export const KEY_ID = "key-light";
export const KEY_Y = 6.5;
export const KEY_Z = 4.5;

export function createStudioScene(): AuraSceneBuilder {
  return scene({ background: "#c9cacd" })
    .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false, name: "studio-env" }))
    .add(studioModel())
    // one large soft key, camera-left and above; drifts side to side
    .add(
      lights
        .directional({
          name: KEY_ID,
          position: [-4, KEY_Y, KEY_Z],
          target: [0, 0.6, 0],
          intensity: 3.2,
          color: "#fff6ea",
          shadow: { filter: "pcss", mapSize: 2048, softness: 3, lightSize: 6, bias: 0.001, normalBias: 0.02, intensity: 0.8 }
        })
        .runtime({ id: KEY_ID, mutable: true })
    )
    // dimmer fill from the opposite side, no shadow
    .add(lights.directional({ name: "fill-light", position: [6, 3.5, 5], target: [0, 0.6, 0], intensity: 0.9, color: "#dfe9ff" }))
    // rim light from behind
    .add(lights.directional({ name: "rim-light", position: [1.5, 4, -6], target: [0, 0.8, 0], intensity: 2.2, color: "#ffffff" }))
    .add(effects.ambientOcclusion({ radius: 0.6, intensity: 0.8 }))
    .camera(studioCamera);
}

export function mountStudio(selector = "#app") {
  return createAuraApp(selector, { scene: createStudioScene(), output: studioOutput });
}
