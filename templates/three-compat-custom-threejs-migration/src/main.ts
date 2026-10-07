// Three-compat migration example: the classic hand-rolled three.js starter
// (ground plane + a lit mesh) rebuilt with the public @aura3d/engine API —
// typed GLB hero, `outdoor-day` look for light/sky/grade, no manual renderer,
// scene graph, or render loop.
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "outdoor-day" as const;

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.plane({ name: "harbour water", size: [26, 1, 26], material: material.pbr({ color: "#28506b", roughness: 0.35, metallic: 0.15 }), receiveShadow: true }))
    // Pirate ship is 4.8×11×10.6 m (mast up +Y); scale to a 7 m sailboat.
    .add(model(assets.ship, { name: "migrated ship mesh" }).position(0, 0.12, -0.4).rotate(0, -0.5, 0).scale(0.62))
    .add(interactions.orbit({ target: "migrated ship mesh" }))
    .camera(camera.orbit({ target: [0, 2.4, 0], distance: 13, fov: 40 }))
});

(window as unknown as { __AURA3D_CUSTOM_THREEJS_MIGRATION__?: unknown }).__AURA3D_CUSTOM_THREEJS_MIGRATION__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.ship.id, url: assets.ship.url, provenance: "Kenney Pirate Kit ship-medium, CC0-1.0" }
};
