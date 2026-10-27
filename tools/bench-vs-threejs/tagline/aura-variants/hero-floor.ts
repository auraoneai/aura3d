import { camera, createAuraApp, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(primitives.plane({ name: "floor", material: material.pbr({ color: "#24272e", roughness: 0.6 }) }).scale([8, 1, 8]))
    .add(model(assets.product, { name: "product", targetHeight: 1.6, castShadow: true }))
    .add(interactions.orbit({ target: "product" }))
    .camera(camera.frameAsset(assets.product, { targetHeight: 1.6 })),
  ...looks.appOptions("product-studio")
});
