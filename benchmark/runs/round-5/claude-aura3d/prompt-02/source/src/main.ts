import {
  camera,
  createAuraApp,
  lights,
  material,
  prefabs,
  primitives,
  scene
} from "@aura3d/engine";
import "./style.css";

// --- Emission-rate control (visible DOM overlay) -------------------------
const MIN_RATE = 400;
const MAX_RATE = 6000;
const DEFAULT_RATE = 2400;

document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML(
  "afterend",
  `
  <div class="hud">
    <label for="rate">Emission rate</label>
    <input id="rate" type="range" min="${MIN_RATE}" max="${MAX_RATE}" step="100" value="${DEFAULT_RATE}" />
    <span><b id="rateValue">${DEFAULT_RATE}</b> particles</span>
  </div>
`
);

// --- Scene: gravity-affected fountain + ground plane ---------------------
// prefabs.particleFountain emits particles upward from a point, applies
// gravity (upward-and-falling arc), varies color by lifetime, and collides
// against a ground. We add an explicit ground plane so the collision floor
// is clearly visible, and the slider rebuilds the fountain with a new count.
function buildScene(count: number) {
  return scene()
    .background("#030711")
    .add(
      primitives
        .plane({
          size: 14,
          material: material.rubber({ color: "#0b1830", roughness: 0.95 })
        })
        .position(0, -0.02, 0)
    )
    .addMany(prefabs.particleFountain({ count }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }));
}

let app = createAuraApp("#app", { scene: buildScene(DEFAULT_RATE) });

// --- Wire the emission-rate control --------------------------------------
const slider = document.querySelector<HTMLInputElement>("#rate")!;
const rateValue = document.querySelector<HTMLElement>("#rateValue")!;

slider.addEventListener("input", () => {
  rateValue.textContent = slider.value;
});

// Rebuild the fountain only on a discrete change (never per animation frame).
slider.addEventListener("change", () => {
  const count = Number(slider.value);
  app.dispose();
  app = createAuraApp("#app", { scene: buildScene(count) });
});
