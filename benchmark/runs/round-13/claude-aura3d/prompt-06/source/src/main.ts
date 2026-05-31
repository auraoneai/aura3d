import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  timeline,
  ui
} from "@aura3d/engine";

// Score HUD + aim/shoot interaction overlay.
ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.76);color:white;font:700 14px system-ui">
    strokes: <span id="strokes">1</span> | power: medium
  </div>
  <button id="shoot" type="button" style="position:absolute;left:18px;top:58px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(8,47,73,.82);color:white;font:700 14px system-ui">
    aim and shoot
  </button>
`);

let strokes = 1;
ui.onClick("#shoot", () => {
  strokes += 1;
  ui.setText("#strokes", strokes);
});

createAuraApp("#app", {
  scene: scene()
    .background("#7dd3fc")
    .addMany(prefabs.miniGolfHole())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2, target: [-0.9, 0.08, 0.1], fov: 48 }))
    .timeline(timeline.loop({ seconds: 5 }))
});
