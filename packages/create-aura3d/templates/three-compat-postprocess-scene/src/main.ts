// Three-compat postprocess scene: emissive primitives pushed through the
// engine's bloom post pass, authored via the public @aura3d/engine API.
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#070a11")
    .camera(camera.orbit({ target: [0, 0.9, 0], distance: 6 }))
    .add(primitives.box({ name: "dark deck", size: [8, 0.1, 8], position: [0, -0.05, 0], material: material.pbr({ color: "#101723", roughness: 0.92 }), receiveShadow: true }))
    .add(primitives.sphere({ name: "bloom core", size: 1.1, position: [0, 1, 0], material: material.emissive({ color: "#1a2330", emissive: "#7dfcff", emissiveIntensity: 1.6 }), castShadow: true }))
    .add(primitives.torus({ name: "neon ring", size: 1.5, position: [0, 1, 0], rotation: [1.1, 0, 0.2], material: material.emissive({ color: "#171120", emissive: "#ff42c8", emissiveIntensity: 1.3 }), castShadow: true }))
    .add(primitives.box({ name: "amber pylon", size: [0.4, 1.6, 0.4], position: [-2.4, 0.8, -1.2], material: material.emissive({ color: "#221a10", emissive: "#ffb347", emissiveIntensity: 1.1 }), castShadow: true }))
    .add(primitives.box({ name: "cyan pylon", size: [0.4, 1.1, 0.4], position: [2.3, 0.55, 1], material: material.emissive({ color: "#101d22", emissive: "#38d6ff", emissiveIntensity: 1.1 }), castShadow: true }))
    .add(effects.bloom({ intensity: 0.55, threshold: 0.62, radius: 0.42 }))
    .add(lights.ambient({ intensity: 0.26 }))
    .add(lights.directional({ name: "soft key", position: [3, 5, 3], intensity: 0.9 }))
});
