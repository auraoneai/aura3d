// Three-compat premium product viewer: a typed Khronos CC0 GLB (ToyCar, the
// KHR_materials_clearcoat/transmission/sheen sample) on a studio plinth under
// the `product-studio` look — studio HDRI, key shadow, neutral backdrop,
// grade — with orbit autoframing. Mirrors three.js r185
// `webgl_materials_physical_clearcoat` (no parity claim).
import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "product-studio" as const;
const PLINTH_TOP = 0.28;
const PRODUCT_MAX_DIMENSION = 1.55;

// These are scene-space bounds after the GLB's mesh-node rotation and 0.0001
// scale, not the untransformed accessor extents in the existing asset manifest.
// The full asset includes a large draped Fabric mesh below the ToyCar.
const ASSET_MAX_DIMENSION = 0.0739623;
const ASSET_MIN_Y = -0.0162063;
const CAR_SIZE = [0.0187075, 0.0116242, 0.0383794] as const;
const CAR_CENTER_Y = 0.0068045;
const fit = PRODUCT_MAX_DIMENSION / ASSET_MAX_DIMENSION;

// frameAsset is synchronous. Give it the car mesh's measured bounds for the
// hero shot; the actual model below still uses the original typed asset.
const carFrameAsset = {
  ...assets.product,
  bounds: CAR_SIZE,
  metadata: { ...assets.product.metadata, boundsMetadata: { size: CAR_SIZE } }
};
const autoframe = camera.frameAsset(carFrameAsset, {
  targetLength: CAR_SIZE[2] * fit,
  target: [0, PLINTH_TOP + (CAR_CENTER_Y - ASSET_MIN_Y) * fit, 0],
  padding: 1.45,
  fov: 32,
  azimuth: 0.55,
  elevation: 0.65
});

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.cylinder({ name: "product plinth", size: [1.6, PLINTH_TOP, 1.6], position: [0, PLINTH_TOP / 2, 0], material: material.pbr({ color: "#24272e", roughness: 0.42, metallic: 0.25 }), castShadow: true, receiveShadow: true }))
    .add(model(assets.product, { name: "Khronos ToyCar clearcoat sample", targetMaxDimension: PRODUCT_MAX_DIMENSION }).position(0, PLINTH_TOP, 0).rotate(0, 0.65, 0))
    .add(interactions.orbit({ target: "Khronos ToyCar clearcoat sample" }))
    .camera(autoframe)
});

(window as unknown as { __AURA3D_PREMIUM_PRODUCT_VIEWER__?: unknown }).__AURA3D_PREMIUM_PRODUCT_VIEWER__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.product.id, url: assets.product.url, provenance: "Khronos glTF-Sample-Assets ToyCar, CC0-1.0" },
  mirrors: "three.js r185 webgl_materials_physical_clearcoat"
};
