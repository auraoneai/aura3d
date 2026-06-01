import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  timeline,
  ui
} from "@aura3d/engine";

ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;max-width:min(520px,calc(100vw - 36px));color:white;background:rgba(3,7,18,.76);padding:10px 12px;border-radius:8px;font:700 13px/1.45 system-ui, sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.28)">
    <div style="font-size:15px">3D Data Visualization - 6x6 animated height grid</div>
    <div>X axis: columns X1-X6 | Z axis: rows Z1-Z6 | Height axis ticks: 0, 25, 50, 75, 100</div>
    <div>Color scale: short bars blue/green, mid bars yellow, tall bars orange/red</div>
    <span id="bar-readout">hover highlight enabled; selected bar: row 6 col 6 value 100; orbit camera enabled</span>
  </div>
`);

const dataScene = scene()
  .background("#071017")
  .addMany(prefabs.dataBars3D({ grid: 6 }))
  .add(lights.studio({ intensity: 1.1 }))
  .add(interactions.orbit())
  .add(interactions.raycastHover({
    target: "height-colored data bar 6-6",
    selected: "height-colored data bar 6-6"
  }))
  .camera(camera.charts())
  .timeline(timeline.loop({ seconds: 8 }));

console.log(collectAuraSceneEvidence(dataScene));

createAuraApp("#app", {
  scene: dataScene
});
