import {
  createAuraApp,
  scene,
  primitives,
  effects,
  lights,
  material,
  camera,
  type AuraApp,
} from "@aura3d/engine";

// --- Tunables -------------------------------------------------------------
// Particle base color (young particles); the engine blends each particle
// toward a warm accent over its arc, giving the visible lifetime gradient.
const PARTICLE_COLOR = "#39e0ff";
const FOUNTAIN_RADIUS = 1.55;
const FOUNTAIN_HEIGHT = 3.0;

/**
 * Build a complete particle-fountain scene for a given emission rate.
 *
 * The emission rate maps directly to the live particle population: a higher
 * rate keeps more particles in flight, reading as a denser, faster fountain.
 */
function buildScene(emissionRate: number) {
  return scene()
    .background("#060a12")
    // Soft studio fill plus a cyan key over the jet so the arc reads clearly.
    .add(lights.studio({ intensity: 1.1 }))
    .add(lights.point({ position: [0, 3.6, 0.4], color: PARTICLE_COLOR, intensity: 2.2 }))
    .add(lights.point({ position: [-2.4, 1.6, 2.2], color: "#ffd166", intensity: 0.9 }))
    // Ground plane the spray collides against and pools on.
    .add(
      primitives
        .plane({
          name: "ground plane",
          material: material.pbr({ color: "#10161f", roughness: 0.86, metallic: 0.05 }),
        })
        .position(0, 0, 0)
        .scale([18, 1, 18]),
    )
    // Splash/landing ring centered on the impact zone, flush with the ground.
    .add(
      primitives
        .cylinder({
          name: "splash landing ring",
          material: material.pbr({ color: "#19283a", roughness: 0.55, metallic: 0.08 }),
        })
        .position(0, 0.012, 0)
        .scale([3.4, 0.02, 3.4]),
    )
    // Emitter housing — the identifiable point the fountain sprays from.
    .add(
      primitives
        .cylinder({
          name: "fountain emitter base",
          material: material.metal({ color: "#2c3d50", roughness: 0.22 }),
        })
        .position(0, 0.07, 0)
        .scale([0.7, 0.14, 0.7]),
    )
    // Glowing nozzle core at the emission origin.
    .add(
      primitives
        .sphere({
          name: "emitter nozzle glow",
          material: material.emissive({ color: "#aafff0", emissive: PARTICLE_COLOR }),
        })
        .position(0, 0.2, 0)
        .scale(0.17),
    )
    // The fountain itself: gravity-style upward-then-falling particle arcs,
    // colored across their lifetime.
    .add(
      effects.particles({
        name: "gravity fountain particles",
        emitter: "fountain",
        color: PARTICLE_COLOR,
        particleCount: emissionRate,
        radius: FOUNTAIN_RADIUS,
        height: FOUNTAIN_HEIGHT,
        intensity: 1.35,
        speed: 1.05,
      }),
    )
    .add(effects.bloom({ intensity: 0.5, color: PARTICLE_COLOR }))
    .camera(camera.orbit({ distance: 6.6, target: [0, 1.3, 0] }));
}

// --- Runtime wiring --------------------------------------------------------
const stage = document.querySelector<HTMLElement>("#stage");
const slider = document.querySelector<HTMLInputElement>("#rate");
const rateValue = document.querySelector<HTMLElement>("#rate-value");

if (!stage || !slider || !rateValue) {
  throw new Error("Particle fountain UI failed to mount: missing #stage / #rate.");
}

// One persistent canvas, reused across rebuilds. Reusing the element keeps the
// same WebGL context alive instead of leaking a new one on every slider change.
const canvas = document.createElement("canvas");
stage.append(canvas);

let app: AuraApp | null = null;

/** (Re)create the Aura3D app with the requested emission rate. */
function mount(rate: number): void {
  app?.dispose();
  app = createAuraApp(canvas, {
    scene: buildScene(rate),
    diagnostics: false,
  });
}

const currentRate = (): number => Number.parseInt(slider!.value, 10);

// Debounce structural rebuilds so dragging the slider stays smooth and we
// never tear down / recreate the renderer on every input frame.
let rebuildTimer: number | undefined;
function scheduleRebuild(): void {
  if (rebuildTimer !== undefined) window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => mount(currentRate()), 140);
}

slider.addEventListener("input", () => {
  rateValue!.textContent = slider!.value;
  scheduleRebuild();
});

// Keep the render resolution crisp when the window is resized.
let resizeTimer: number | undefined;
window.addEventListener("resize", () => {
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => mount(currentRate()), 200);
});

rateValue.textContent = slider.value;
mount(currentRate());
