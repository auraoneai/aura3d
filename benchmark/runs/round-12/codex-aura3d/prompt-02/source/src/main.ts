import { camera, createAuraApp, lights, prefabs, scene, ui } from "@aura3d/engine";

ui.html("#app", `
  <button
    id="rate"
    type="button"
    aria-pressed="true"
    style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border:1px solid rgba(148,163,184,.55);border-radius:8px;background:rgba(15,23,42,.78);color:white;font:700 14px system-ui;box-shadow:0 10px 24px rgba(0,0,0,.28)"
  >
    emission rate: high
  </button>
`);

let highRate = true;
ui.onClick("#rate", (button) => {
  highRate = !highRate;
  ui.setText(button, highRate ? "emission rate: high" : "emission rate: low");
  ui.setPressed(button, highRate);
});

createAuraApp("#app", {
  scene: scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 2400 }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
});
