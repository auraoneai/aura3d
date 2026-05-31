import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  ui,
} from "@aura3d/engine";

ui.html(
  "#app",
  `
    <div style="position:absolute;left:18px;top:18px;z-index:20;color:#f8fbff;font:700 13px system-ui,sans-serif;text-shadow:0 1px 8px rgba(0,0,0,.7);line-height:1.45">
      <div>X axis: columns</div>
      <div>Z axis: rows</div>
      <div>Height axis: value</div>
      <div style="margin-top:6px;color:#9be8ff">Hover a bar to highlight it and show its value.</div>
    </div>
  `,
);

createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] })),
});
