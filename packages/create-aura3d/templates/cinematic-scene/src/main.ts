import { camera, createAuraApp, effects, lights, material, model, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#05070d")
    .add(model(assets.hero, { material: material.emissive({ color: "#39445e", emissive: "#38d6ff" }) }).position(0, 0, -1).scale(1.05))
    .add(lights.ambient({ intensity: 0.2 }))
    .add(lights.point({ name: "cyan-rim", position: [-2, 2.4, 1], color: "#38d6ff", intensity: 2.4 }))
    .add(lights.point({ name: "warm-practical", position: [2.6, 1.7, -0.4], color: "#ffd08a", intensity: 1.6 }))
    .add(effects.rain({ intensity: 0.45 }))
    .add(effects.fog({ density: 0.18, color: "#6f89b6" }))
    .add(effects.bloom({ intensity: 0.42 }))
    .camera(camera.dolly({ from: [0, 1.4, 6], to: [0, 1.2, 2.2], target: [0, 1, -1], seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
