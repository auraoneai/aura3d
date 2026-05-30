import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  model,
  prefabs,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const sneakerViewer = scene()
  .background("#0b1015")
  .addMany(prefabs.productStage())
  .add(
    primitives.cylinder({
      name: "dark turntable inset on plinth",
      material: material.metal({ color: "#252c32", roughness: 0.28, metallic: 0.35 })
    })
      .position(0, 0.205, -0.65)
      .scale([1.06, 0.035, 1.06])
      .animate({ clip: "turntable", speed: 0.42 })
  )
  .add(
    model(assets.sneaker, {
      name: "centered auto-scaled sneaker",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0.24, -0.65)
      .rotate(-0.08, -0.38, 0.02)
      .scale(1.08)
      .animate({ clip: "turntable", speed: 0.42 })
  )
  .add(lights.ambient({ intensity: 0.22, color: "#f3f7ff" }))
  .add(lights.studio({ intensity: 1.25 }))
  .add(lights.point({ name: "large front softbox", position: [-2.4, 2.4, 2.3], color: "#f4f9ff", intensity: 2.4 }))
  .add(lights.point({ name: "warm heel rim", position: [2.25, 1.75, 0.45], color: "#ffd2a1", intensity: 1.35 }))
  .add(lights.point({ name: "low sole fill", position: [0.3, 0.8, 1.9], color: "#dff3ff", intensity: 0.85 }))
  .add(effects.bloom({ intensity: 0.16, color: "#d9f2ff" }))
  .add(interactions.orbit({ target: "centered auto-scaled sneaker" }))
  .camera(camera.orbit({ distance: 3.75, target: [0, 0.72, -0.65], fov: 38 }))
  .timeline(timeline.loop({ seconds: 12 }));

createAuraApp("#app", {
  scene: sneakerViewer,
  diagnostics: { overlay: true, assetPanel: true, performancePanel: false },
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
});
