import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#11170f")
    .add(primitives.plane({ name: "softbox sweep backdrop", material: material.emissive({ color: "#20301c", emissive: "#375c2b" }) }).position(0, 1.0, -2.15).rotate(1.5708, 0, 0).scale([5.2, 1, 2.7]))
    .add(primitives.plane({ name: "matte product plinth", material: material.pbr({ color: "#293327", roughness: 0.5, metallic: 0.02 }) }).position(0, -0.06, -0.55).scale([4.4, 1, 3.2]))
    .add(primitives.box({ name: "left bounce card", material: material.emissive({ color: "#f3f7de", emissive: "#f3f7de" }) }).position(-1.85, 0.82, -0.95).rotate(0, 0.2, 0).scale([0.08, 1.12, 1.55]))
    .add(primitives.box({ name: "right shadow flag", material: material.pbr({ color: "#1b211b", roughness: 0.72 }) }).position(1.92, 0.72, -1.05).rotate(0, -0.18, 0).scale([0.08, 0.9, 1.35]))
    .add(model(assets.product).position(0, 0.02, -0.68).rotate(-0.18, -0.48, 0.03).scale(1.12))
    .add(lights.ambient({ intensity: 0.18, color: "#e9ffd9" }))
    .add(lights.point({ name: "large softbox", position: [-2.2, 2.4, 2.2], color: "#f1ffd2", intensity: 2.2 }))
    .add(lights.point({ name: "warm rim", position: [2.1, 1.6, 0.2], color: "#ffd08a", intensity: 0.9 }))
    .add(effects.bloom({ intensity: 0.16, color: "#d8ffc0" }))
    .add(interactions.orbit())
    .camera(camera.dolly({ from: [0.2, 1.12, 4.4], to: [0.05, 0.95, 3.45], target: [0, 0.42, -0.68], seconds: 7 }))
    .timeline(timeline.loop({ seconds: 7 }))
});
