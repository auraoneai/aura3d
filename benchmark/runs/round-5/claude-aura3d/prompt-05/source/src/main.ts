import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

// Recipe 05 (3D Data Visualization): 6x6 grid of animated, height-colored bars
// with orbit camera and hover-highlight. The dataBars3D prefab renders 36 bars
// whose heights vary, colors correspond to height, pulse-animate on load, and
// expose pointer hover-highlight; it also lays down X / Z / height axis rails.
createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
});

// Small readable axis-label overlay (CSS only), alongside the in-scene axis rails.
document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML("afterend", `
  <div class="axis-labels">
    <div class="axis-title">6&times;6 Bar Chart</div>
    <ul>
      <li><span class="swatch value"></span>Value / Height (Y)</li>
      <li><span class="swatch x"></span>Category X axis</li>
      <li><span class="swatch z"></span>Category Z axis</li>
    </ul>
    <p class="hint">Drag to orbit &middot; hover a bar to highlight it</p>
  </div>
`);
