import {
  camera,
  createAuraApp,
  lights,
  prefabs,
  scene,
  ui,
  type AuraApp
} from "@aura3d/engine";

// Emission rate maps to the particle count of the fountain prefab. The prefab
// already provides the upward-and-falling arc, lifetime color variation, the
// emitter, and a ground plane the particles collide against.
const MIN_RATE = 400;
const MAX_RATE = 4000;
let rate = 2400;

// A dedicated stage container holds the canvas so rebuilding the fountain never
// disturbs the HUD overlay.
ui.html("#app", `<div id="stage" style="position:absolute;inset:0"></div>`);

ui.html(
  "#app",
  `
  <div style="position:absolute;left:18px;top:18px;z-index:20;display:grid;gap:6px;padding:12px 14px;border-radius:10px;background:rgba(8,15,30,.78);color:#e6edf6;font:600 13px system-ui;backdrop-filter:blur(4px)">
    <label for="rate" style="letter-spacing:.02em">emission rate: <b id="rateValue">${rate}</b> particles</label>
    <input id="rate" type="range" min="${MIN_RATE}" max="${MAX_RATE}" step="100" value="${rate}" style="width:220px;accent-color:#38d6ff" />
  </div>
`
);

function buildScene(count: number) {
  return scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }));
}

let app: AuraApp = createAuraApp("#stage", { scene: buildScene(rate) });

const slider = document.querySelector<HTMLInputElement>("#rate");
if (slider) {
  // Live label feedback while dragging.
  slider.addEventListener("input", () => {
    ui.setText("#rateValue", slider.value);
  });
  // Rebuild the fountain at the new emission rate on release (a discrete user
  // action, not a per-frame loop).
  slider.addEventListener("change", () => {
    rate = Number(slider.value);
    app.dispose();
    app = createAuraApp("#stage", { scene: buildScene(rate) });
  });
}
