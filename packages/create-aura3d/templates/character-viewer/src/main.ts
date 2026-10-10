// Three-compat character viewer: a rigged Kenney archer (2 skins, 32 clips)
// idling on a pedestal under the `character-showcase` stage look. Replace the
// clip or the asset through `src/aura-assets.ts`.
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "character-showcase" as const;

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.cylinder({ name: "viewer pedestal", size: [1.6, 0.24, 1.6], position: [0, 0.12, 0], material: material.pbr({ color: "#2b3138", roughness: 0.5, metallic: 0.2 }), castShadow: true, receiveShadow: true }))
    .add(model(assets.character, { name: "rigged archer character" }).position(0, 0.24, 0).rotate(0, 0.35, 0).scale(0.85).animate({ clip: "idle", speed: 1 }))
    .add(interactions.orbit({ target: "rigged archer character" }))
    .camera(camera.orbit({ target: [0, 1.1, 0], distance: 4.4, fov: 38 }))
});

(window as unknown as { __AURA3D_CHARACTER_VIEWER__?: unknown }).__AURA3D_CHARACTER_VIEWER__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.character.id, clips: assets.character.metadata.animations, clip: "idle", provenance: "Kenney Mini Forest character-archer, rigged, CC0-1.0" }
};
