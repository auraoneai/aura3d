import { camera, createAuraApp, interactions, lights, model, prefabs, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

// Prompt 10: Product viewer for the provided sneaker.glb.
// prefabs.productStage() supplies the plinth/product base, contact shadow,
// softbox studio reflection cards, and fit-to-bounds brackets so the model
// reads as a centered, auto-scaled studio product rather than a lone GLB.
createAuraApp("#app", {
  scene: scene()
    .background("#0b1020")
    .addMany(prefabs.productStage())
    .add(
      model(assets.sneaker)
        .position(0, 0.54, -0.65)
        .rotate(0, -0.38, 0)
        .animate({ clip: "turntable", speed: 0.42 })
    )
    .add(lights.studio({ intensity: 1.35 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
