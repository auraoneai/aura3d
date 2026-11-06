// Three-compat postprocess scene: two repo-owned showcase models with real
// emissive materials (luma's Cyberpunk_MAT, miko's glow mat) blooming through
// the `neon-arcade` look's post pipeline on a dark deck. Mirrors three.js
// r185 `webgl_postprocessing_unreal_bloom` (no parity claim).
import { camera, createAuraApp, effects, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "neon-arcade" as const;

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .background("#5560a8")
    .add(primitives.box({ name: "dark deck", size: [9, 0.1, 9], position: [0, -0.05, 0], material: material.pbr({ color: "#101723", roughness: 0.92 }), receiveShadow: true }))
    // luma is authored at ~103 m and model() fits it to ~1.55 m; scale 1.5 -> a ~2.3 m emissive monolith.
    .add(model(assets.luma, { name: "emissive showcase luma" }).position(-1.3, 0.02, -1.1).scale(1.5))
    .add(model(assets.miko, { name: "glowing showcase miko" }).position(1.15, 0.02, 0.85).rotate(0, -0.45, 0).scale(1.05))
    // Three emissive neon bars behind the figures: bright edges for the bloom pass to bleed from (and a visible
    // post-processing demonstration even where the heroes' own emissive materials are subtle).
    .add(primitives.box({ name: "neon bar cyan", size: [0.12, 2.6, 0.12], position: [-2.9, 1.3, -3.2], material: material.neon({ color: "#4de8ff", emissive: "#4de8ff", emissiveIntensity: 2.2 }) }))
    .add(primitives.box({ name: "neon bar magenta", size: [0.12, 3.2, 0.12], position: [0.2, 1.6, -3.6], material: material.neon({ color: "#ff4de1", emissive: "#ff4de1", emissiveIntensity: 2.2 }) }))
    .add(primitives.box({ name: "neon bar amber", size: [0.12, 2.2, 0.12], position: [3.1, 1.1, -2.6], material: material.neon({ color: "#ffb84d", emissive: "#ffb84d", emissiveIntensity: 2.2 }) }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.6, radius: 0.45 }))
    .add(interactions.orbit({ target: "emissive showcase models" }))
    .camera(camera.orbit({ target: [0, 1.05, 0], distance: 6.4, fov: 40 }))
});

(window as unknown as { __AURA3D_POSTPROCESS_SCENE__?: unknown }).__AURA3D_POSTPROCESS_SCENE__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  heroes: [
    { assetId: assets.luma.id, emissiveMaterial: "Cyberpunk_MAT" },
    { assetId: assets.miko.id, emissiveMaterial: "miko_glow_mat" }
  ],
  mirrors: "three.js r185 webgl_postprocessing_unreal_bloom"
};
