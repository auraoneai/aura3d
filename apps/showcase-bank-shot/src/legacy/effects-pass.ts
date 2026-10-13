// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Public engine builders only, each on a runtime path that
// the default `post` / `vfx` / `lighting` flags enable; flags-off keeps the
// pre-pass hall haze so that arm never pays the CPU volumetric-light pass.
//
// Look brief (sports/table, interior-warm): late-night pool room, warm lamp
// pools over a saturated felt, slate shadows. Families: shadowed lamp key +
// renderer-owned ball contact patches, cheap distance haze, dust
// motes in the lamp cone, indoor IBL on the lacquered balls and walnut rails,
// grade + vignette.
import { effects, environments, lights } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

export function bankShotEffectsPass() {
  const legacyHaze = effects.fog({
    name: "hall haze",
    density: 0.011,
    color: "#10182a",
    intensity: 0.16
  });
  if (!effectsPassOn) return [legacyHaze];
  return [
    // Lamp key: a steep warm directional standing in for the pendant bank,
    // the strongest directional so it owns the shadow cascades (balls and cue
    // throw shadows on the felt) and the god-ray direction.
    lights.directional({
      name: "pendant bank shadow key",
      position: [-0.6, 5.2, 1.4],
      target: [0, 0, 0],
      color: "#dff3e6",
      intensity: 2.15,
      shadow: { cascades: 1, mapSize: 1024, filter: "pcf", maxDistance: 12 }
    }),
    // Indoor IBL: reflections on ball lacquer, rails and the cue ferrule.
    environments.preset("indoor", { intensity: 0.65, specularIntensity: 1.15, background: false, color: "#cfe8d8" }),
    // Plain distance haze (cheap) — the volumetric pass cost a full-screen
    // raymarch for a barely visible cone; the room simply falls to dark.
    effects.fog({
      name: "pool hall lamp haze",
      density: 0.014,
      color: "#0d0f16",
      intensity: 0.18
    }),
    effects.colorGrade({ saturation: 1.3, contrast: 1.18 }),
    effects.vignette({ intensity: 0.52, smoothness: 1.8 }),
    ...(vfxOn
      ? [
          // Dust motes rising slowly through the lamp pool over the table
          // (fountain plume preset: a wide spawn disc, low column).
          effects.particles({
            name: "lamp pool dust motes",
            emitter: "fountain",
            particleCount: 36,
            emissionRate: 8,
            radius: 1.3,
            height: 1.1,
            size: [0.008, 0.02],
            lifetime: [4, 5.5],
            color: "#ffe2b0",
            materialMode: "soft-alpha",
            seed: 5201
          }).position(0, 0.05, 0)
        ]
      : [])
  ] as const;
}
