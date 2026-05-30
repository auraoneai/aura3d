// Particle Fountain — Aura3D + an aligned particle overlay.
//
// Layer 1 (Aura3D): ground plane, emitter, lights, bloom, fixed camera.
// Layer 2 (overlay): gravity-driven particles, coloured by lifetime, colliding
//   against the ground, emitted from the nozzle at a controllable rate.
// Both layers share the same camera (see config.ts) so they line up.

import { createAuraApp, type AuraApp } from "@aura3d/engine";
import { buildFountainScene } from "./aura-scene";
import { createFountain } from "./fountain";
import { FOUNTAIN } from "./config";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app container");
app.innerHTML = "";

// Two stacked canvases.
const auraCanvas = document.createElement("canvas");
auraCanvas.id = "aura-canvas";
auraCanvas.className = "stage-canvas";

const fxCanvas = document.createElement("canvas");
fxCanvas.id = "fx-canvas";
fxCanvas.className = "stage-canvas";

app.append(auraCanvas, fxCanvas);

// Control panel.
const panel = document.createElement("div");
panel.className = "panel";
panel.innerHTML = `
  <h1>Particle Fountain</h1>
  <p class="sub">Gravity-fed particles erupt from the glowing emitter, arc upward,
  and fall back to collide with the ground plane.</p>
  <div class="control-row">
    <label for="rate">Emission rate</label>
    <span class="value"><span id="rate-val">${FOUNTAIN.rateDefault}</span> /s</span>
  </div>
  <input id="rate" type="range" min="0" max="${FOUNTAIN.rateMax}" step="10"
         value="${FOUNTAIN.rateDefault}" />
  <div class="legend">
    <span>young</span><span class="bar"></span><span>old</span>
  </div>
  <div class="stats">
    <span id="active">0</span> live particles · <span id="fps">0</span> fps
  </div>
`;
app.append(panel);

const fountain = createFountain(fxCanvas);

// Optional initial emission rate via ?rate=N (clamped), handy for demos/tests.
const rateParam = Number(new URLSearchParams(location.search).get("rate"));
const initialRate =
  Number.isFinite(rateParam) && rateParam >= 0
    ? Math.min(FOUNTAIN.rateMax, rateParam)
    : FOUNTAIN.rateDefault;
fountain.setRate(initialRate);

// Build / rebuild the Aura3D scene and mirror its canvas size onto the overlay.
const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
let auraApp: AuraApp | null = null;

function buildAura(): void {
  auraApp?.dispose();
  auraApp = createAuraApp(auraCanvas, {
    scene: buildFountainScene(),
    pixelRatio,
    resize: true,
  });
  // configureCanvas has now set the Aura canvas buffer dims synchronously.
  fountain.resize(auraCanvas.width, auraCanvas.height);
}

buildAura();

// Emission-rate control.
const rateInput = panel.querySelector<HTMLInputElement>("#rate")!;
const rateVal = panel.querySelector<HTMLSpanElement>("#rate-val")!;
rateInput.value = String(initialRate);
rateVal.textContent = String(initialRate);
rateInput.addEventListener("input", () => {
  const v = Number(rateInput.value);
  fountain.setRate(v);
  rateVal.textContent = String(v);
});

// HUD.
const activeEl = panel.querySelector<HTMLSpanElement>("#active")!;
const fpsEl = panel.querySelector<HTMLSpanElement>("#fps")!;
let fpsLast = performance.now();
let fpsFrames = 0;

function loop(now: number): void {
  fountain.frame(now);
  fpsFrames++;
  if (now - fpsLast >= 500) {
    fpsEl.textContent = String(Math.round((fpsFrames * 1000) / (now - fpsLast)));
    fpsLast = now;
    fpsFrames = 0;
    activeEl.textContent = String(fountain.getActiveCount());
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Keep both layers aligned on resize. Aura3D's renderer only sizes its canvas at
// construction, so we rebuild it, then re-mirror the dims onto the overlay.
let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => buildAura(), 150);
});
