// Native Aura3D source for the bridged "studio" asset: lights, environment, runtime behaviour.
import { createAuraApp, effects, environments, lights, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { studioCamera, studioModel, studioOutput } from "./studio.bridge";
import { glassModel } from "./glass.bridge";
import { metalModel } from "./metal.bridge";
import { fabricModel } from "./fabric.bridge";

export const RADIUS = 0.8;
export const SPACING = 2.1;

export const KEY_ID = "key-light";
export const KEY_Y = 6.5;
export const KEY_Z = 4.5;

export function createStudioScene(): AuraSceneBuilder {
  return scene({ background: "#c9cacd" })
    .add(environments.capture({ position: [0, 1.6, 2.5], resolution: 256, update: "once", include: "all", intensity: 0.55, background: false, name: "studio-env" }))
    // black flags either side give the metal and glass dark edges to reflect against the bright softboxes
    .add(primitives.plane({ name: "flag-left", size: [4, 1, 6], material: material.pbr({ color: "#050505", roughness: 1 }), castShadow: false, receiveShadow: false }).position(-5.2, 2.2, 1.5).rotate(0, 0, -Math.PI / 2))
    .add(primitives.plane({ name: "flag-right", size: [4, 1, 6], material: material.pbr({ color: "#050505", roughness: 1 }), castShadow: false, receiveShadow: false }).position(5.2, 2.2, 1.5).rotate(0, 0, Math.PI / 2))
    // emissive softbox panels (seen only in reflections: they sit outside the camera frame)
    .add(primitives.plane({ name: "softbox-left", size: [3.2, 1, 3], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 14 }), castShadow: false, receiveShadow: false }).position(-4.6, 3.2, 3).rotate(0, 0, -Math.PI / 2))
    .add(primitives.plane({ name: "softbox-right", size: [3.2, 1, 3], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 7 }), castShadow: false, receiveShadow: false }).position(4.6, 3.2, 3).rotate(0, 0, Math.PI / 2))
    .add(primitives.plane({ name: "softbox-top", size: [5, 1, 2], material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 9 }), castShadow: false, receiveShadow: false }).position(0, 6.5, 1.5).rotate(Math.PI, 0, 0))
    .add(studioModel())
    // spheres are separate models so each can spin about its own vertical axis
    .add(glassModel({ receiveShadow: true }).position(-SPACING, RADIUS, 0).runtime({ id: "glass", mutable: true }))
    .add(metalModel({ receiveShadow: true }).position(0, RADIUS, 0).runtime({ id: "metal", mutable: true }))
    .add(fabricModel({ receiveShadow: true }).position(SPACING, RADIUS, 0).runtime({ id: "fabric", mutable: true }))
    // one large soft key, camera-left and above; drifts side to side
    .add(
      lights
        .directional({
          name: KEY_ID,
          position: [-4, KEY_Y, KEY_Z],
          target: [0, 0.6, 0],
          intensity: 2.2,
          color: "#fff6ea",
          shadow: { filter: "pcss", mapSize: 2048, softness: 2, lightSize: 4, bias: 0.001, normalBias: 0.02, intensity: 1 }
        })
        .runtime({ id: KEY_ID, mutable: true })
    )
    // dimmer fill from the opposite side, no shadow
    .add(lights.directional({ name: "fill-light", position: [6, 3.5, 5], target: [0, 0.6, 0], intensity: 0.6, color: "#dfe9ff" }))
    // rim light from behind
    .add(lights.directional({ name: "rim-light", position: [1.5, 4, -6], target: [0, 0.8, 0], intensity: 2.2, color: "#ffffff" }))
    .add(effects.ambientOcclusion({ radius: 0.6, intensity: 0.8 }))
    .camera(studioCamera);
}

export function mountStudio(selector = "#app") {
  return createAuraApp(selector, { scene: createStudioScene(), output: studioOutput });
}
