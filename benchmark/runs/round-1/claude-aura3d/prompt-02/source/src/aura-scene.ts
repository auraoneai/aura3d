// The static 3D scene authored with the public @aura3d/engine API.
//
// Aura3D's declarative scene compiler renders this through its Three.js backend:
// a large ground plane, the fountain emitter (a metal base + a glowing nozzle),
// lighting, a bloom glow around the emissive nozzle, and a fixed perspective
// camera. The dynamic particles are layered on top by fountain.ts using a camera
// that matches `CAMERA` exactly.

import {
  camera,
  effects,
  lights,
  material,
  primitives,
  scene,
  type AuraSceneBuilder,
} from "@aura3d/engine";
import { BACKGROUND, CAMERA } from "./config";

export function buildFountainScene(): AuraSceneBuilder {
  return scene()
    .background(BACKGROUND)
    // Ground plane the particles collide against.
    .add(
      primitives
        .plane({
          name: "ground",
          size: 40,
          material: material.pbr({ color: "#0f2236", roughness: 0.95, metallic: 0.0 }),
        })
        .position(0, 0, 0),
    )
    // A subtle catch-basin ring around the emitter so the ground reads clearly.
    .add(
      primitives
        .box({
          name: "basin",
          size: [2.4, 0.06, 2.4],
          material: material.pbr({ color: "#14304a", roughness: 0.6, metallic: 0.2 }),
        })
        .position(0, 0.03, 0),
    )
    // Emitter base.
    .add(
      primitives
        .box({
          name: "emitter-base",
          size: [0.6, 0.12, 0.6],
          material: material.pbr({ color: "#1b2c3d", roughness: 0.3, metallic: 0.7 }),
        })
        .position(0, 0.06, 0),
    )
    // Glowing emitter nozzle (emissive -> also becomes a bloom anchor).
    .add(
      primitives
        .box({
          name: "emitter-nozzle",
          size: [0.2, 0.5, 0.2],
          material: material.emissive({ color: "#0a1a26", emissive: "#3fe7ff" }),
        })
        .position(0, 0.3, 0),
    )
    // Lighting.
    .add(lights.ambient({ intensity: 0.55, color: "#6f86b8" }))
    .add(lights.directional({ position: [4.5, 6.5, 3.5], intensity: 1.7, color: "#ffffff" }))
    .add(lights.point({ position: [0, 1.3, 0], color: "#3fe7ff", intensity: 1.6 }))
    // Bloom makes the emitter nozzle glow, marking it clearly.
    .add(effects.bloom({ intensity: 0.55, color: "#8fe4ff" }))
    .camera(
      camera.perspective({
        position: [CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]],
        target: [CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]],
        fov: CAMERA.fov,
      }),
    );
}
