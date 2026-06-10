// Three-compat character viewer: a capsule stand-in character on a pedestal,
// authored through the public @aura3d/engine API. Replace the capsule with
// `model(assets.character)` once you add a typed character asset.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#0d1119")
    .camera(camera.orbit({ target: [0, 1.2, 0], distance: 4.6 }))
    .add(primitives.box({ name: "viewer floor", size: [5, 0.1, 5], position: [0, -0.05, 0], material: material.pbr({ color: "#161d2a", roughness: 0.92 }), receiveShadow: true }))
    .add(primitives.cylinder({ name: "character pedestal", size: [1.4, 0.3, 1.4], position: [0, 0.15, 0], material: material.pbr({ color: "#2b3548", roughness: 0.55, metalness: 0.2 }), receiveShadow: true, castShadow: true }))
    .add(primitives.capsule({ name: "stand-in character", size: [0.7, 1.7, 0.7], position: [0, 1.25, 0], material: material.pbr({ color: "#7fa6d9", roughness: 0.45 }), castShadow: true }))
    .add(primitives.sphere({ name: "stand-in head marker", size: 0.3, position: [0, 2.25, 0], material: material.pbr({ color: "#d9c79f", roughness: 0.5 }), castShadow: true }))
    .add(lights.ambient({ intensity: 0.32 }))
    .add(lights.directional({ name: "key light", position: [3, 4.5, 3], intensity: 1.5 }))
    .add(lights.point({ name: "rim light", position: [-2.4, 2.6, -2.2], intensity: 1.5, color: "#8fb8ff" }))
});
