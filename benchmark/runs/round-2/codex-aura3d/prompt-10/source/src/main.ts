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

import type { AuraVec3 } from "@aura3d/engine";

const appStyles = document.createElement("style");
appStyles.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #070b10;
  }

  #app {
    position: fixed;
    inset: 0;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
`;
document.head.append(appStyles);

const bounds = assets.sneaker.bounds ?? ([2, 2, 2] as const);
const maxExtent = Math.max(...bounds);
const targetDisplaySize = 1.74;
const autoScale = targetDisplaySize / maxExtent;
const plinthCenter: AuraVec3 = [0, 0.03, -0.65];
const sneakerCenter: AuraVec3 = [0, 0.18, -0.65];

const productViewerScene = scene()
  .background("#070b10")
  .addMany(prefabs.productStage())
  .add(
    primitives.cylinder({
      name: "rotating turntable disk",
      material: material.clearcoat({
        color: "#222a33",
        roughness: 0.16,
        metallic: 0.22
      })
    })
      .position(...plinthCenter)
      .scale([1.42, 0.12, 1.42])
      .animate({ clip: "turntable", speed: 0.55 })
  )
  .add(
    model(assets.sneaker, {
      name: "centered auto-scaled sneaker"
    })
      .position(...sneakerCenter)
      .rotate(-0.08, -0.32, 0.015)
      .scale(autoScale)
      .animate({ clip: "turntable", speed: 0.55 })
  )
  .add(lights.studio({ intensity: 1.25 }))
  .add(lights.ambient({ intensity: 0.24, color: "#e8f1ff" }))
  .add(
    lights.point({
      name: "large front softbox",
      position: [-2.1, 2.6, 2.25],
      color: "#f3f8ff",
      intensity: 2.8
    })
  )
  .add(
    lights.point({
      name: "warm rim light",
      position: [2.15, 1.7, 0.3],
      color: "#ffd39a",
      intensity: 1.35
    })
  )
  .add(
    lights.point({
      name: "low fill card bounce",
      position: [0.15, 0.7, 2.05],
      color: "#dff7ff",
      intensity: 1.15
    })
  )
  .add(effects.bloom({ intensity: 0.18, color: "#d9f0ff" }))
  .add(interactions.orbit({ target: "centered auto-scaled sneaker" }))
  .camera(
    camera.orbit({
      distance: 3.55,
      target: [0, 0.72, -0.65],
      fov: 39
    })
  )
  .timeline(timeline.loop({ seconds: 11 }));

createAuraApp("#app", {
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  scene: productViewerScene
});
