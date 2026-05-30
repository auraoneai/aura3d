import {
  createAuraApp,
  scene,
  model,
  lights,
  effects,
  camera,
  interactions,
  timeline,
  prefabs,
} from "@aura3d/engine";
import { assets } from "./aura-assets";

// Product viewer for the provided sneaker.
//
// - `prefabs.productStage()` supplies the studio surround: a white inspection
//   plinth (product base), a soft contact shadow, a curved backdrop, and
//   key/rim softbox panels.
// - `model(assets.sneaker)` is auto-normalized by the engine (fit-to-bounds
//   scale + centered, resting on the base), so the sneaker is centered and
//   auto-scaled regardless of its source units.
// - A turntable spin is driven by the model animation clip; the engine rotates
//   the model continuously about Y each frame.
// - Studio lights (key / fill / rim) make the leather, mesh, and sole readable.
// - `interactions.orbit()` declares orbit controls focused on the sneaker.
const productViewer = scene()
  .background("#0e1622")
  .addMany(prefabs.productStage())
  .add(
    model(assets.sneaker, {
      name: "sneaker",
      castShadow: true,
      receiveShadow: false,
    })
      // Centered over the plinth; the engine auto-scales to a unit-ish size.
      .position(0, 0.18, -0.65)
      // Rotating turntable (continuous Y spin).
      .animate({ clip: "turntable", speed: 0.5 }),
  )
  // Studio lighting rig: soft ambient fill + key + cool rim.
  .add(lights.ambient({ intensity: 0.55, color: "#dfeaff" }))
  .add(lights.studio({ intensity: 1.25 }))
  .add(lights.directional({ position: [-3.4, 2.6, -2.2], intensity: 0.8, color: "#cfe1ff" }))
  // Subtle bloom so the softbox panels read as a studio without washing out
  // the material.
  .add(effects.bloom({ intensity: 0.16 }))
  // Orbit controls targeted at the product.
  .add(interactions.orbit({ target: "sneaker" }))
  // Product-orbit camera framing, looking at the sneaker on the plinth.
  .camera(camera.orbit({ distance: 3.4, target: [0, 0.78, -0.65] }))
  // Keep the turntable animation running on a loop.
  .timeline(timeline.loop({ seconds: 12 }));

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: productViewer,
});
