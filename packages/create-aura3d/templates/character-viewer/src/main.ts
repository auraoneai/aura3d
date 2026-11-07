// Three-compat character viewer: a rigged Kenney archer (2 skins, 32 clips)
// idling on a pedestal under the `character-showcase` stage look. Replace the
// clip or the asset through `src/aura-assets.ts`.
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "character-showcase" as const;

// A small forest clearing behind the pedestal (primitives only, no extra assets): a mossy ground disc,
// a half ring of trunks and mounds, and a few rocks. It gives the viewer ground, depth and colour
// contrast around the subject instead of a bare backdrop. Delete the loop to go back to a clean stage.
const trunkColors = ["#6b4f3a", "#7a5a42", "#5d4636"] as const;
const leafColors = ["#4f8a4b", "#5f9c52", "#3f7a4a", "#6aa65a"] as const;
const clearing = Array.from({ length: 9 }, (_, i) => {
  const angle = (-70 + i * 17.5) * (Math.PI / 180); // fan behind the subject, around -z
  const radius = 4.2 + (i % 3) * 0.7;
  const x = Math.sin(angle) * radius;
  const z = -Math.cos(angle) * radius;
  const height = 1.6 + ((i * 37) % 10) / 8;
  return [
    primitives.cylinder({ name: `trunk ${i}`, size: [0.22, height, 0.22], position: [x, height / 2, z], material: material.pbr({ color: trunkColors[i % 3], roughness: 0.85 }), castShadow: true }),
    primitives.sphere({ name: `canopy ${i}`, size: 1.15 + (i % 4) * 0.15, position: [x, height + 0.25, z], material: material.pbr({ color: leafColors[i % 4], roughness: 0.8 }), castShadow: true })
  ];
}).flat();
const rocks = [[-1.9, 0.22, 1.2, 0.55], [2.1, 0.18, 0.6, 0.45], [1.5, 0.15, 1.9, 0.35], [-2.6, 0.2, -0.4, 0.5]].map(([x, y, z, size], i) =>
  primitives.sphere({ name: `rock ${i}`, size, position: [x, y, z], material: material.pbr({ color: i % 2 ? "#8b8f98" : "#737883", roughness: 0.9 }), castShadow: true, receiveShadow: true })
);

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.cylinder({ name: "mossy ground", size: [14, 0.06, 14], position: [0, 0.03, 0], material: material.pbr({ color: "#4b6a43", roughness: 0.95 }), receiveShadow: true }))
    .addMany([...clearing, ...rocks])
    .add(primitives.cylinder({ name: "viewer pedestal", size: [1.6, 0.24, 1.6], position: [0, 0.12, 0], material: material.pbr({ color: "#2b3138", roughness: 0.5, metallic: 0.2 }), castShadow: true, receiveShadow: true }))
    .add(model(assets.character, { name: "rigged archer character" }).position(0, 0.24, 0).rotate(0, 0.35, 0).scale(0.85).animate({ clip: "idle", speed: 1 }))
    .add(interactions.orbit({ target: "rigged archer character" }))
    .camera(camera.orbit({ target: [0, 1.1, 0], distance: 4.4, fov: 38 }))
});

(window as unknown as { __AURA3D_CHARACTER_VIEWER__?: unknown }).__AURA3D_CHARACTER_VIEWER__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.character.id, clips: assets.character.metadata.animations, clip: "idle", provenance: "Kenney Mini Forest character-archer, rigged, CC0-1.0" }
};
