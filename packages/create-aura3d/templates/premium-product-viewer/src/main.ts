// Three-compat premium product viewer: a typed Khronos CC0 GLB (ToyCar, the
// KHR_materials_clearcoat/transmission/sheen sample) on a studio plinth under
// the `product-studio` look — studio HDRI, key shadow, neutral backdrop,
// grade — with orbit autoframing. Mirrors three.js r185
// `webgl_materials_physical_clearcoat` (no parity claim).
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "product-studio" as const;

const autoframe = camera.frameAsset(assets.product, {
  targetHeight: 1.1,
  padding: 1.55,
  fov: 32,
  azimuth: 0.55,
  elevation: 0.3
});

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.cylinder({ name: "product plinth", size: [1.6, 0.28, 1.6], position: [0, 0.14, 0], material: material.pbr({ color: "#24272e", roughness: 0.42, metallic: 0.25 }), castShadow: true, receiveShadow: true }))
    // ToyCar is authored at ~7.3 m; scale to a desk-model 1.55 m length.
    .add(model(assets.product, { name: "Khronos ToyCar clearcoat sample" }).position(0, 0.28, 0).rotate(0, 0.65, 0).scale(0.0021))
    .add(interactions.orbit({ target: "Khronos ToyCar clearcoat sample" }))
    .camera(autoframe)
});

(window as unknown as { __AURA3D_PREMIUM_PRODUCT_VIEWER__?: unknown }).__AURA3D_PREMIUM_PRODUCT_VIEWER__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.product.id, url: assets.product.url, provenance: "Khronos glTF-Sample-Assets ToyCar, CC0-1.0" },
  mirrors: "three.js r185 webgl_materials_physical_clearcoat"
};
