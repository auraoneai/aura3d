import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";

ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;padding:10px 12px;border-radius:8px;background:rgba(5,12,20,.78);color:white;font:700 13px/1.35 system-ui;letter-spacing:0;box-shadow:0 8px 24px rgba(0,0,0,.25)">
    6x6 revenue grid<br />
    <span style="font-weight:600;color:#a7f3d0">Hover a bar to highlight its metric</span>
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
