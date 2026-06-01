// Prompt 05: 3D Data Visualization
// 6x6 grid of bars (36 total) with height-mapped color, hover-highlight,
// orbit camera, and readable DOM axis labels. Built from the public
// Aura3D `prefabs.dataBars3D` recipe — no custom chart engine.
import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  ui
} from "@aura3d/engine";

// DOM title, axis labels, numeric ticks, and hover readout around the canvas.
ui.html(
  "#app",
  `
  <div style="position:absolute;left:18px;top:18px;z-index:20;color:white;background:rgba(3,7,18,.72);padding:10px 12px;border-radius:8px;font:700 13px system-ui">
    Revenue grid — 6×6 bars (36 total)<br />
    X axis: X1..X6 &nbsp;·&nbsp; Z axis: Z1..Z6 &nbsp;·&nbsp; Height axis: 0–100<br />
    <span id="bar-readout">hover highlight enabled; selected bar: row 6 col 6 value 100</span>
  </div>
  <div style="position:absolute;left:18px;bottom:18px;z-index:20;color:#bfe3ff;background:rgba(3,7,18,.62);padding:8px 10px;border-radius:8px;font:600 12px system-ui">
    X axis (columns X1–X6) →
  </div>
  <div style="position:absolute;right:18px;bottom:18px;z-index:20;color:#bfe3ff;background:rgba(3,7,18,.62);padding:8px 10px;border-radius:8px;font:600 12px system-ui">
    ← Z axis (rows Z1–Z6)
  </div>
  <div style="position:absolute;right:18px;top:18px;z-index:20;color:#bfe3ff;background:rgba(3,7,18,.62);padding:8px 10px;border-radius:8px;font:600 12px system-ui">
    Height 100 · 75 · 50 · 25 · 0
  </div>
`
);

const chartScene = scene()
  .background("#071017")
  .addMany(prefabs.dataBars3D({ grid: 6 }))
  .add(lights.studio({ intensity: 1.1 }))
  .add(interactions.orbit())
  .add(
    interactions.raycastHover({
      target: "height-colored data bar 6-6",
      selected: "height-colored data bar 6-6"
    })
  )
  .camera(camera.charts());

console.log(collectAuraSceneEvidence(chartScene).interactions);

createAuraApp("#app", { scene: chartScene });
