import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  model,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";
import { assets } from "./aura-assets";

import "./style.css";

const plinthMaterial = material.pbr({
  color: "#d9dde0",
  roughness: 0.34,
  metallic: 0.08
});

const viewerScene = scene()
  .background("#0b0e10")
  .add(
    primitives.plane({
      name: "matte studio floor",
      material: material.pbr({ color: "#202529", roughness: 0.62, metallic: 0.02 })
    })
      .position(0, -0.04, 0)
      .scale([6.2, 1, 4.6])
  )
  .add(
    primitives.plane({
      name: "dark rear studio sweep",
      material: material.emissive({ color: "#13191f", emissive: "#18222a" })
    })
      .position(0, 1.56, -2.08)
      .rotate(1.5708, 0, 0)
      .scale([6.2, 1, 3.1])
  )
  .add(
    primitives.box({
      name: "round turntable plinth core",
      material: plinthMaterial
    })
      .position(0, 0.04, 0)
      .scale([1.95, 0.16, 1.18])
  )
  .add(
    primitives.box({
      name: "turntable top highlight",
      material: material.pbr({ color: "#f4f6f7", roughness: 0.28, metallic: 0.12 })
    })
      .position(0, 0.14, 0)
      .scale([1.72, 0.035, 1.02])
  )
  .add(
    primitives.box({
      name: "front turntable index mark",
      material: material.emissive({ color: "#6fe4ff", emissive: "#77e8ff" })
    })
      .position(0, 0.175, 0.54)
      .scale([0.34, 0.012, 0.035])
  )
  .add(
    primitives.box({
      name: "left softbox reflection card",
      material: material.emissive({ color: "#f2f7ff", emissive: "#f2f7ff" })
    })
      .position(-2.18, 1.18, -0.4)
      .rotate(0, 0.26, 0)
      .scale([0.07, 1.52, 1.5])
  )
  .add(
    primitives.box({
      name: "right warm rim card",
      material: material.emissive({ color: "#ffd0a3", emissive: "#ffc18a" })
    })
      .position(2.1, 0.92, -0.68)
      .rotate(0, -0.23, 0)
      .scale([0.07, 1.05, 1.22])
  )
  .add(
    primitives.box({
      name: "overhead strip softbox",
      material: material.emissive({ color: "#e7f0ff", emissive: "#f4f8ff" })
    })
      .position(0, 2.08, -0.72)
      .scale([1.75, 0.055, 0.13])
  )
  .add(
    model(assets.sneaker, {
      name: "centered auto-scaled sneaker",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0.19, 0)
      .rotate(-0.05, -0.64, 0)
      .scale(1.05)
  )
  .add(lights.ambient({ intensity: 0.33, color: "#f1f6ff" }))
  .add(lights.studio({ intensity: 1.35 }))
  .add(lights.point({ name: "large left key", position: [-2.4, 2.6, 2.1], color: "#f4f8ff", intensity: 2.7 }))
  .add(lights.point({ name: "front fill", position: [0.15, 1.25, 2.45], color: "#ffffff", intensity: 1.45 }))
  .add(lights.point({ name: "warm rear rim", position: [2.2, 1.65, 0.2], color: "#ffc991", intensity: 1.15 }))
  .add(effects.bloom({ intensity: 0.16, color: "#cfefff" }))
  .add(interactions.orbit({ target: "centered auto-scaled sneaker" }))
  .camera(camera.orbit({ distance: 3.35, target: [0, 0.72, 0], fov: 38 }))
  .timeline(timeline.loop({ seconds: 9 }));

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: viewerScene
});
