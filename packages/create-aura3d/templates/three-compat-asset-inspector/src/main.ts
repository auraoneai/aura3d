// Three-compat asset inspector: one centered primitive on a neutral stage
// with inspection lighting, authored through the public @aura3d/engine API.
// Swap the torus for `model(assets.yourAsset)` once you add typed assets.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene()
    .background("#0b0f16")
    .camera(camera.orbit({ target: [0, 0.9, 0], distance: 4.2 }))
    .add(primitives.box({ name: "inspection stage", size: [4, 0.1, 4], position: [0, -0.05, 0], material: material.pbr({ color: "#1d2533", roughness: 0.9 }), receiveShadow: true }))
    .add(primitives.torus({ name: "inspected asset", size: 1.1, position: [0, 0.95, 0], rotation: [0.5, 0.35, 0], material: material.metal({ color: "#c9d4e4", roughness: 0.22 }), castShadow: true }))
    .add(primitives.box({ name: "scale reference cube", size: 0.25, position: [1.4, 0.125, 0.9], material: material.pbr({ color: "#38d6ff" }), castShadow: true }))
    .add(lights.ambient({ intensity: 0.3 }))
    .add(lights.directional({ name: "key", position: [3, 4, 3], intensity: 1.5 }))
    .add(lights.point({ name: "rim", position: [-2.5, 2, -2], intensity: 1.4, color: "#9fc4ff" }))
});
