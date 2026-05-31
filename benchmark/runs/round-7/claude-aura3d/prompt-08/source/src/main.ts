import {
  camera,
  createAuraApp,
  effects,
  lights,
  prefabs,
  scene,
  ui,
} from "@aura3d/engine";

// Prompt 08 — Procedural City Block.
// Recipe #08 shape (prefabs.cityBlock) with the prompt-required edit: the
// day/night toggle actually rebuilds the scene so lighting AND sky change.

// Shared camera framing so day and night line up across the toggle.
const cityCamera = () =>
  camera.perspective({ position: [0, 3.6, 7.2], target: [0, 0.55, -0.8] });

// 20 box buildings of varying heights with lit windows + streets + lamps.
const cityBlock = () => prefabs.cityBlock({ blocks: 20, litWindows: true });

function dayScene() {
  return scene()
    .background("#87ceeb") // bright daytime sky
    .addMany(cityBlock())
    .add(lights.studio({ intensity: 1.1 }))
    .add(lights.directional({ position: [8, 12, 6], color: "#fff4e0", intensity: 1.05 }))
    .add(effects.fog({ density: 0.02 }))
    .camera(cityCamera());
}

function nightScene() {
  return scene()
    .background("#060912") // dark night sky
    .addMany(cityBlock())
    .add(lights.ambient({ intensity: 0.18, color: "#1a2540" }))
    .add(lights.point({ position: [0, 8, 0], color: "#9fb8ff", intensity: 0.7 }))
    .add(effects.fog({ density: 0.05 }))
    .add(effects.bloom({ intensity: 0.45 })) // makes lit windows + lamps glow
    .camera(cityCamera());
}

// Dedicated stage element for the 3D scene so re-rendering on toggle never
// disturbs the overlay button.
const root = document.querySelector("#app");
const stage = document.createElement("div");
stage.id = "stage";
stage.style.cssText = "position:absolute;inset:0;";

let isNight = false;

function render() {
  stage.replaceChildren();
  createAuraApp("#stage", { scene: isNight ? nightScene() : dayScene() });
}

// Visible day/night toggle overlay.
ui.html(
  "#app",
  `<button class="toggle" type="button" style="position:absolute;top:16px;left:16px;z-index:10;padding:10px 16px;font:600 14px system-ui,sans-serif;color:#fff;background:rgba(15,23,42,0.82);border:1px solid rgba(255,255,255,0.25);border-radius:8px;cursor:pointer;">switch to night</button>`,
);

if (root) root.appendChild(stage);

ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  ui.setText(button, isNight ? "switch to day" : "switch to night");
  ui.setPressed(button, isNight);
  render();
});

render();
