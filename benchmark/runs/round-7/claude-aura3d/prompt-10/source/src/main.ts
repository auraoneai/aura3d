// Prompt 10: Product Viewer With Provided Sneaker.
// Copied from benchmark recipe "10 Product Viewer Sneaker" with the one
// prompt-required edit: an explicit rotating turntable (clip + timeline loop).
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
    // productStage gives the plinth/product base, contact shadow, and softbox sweep.
    .addMany(prefabs.productStage())
    // model() fit-to-bounds normalizes (centers + auto-scales) the sneaker; the
    // turntable clip + timeline loop spins it on the plinth.
    .add(
      model(assets.sneaker)
        .position(0, 0.65, -0.65)
        .animate({ clip: "turntable", speed: 0.3 })
    )
    // Studio key/fill/rim lighting makes the sneaker material readable.
    .add(lights.studio({ intensity: 1.35 }))
    // Orbit controls.
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.2, target: [0, 0.55, -0.65] }))
    // Drives the looping turntable rotation.
    .timeline(timeline.loop({ seconds: 12 }))
});
