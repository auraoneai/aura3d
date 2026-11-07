// Three-compat postprocess scene: two repo-owned showcase models with real
// emissive materials (luma's Cyberpunk_MAT, miko's glow mat) blooming through
// the `neon-arcade` look's post pipeline on a dark deck. Mirrors three.js
// r185 `webgl_postprocessing_unreal_bloom` (no parity claim).
import { camera, createAuraApp, effects, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "neon-arcade" as const;

// Neon grid inlaid in the deck: thin emissive strips every 1.5 m in both directions give the bloom pass a floor of
// bright edges and the frame real surface detail between the heroes.
const gridLines = [-3, -1.5, 0, 1.5, 3].flatMap((offset) => [
  primitives.box({ name: `deck grid x ${offset}`, size: [9, 0.012, 0.035], position: [0, 0.006, offset], material: material.neon({ color: "#3a7bff", emissive: "#3a7bff", emissiveIntensity: 1.1 }) }),
  primitives.box({ name: `deck grid z ${offset}`, size: [0.035, 0.012, 9], position: [offset, 0.006, 0], material: material.neon({ color: "#3a7bff", emissive: "#3a7bff", emissiveIntensity: 1.1 }) })
]);

// A dark skyline behind the deck, each tower banded with lit window strips: a backdrop with silhouette and glow
// instead of an empty sky.
const towers = [
  { x: -6.2, z: -6.5, w: 1.6, h: 4.2 }, { x: -4.3, z: -7.4, w: 1.2, h: 6.0 }, { x: -2.4, z: -6.8, w: 1.8, h: 3.4 },
  { x: -0.4, z: -7.8, w: 1.4, h: 6.8 }, { x: 1.6, z: -7.0, w: 1.7, h: 4.6 }, { x: 3.6, z: -7.6, w: 1.3, h: 5.6 },
  { x: 5.5, z: -6.6, w: 1.9, h: 3.8 }, { x: 7.4, z: -7.2, w: 1.4, h: 5.0 }
];
const skyline = towers.flatMap(({ x, z, w, h }, i) => [
  primitives.box({ name: `skyline tower ${i}`, size: [w, h, w], position: [x, h / 2, z], material: material.pbr({ color: "#161a2c", roughness: 0.8 }) }),
  ...Array.from({ length: Math.floor(h / 0.9) }, (_, row) =>
    primitives.box({ name: `skyline windows ${i}.${row}`, size: [w * 0.78, 0.14, 0.02], position: [x, 0.7 + row * 0.9, z + w / 2 + 0.011], material: material.neon({ color: i % 2 ? "#ff7ad9" : "#7ae8ff", emissive: i % 2 ? "#ff7ad9" : "#7ae8ff", emissiveIntensity: 1.4 }) }))
]);

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .background("#5560a8")
    .add(primitives.box({ name: "dark deck", size: [9, 0.1, 9], position: [0, -0.05, 0], material: material.pbr({ color: "#101723", roughness: 0.92 }), receiveShadow: true }))
    // Wide dark street under the deck and skyline so the towers stand on ground rather than float over the sky colour.
    .add(primitives.box({ name: "street", size: [40, 0.1, 40], position: [0, -0.16, -6], material: material.pbr({ color: "#0b0f1a", roughness: 0.95 }), receiveShadow: true }))
    .addMany(gridLines)
    .addMany(skyline)
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
