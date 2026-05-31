import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  prefabs,
  scene,
  timeline,
  ui
} from "@aura3d/engine";

ui.html("#app", `
  <div style="position:absolute;right:18px;top:18px;z-index:20;display:grid;gap:6px;padding:10px 12px;border-radius:8px;background:rgba(2,6,23,.68);color:white;font:700 13px system-ui;line-height:1.15;box-shadow:0 0 24px rgba(250,204,21,.18)">
    <span style="color:#cbd5e1">Mercury</span>
    <span style="color:#fbbf24">Venus</span>
    <span style="color:#38bdf8">Earth</span>
    <span style="color:#f97316">Mars</span>
    <span style="color:#f5d0a9">Jupiter</span>
    <span style="color:#fde68a">Saturn</span>
  </div>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.solarSystem())
    .add(lights.studio({ intensity: 0.82 }))
    .add(effects.bloom({ intensity: 0.55 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 7.2, target: [0, 0, 0] }))
    .timeline(timeline.loop({ seconds: 10 }))
});
