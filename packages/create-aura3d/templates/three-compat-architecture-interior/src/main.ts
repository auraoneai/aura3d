// Three-compat architecture interior: a textured Kenney room kit under the
// `interior-warm` look (warm key, interior fog, warm grade), orbiting into the
// room. Mirrors three.js r185 `webgl_lights_rectarealight` (no parity claim).
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "interior-warm" as const;

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.plane({ name: "interior apron floor", size: [14, 1, 14], material: material.fabric({ color: "#3a3129", roughness: 0.85 }), receiveShadow: true }))
    // Room kit is 12×5.2×12 m; scale to a 4.2 m readable interior.
    .add(model(assets.room, { name: "textured room kit" }).position(0, 0, -0.4).scale(0.35))
    .add(interactions.orbit({ target: "textured room kit" }))
    .camera(camera.orbit({ target: [0, 0.95, -0.4], distance: 5.6, fov: 42 }))
});

(window as unknown as { __AURA3D_ARCHITECTURE_INTERIOR__?: unknown }).__AURA3D_ARCHITECTURE_INTERIOR__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.room.id, url: assets.room.url, provenance: "Kenney Modular Dungeon Kit room-small, CC0-1.0" },
  mirrors: "three.js r185 webgl_lights_rectarealight"
};
