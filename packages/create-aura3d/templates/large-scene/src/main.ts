// Three-compat large scene: instanced Kenney props (trees and rocks) spread
// over a meadow under the `outdoor-day` look — one draw class per prop, not
// hundreds of unique nodes. Orbit high to read the layout.
import { camera, createAuraApp, instances, interactions, looks, material, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "outdoor-day" as const;

// Deterministic scatter so captures and tests compare frame-to-frame.
const treeTransforms = Array.from({ length: 42 }, (_, index) => {
  const row = Math.floor(index / 7);
  const col = index % 7;
  const jitter = ((index * 53) % 11) / 11 - 0.5;
  return {
    position: [(col - 3) * 4.2 + jitter * 1.6, 0, (row - 2.5) * 4.4 + jitter * 1.2],
    rotation: [0, (index * 1.37) % (Math.PI * 2), 0],
    scale: 0.85 + ((index * 29) % 9) / 20
  } as const;
});
const rockTransforms = Array.from({ length: 24 }, (_, index) => {
  const ring = 3.2 + ((index * 41) % 7) / 7 * 9;
  const angle = index * 2.39996;
  return {
    position: [Math.cos(angle) * ring, 0, Math.sin(angle) * ring * 0.85],
    rotation: [0, angle * 1.7, 0],
    scale: 0.35 + ((index * 17) % 6) / 12
  } as const;
});

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.plane({ name: "meadow ground", size: [34, 1, 30], material: material.pbr({ color: "#3f5a33", roughness: 0.95 }), receiveShadow: true }))
    .add(instances.model(assets.tree, { name: "instanced forest trees", transforms: treeTransforms, castShadow: true }))
    .add(instances.model(assets.rocks, { name: "instanced scatter rocks", transforms: rockTransforms, castShadow: true, receiveShadow: true }))
    .add(interactions.orbit({ target: "instanced meadow props" }))
    .camera(camera.orbit({ target: [0, 0.6, 0], distance: 18, fov: 44 }))
});

(window as unknown as { __AURA3D_LARGE_SCENE__?: unknown }).__AURA3D_LARGE_SCENE__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  instances: { trees: treeTransforms.length, rocks: rockTransforms.length }
};
