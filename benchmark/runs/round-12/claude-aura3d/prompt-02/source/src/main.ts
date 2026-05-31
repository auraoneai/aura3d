import { camera, createAuraApp, lights, prefabs, scene, ui } from "@aura3d/engine";

ui.html(
  "#app",
  `
  <button id="rate" type="button" style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.78);color:white;font:700 14px system-ui;border:0;cursor:pointer">
    emission rate: high
  </button>
`
);

let highRate = true;
ui.onClick("#rate", (button) => {
  highRate = !highRate;
  ui.setText(button, highRate ? "emission rate: high" : "emission rate: low");
});

createAuraApp("#app", {
  scene: scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 2400 }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
});
