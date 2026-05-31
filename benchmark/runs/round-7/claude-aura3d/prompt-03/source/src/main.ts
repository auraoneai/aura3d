import {
  camera,
  createAuraApp,
  lights,
  prefabs,
  scene,
  timeline,
  ui
} from "@aura3d/engine";

ui.html("#app", `
  <div style="position:absolute;right:18px;top:18px;display:grid;gap:6px;color:white;font:700 13px system-ui">
    <span style="color:#cbd5e1">Mercury</span><span style="color:#fbbf24">Venus</span>
    <span style="color:#38bdf8">Earth</span><span style="color:#f97316">Mars</span>
    <span style="color:#f5d0a9">Jupiter</span><span style="color:#fde68a">Saturn</span>
  </div>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.solarSystem())
    .add(lights.studio())
    .camera(camera.perspective({ position: [0, 3.8, 6.2], target: [0, 0, 0], fov: 46 }))
    .timeline(timeline.loop({ seconds: 10 }))
});
