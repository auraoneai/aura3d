import { camera, createAuraApp, interactions, lights, material, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#08111f")
    .add(model(assets.product, { material: material.pbr({ color: "#8fb4ff", roughness: 0.42, metallic: 0.2 }) }).scale(1.1))
    .add(lights.studio({ intensity: 1.2 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4, target: [0, 0.7, 0] }))
});
