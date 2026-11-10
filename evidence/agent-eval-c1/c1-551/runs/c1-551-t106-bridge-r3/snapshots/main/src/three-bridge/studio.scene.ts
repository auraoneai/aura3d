// Native Aura3D source for the bridged "studio" asset (geometry and materials come from recipes/studio.mjs).
import { camera, createAuraApp, environments, lights, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { studioModel, studioOutput } from "./studio.bridge";

export const KEY_Y = 5.2;
export const KEY_Z = 4.5;

export function createStudioScene(): AuraSceneBuilder {
  // Soft contact shadows: stacked translucent dark discs under each sphere.
  const contact = [-2.2, 0, 2.2].flatMap((x, k) =>
    Array.from({ length: 14 }, (_, i) => 1.9 - i * 0.065).map((d, i) =>
      primitives
        .cylinder({
          name: `contact ${k}-${i}`,
          size: [d, 0.002, d],
          material: material.pbr({ color: "#1c2024", unlit: true, opacity: 0.05, alphaMode: "blend", depthWrite: false })
        })
        .position(x, 0.004 + i * 0.0006, 0.0)
    )
  );
  return scene({ background: "#c9cacd" })
    .addMany(contact)
    .add(
      studioModel({
        castShadow: true,
        receiveShadow: true
      })
    )
    .add(environments.studio({ preset: "softbox", intensity: 0.45, background: false }))
    // Key: large soft light, drifts side to side (see main.ts).
    .add(
      lights
        .directional({
          name: "key",
          position: [-3, KEY_Y, KEY_Z],
          target: [0, 0.4, 0],
          intensity: 1.8,
          color: "#fff4e6",
          shadow: { filter: "pcss", softness: 3, lightSize: 6, mapSize: 2048, bias: 0.002, normalBias: 0.06 }
        })
        .runtime({ id: "key", mutable: true })
    )
    // Visible softbox sources: they give glass and metal crisp window-shaped highlights.
    .add(lights.softbox({ name: "softbox key", position: [-4, 5, 5], target: [0, 0.8, 0], intensity: 4, width: 3.5, height: 2.5, color: "#fff6ea" }))
    .add(lights.softbox({ name: "softbox strip", position: [5, 3, 3], target: [0, 0.8, 0], intensity: 2.5, width: 0.7, height: 3.5, color: "#e8f0ff" }))
    // Fill: dimmer, opposite side, no shadow.
    .add(lights.directional({ name: "fill", position: [6, 3, 5], target: [0, 0.6, 0], intensity: 0.7, color: "#dbe6ff" }))
    // Rim: from behind and above.
    .add(lights.directional({ name: "rim", position: [0, 4, -6], target: [0, 0.8, 0], intensity: 1.8, color: "#ffffff" }))
    .camera(camera.perspective({ position: [0, 2.5, 8], target: [0, 0.75, 0], fov: 30 }));
}

export function mountStudio(selector = "#app") {
  return createAuraApp(selector, { scene: createStudioScene(), output: { ...studioOutput, toneMapping: "aces", exposure: 0.75 } });
}
