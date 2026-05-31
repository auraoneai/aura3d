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

ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;display:flex;gap:12px;align-items:center;padding:9px 12px;border-radius:8px;background:rgba(14,44,26,.82);color:white;font:700 14px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.18)">
    <span>strokes: <span id="strokes">0</span></span>
    <span>power: <span id="power">medium</span></span>
  </div>
  <button id="shoot" type="button" style="position:absolute;left:18px;top:62px;z-index:20;padding:9px 12px;border:0;border-radius:8px;background:rgba(6,95,70,.9);color:white;font:700 14px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer">
    aim and shoot
  </button>
`);

let strokes = 0;
const powers = ["medium", "firm", "soft"] as const;

ui.onClick("#shoot", () => {
  strokes += 1;
  ui.setText("#strokes", strokes);
  ui.setText("#power", powers[strokes % powers.length]);
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
