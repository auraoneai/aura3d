// Prompt 02: Particle Fountain
// Recipe source: docs/agents/benchmark-recipes.md -> "02 Particle Fountain".
// Prompt-required edits only: a clearly visible ground plane the particles
// collide against, and a visible emission-rate control.
import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  ui
} from "@aura3d/engine";

// Emission-rate control: a visible slider that drives the fountain particle
// count (particles emitted per cycle). The default seeds the initial scene.
const MIN_RATE = 600;
const MAX_RATE = 4200;
const DEFAULT_RATE = 2400;

ui.html(
  "#app",
  `
  <div style="position:absolute;left:18px;top:18px;z-index:20;display:grid;gap:8px;padding:12px 14px;border-radius:10px;background:rgba(3,7,17,.72);color:#e8f6ff;font:600 13px system-ui;min-width:230px">
    <span style="letter-spacing:.04em;text-transform:uppercase;color:#7dfcff">Particle Fountain</span>
    <label for="emission-rate" style="display:flex;justify-content:space-between;gap:12px">
      <span>Emission rate</span><b id="emission-readout">${DEFAULT_RATE}/s</b>
    </label>
    <input id="emission-rate" type="range" min="${MIN_RATE}" max="${MAX_RATE}" step="100" value="${DEFAULT_RATE}" style="width:100%;accent-color:#7dfcff" />
  </div>
`
);

const rateSlider = ui.root("#emission-rate") as HTMLInputElement;
rateSlider.addEventListener("input", () => {
  ui.setText("#emission-readout", `${rateSlider.value}/s`);
});

createAuraApp("#app", {
  scene: scene()
    .background("#030711")
    // Wide ground plane the gravity-affected particles fall back onto.
    .add(
      primitives
        .plane({
          name: "fountain ground plane",
          material: material.pbr({ color: "#0c1726", roughness: 0.82, metallic: 0.04 })
        })
        .position(0, 0, 0)
        .scale([9, 1, 9])
    )
    // High-density fountain: emitter base, upward/falling arcs, lifetime color.
    .addMany(prefabs.particleFountain({ count: DEFAULT_RATE }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
});
