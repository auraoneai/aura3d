import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div class="axis-label axis-label--x">X: category 1-6</div>
  <div class="axis-label axis-label--z">Z: series 1-6</div>
  <div class="axis-label axis-label--height">Height</div>
  <div class="height-key" aria-label="height color key">
    <span>low</span>
    <i></i>
    <span>high</span>
  </div>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
});
