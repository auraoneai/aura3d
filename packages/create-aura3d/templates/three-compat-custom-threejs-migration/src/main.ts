// Three-compat migration example: the classic hand-rolled three.js starter
// (ground plane + a few lit primitives) rebuilt with the public
// @aura3d/engine API — no manual renderer, scene graph, or render loop.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .background("#101521")
    .camera(camera.orbit({ target: [0, 0.7, 0], distance: 6 }))
    .add(primitives.plane({ name: "ground", size: [10, 1, 10], material: material.pbr({ color: "#1b2334", roughness: 0.9 }), receiveShadow: true }))
    .add(primitives.box({ name: "migrated box mesh", size: 1, position: [-1.6, 0.5, 0], rotation: [0, 0.6, 0], material: material.pbr({ color: "#e2674a", roughness: 0.5 }), castShadow: true }))
    .add(primitives.sphere({ name: "migrated sphere mesh", size: 1.1, position: [0.2, 0.55, -0.4], material: material.metal({ color: "#bcd0e6", roughness: 0.18 }), castShadow: true }))
    .add(primitives.torus({ name: "migrated torus mesh", size: 0.9, position: [1.9, 0.75, 0.6], rotation: [0.9, 0, 0.4], material: material.pbr({ color: "#5dbb8d", roughness: 0.4 }), castShadow: true }))
    .add(lights.ambient({ intensity: 0.3 }))
    .add(lights.directional({ name: "sun", position: [4, 6, 3], intensity: 1.5 }))
});
