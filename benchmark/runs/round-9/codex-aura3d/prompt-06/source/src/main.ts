import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";

ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;display:grid;gap:6px;padding:10px 12px;border-radius:8px;background:rgba(15,23,42,.78);color:white;font:700 14px system-ui;box-shadow:0 10px 24px rgba(15,23,42,.22)">
    <span>strokes: <span id="strokes">0</span></span>
    <span style="font-weight:600;color:#dbeafe">click and drag to aim, release to shoot</span>
  </div>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#7dd3fc")
    .addMany(prefabs.miniGolfHole())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2, target: [-0.9, 0.08, 0.1], fov: 48 }))
});
