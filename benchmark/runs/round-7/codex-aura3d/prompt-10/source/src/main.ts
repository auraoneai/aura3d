import {
  camera,
  createAuraApp,
  interactions,
  lights,
  model,
  prefabs,
  scene,
  timeline
} from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .background("#0b1020")
    .addMany(prefabs.productStage())
    .add(
      model(assets.sneaker, { name: "centered auto-scaled sneaker turntable" })
        .position(0, 0.65, -0.65)
        .animate({ clip: "turntable", speed: 0.45 })
    )
    .add(lights.studio({ intensity: 1.35 }))
    .add(interactions.orbit({ target: "centered auto-scaled sneaker turntable" }))
    .camera(camera.orbit({ distance: 4.2, target: [0, 0.55, -0.65] }))
    .timeline(timeline.loop({ seconds: 12 }))
});
