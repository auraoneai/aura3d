// Prompt 10 — Product Viewer With Provided Sneaker.
//
// A studio product viewer built entirely on the public `@aura3d/engine` API:
//   - the provided sneaker GLB, loaded as a typed asset (no invented paths),
//   - automatically centered and fit-to-bounds auto-scaled by the engine,
//   - standing on a real product plinth from the `productStage` prefab,
//   - lit by a multi-light studio rig so the material reads clearly,
//   - inspectable with orbit controls, and
//   - presented on a continuously rotating turntable.
import {
  createAuraApp,
  scene,
  model,
  prefabs,
  lights,
  effects,
  interactions,
  camera,
  timeline
} from "@aura3d/engine";
import { assets } from "./aura-assets";

// World anchor for the plinth + product so the stage, model and camera agree.
const STAGE_X = 0;
const STAGE_Z = -0.65;

const productScene = scene()
  // Neutral charcoal studio sweep behind the product.
  .background("#0b1117")

  // Studio product stage: curved backdrop, a thick inspection plinth, a soft
  // contact shadow, and softbox/rim cards. The plinth is the product base.
  .addMany(prefabs.productStage())

  // The hero asset. The engine fit-to-bounds normalizes the GLB (centers it on
  // X/Z, drops its base to the stage, and scales it to a consistent size), so
  // it always sits centered on top of the plinth regardless of source units.
  // A non-"float"/"pulse" clip drives a clean, continuous turntable spin.
  .add(
    model(assets.sneaker, { name: "studio sneaker", castShadow: true, receiveShadow: true })
      .position(STAGE_X, 0.12, STAGE_Z)
      .animate({ clip: "turntable", loop: true, speed: 0.5 })
  )

  // Multi-angle studio lighting rig: soft ambient base + cool key, front fill,
  // and a warm back rim so the sneaker's materials are readable from any angle.
  .add(lights.ambient({ intensity: 0.32, color: "#e9f1ff" }))
  .add(lights.studio({ intensity: 1.15 }))
  .add(lights.point({ name: "cool key softbox", position: [-2.3, 2.6, 2.4], color: "#eef6ff", intensity: 2.7 }))
  .add(lights.point({ name: "front fill", position: [0.4, 1.4, 2.6], color: "#f7fbff", intensity: 1.7 }))
  .add(lights.point({ name: "warm rim", position: [2.4, 1.9, -0.6], color: "#ffd5a2", intensity: 1.3 }))

  // A touch of bloom lifts the studio highlights without washing the product.
  .add(effects.bloom({ intensity: 0.16, color: "#cfeaff" }))

  // Orbit controls for product inspection.
  .add(interactions.orbit())

  // Orbit camera framed on the product, slightly above eye level.
  .camera(camera.orbit({ distance: 3.5, target: [STAGE_X, 0.62, STAGE_Z], fov: 42 }))

  // Drive the turntable + render loop.
  .timeline(timeline.loop({ seconds: 12 }));

createAuraApp("#app", {
  scene: productScene,
  diagnostics: { overlay: true, assetPanel: true }
});
