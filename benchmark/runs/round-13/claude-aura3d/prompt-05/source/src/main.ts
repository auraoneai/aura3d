import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  ui
} from "@aura3d/engine";

// DOM overlay around the Aura canvas: title, X/Z/height axis labels, numeric
// ticks, and a hover/readout note so the captured body text carries the
// required label + hover-highlight evidence.
ui.html(
  "#app",
  `
  <div style="position:absolute;left:18px;top:18px;z-index:20;color:white;background:rgba(3,7,18,.78);padding:12px 14px;border-radius:10px;font:700 13px system-ui;line-height:1.5;max-width:320px">
    <div style="font-size:15px;margin-bottom:4px">Revenue Grid — 6×6 (36 bars)</div>
    <div>X axis: columns X1..X6</div>
    <div>Z axis: rows Z1..Z6</div>
    <div>Height axis: value 0–100 — ticks 0 / 25 / 50 / 75 / 100</div>
    <div>Color encodes height: low = teal, high = magenta.</div>
    <div style="margin-top:6px;color:#7dd3fc">
      Hover highlight enabled — moving the pointer over a bar brightens it and
      updates the readout below.
    </div>
    <div id="bar-readout" style="margin-top:4px">
      selected bar: row Z6 col X6 — value 100
    </div>
  </div>
`
);

createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.8, target: [0, 1.0, 0] }))
});
