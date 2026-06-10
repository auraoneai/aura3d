// Three-compat premium product viewer: a hero sphere on a studio stage with
// plinth, sweep, and softbox-style lighting via the public @aura3d/engine API.
// Swap the sphere for `model(assets.product)` once you add a typed asset.
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#0a0d13")
    .camera(camera.orbit({ target: [0, 0.95, 0], distance: 4.4 }))
    .add(primitives.box({ name: "studio sweep floor", size: [7, 0.1, 7], position: [0, -0.05, 0], material: material.pbr({ color: "#171e2b", roughness: 0.85 }), receiveShadow: true }))
    .add(primitives.box({ name: "studio sweep backdrop", size: [7, 3.2, 0.12], position: [0, 1.55, -3], material: material.pbr({ color: "#131927", roughness: 0.9 }), receiveShadow: true }))
    .add(primitives.cylinder({ name: "product plinth", size: [1.5, 0.5, 1.5], position: [0, 0.25, 0], material: material.pbr({ color: "#222c3f", roughness: 0.4, metalness: 0.3 }), castShadow: true, receiveShadow: true }))
    .add(primitives.sphere({ name: "hero product", size: 1.05, position: [0, 1.05, 0], material: material.metal({ color: "#e7d9b8", roughness: 0.14, clearcoat: 0.6 }), castShadow: true }))
    .add(lights.studio())
    .add(lights.rect({ name: "softbox key", position: [2.6, 2.8, 2.2], intensity: 1.4, width: 2, height: 1.4 }))
    .add(lights.point({ name: "cool rim", position: [-2.6, 2.2, -1.8], intensity: 1.2, color: "#a9c8ff" }))
    .add(effects.bloom({ intensity: 0.22, threshold: 0.78 }))
});
