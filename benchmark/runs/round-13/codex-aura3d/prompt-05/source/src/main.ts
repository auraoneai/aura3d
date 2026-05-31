import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";

ui.html("#app", `
  <section
    aria-label="3D data visualization labels"
    style="
      position: absolute;
      inset: 16px auto auto 16px;
      z-index: 20;
      max-width: min(460px, calc(100vw - 32px));
      color: #f8fafc;
      background: rgba(3, 7, 18, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 8px;
      padding: 10px 12px;
      font: 700 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
    "
  >
    <div style="font-size: 15px;">6x6 Revenue Height Grid</div>
    <div>X axis: categories X1-X6 | Z axis: regions Z1-Z6 | Height axis: value 0-100</div>
    <div>Height ticks: 25, 50, 75, 100 | color scale: blue low, yellow mid, red high</div>
    <div id="bar-readout">Hover highlight enabled; default selected bar: row 6 col 6, value 100.</div>
  </section>

  <section
    aria-label="axis labels"
    style="
      position: absolute;
      right: 16px;
      bottom: 16px;
      z-index: 20;
      display: grid;
      gap: 6px;
      color: #e2e8f0;
      background: rgba(3, 7, 18, 0.68);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 8px;
      padding: 9px 11px;
      font: 700 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    "
  >
    <span>X1 X2 X3 X4 X5 X6</span>
    <span>Z1 Z2 Z3 Z4 Z5 Z6</span>
    <span>Orbit camera active; drag to inspect all 36 animated bars.</span>
  </section>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6, selected: { row: 6, col: 6 } }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.8, target: [0, 1.0, 0] }))
});
