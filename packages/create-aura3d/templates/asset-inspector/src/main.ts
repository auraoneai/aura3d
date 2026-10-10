// Three-compat asset inspector: a typed GLB on a neutral stage under the
// `product-studio` look with the diagnostics overlay on — the template agents
// use to check a real asset's scale, materials, and shadows.
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "product-studio" as const;

createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.box({ name: "inspection stage", size: [4, 0.1, 4], position: [0, -0.05, 0], material: material.pbr({ color: "#24272e", roughness: 0.9 }), receiveShadow: true }))
    .add(model(assets.asset, { name: "inspected typed asset" }).position(0, 0.02, 0).rotate(0, 0.5, 0).scale(0.75))
    .add(primitives.box({ name: "25cm scale reference cube", size: 0.25, position: [1.4, 0.125, 0.9], material: material.pbr({ color: "#d9b98a" }), castShadow: true }))
    .add(interactions.orbit({ target: "inspected typed asset" }))
    .camera(camera.orbit({ target: [0, 0.75, 0], distance: 4.4, fov: 36 }))
});

(window as unknown as { __AURA3D_ASSET_INSPECTOR__?: unknown }).__AURA3D_ASSET_INSPECTOR__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  asset: { assetId: assets.asset.id, url: assets.asset.url, metres: assets.asset.bounds, provenance: "Kenney Car Kit sedan-sports, CC0-1.0" }
};
