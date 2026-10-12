// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Public engine builders only, each on a runtime path that
// the default `post` / `vfx` / `lighting` flags enable; flags-off keeps the
// pre-pass particle haze (and never pays the CPU volumetric-light pass).
//
// Look brief (underwater): teal water column, sun shafts from the surface,
// marine snow drifting through the searchlight, warm wreck practicals as the
// focal accents. Families: shadowed surface key + contact shadows,
// volumetric water in-scatter (god rays) with height falloff, sun-shaft light
// cones, marine snow + vent bubbles, night IBL on the hull, grade + vignette.
import { effects, environments, lights } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

const SHAFTS = [
  // In front of the default follow camera (sub at 0,-6,0; camera at about
  // 6.4,3.2,-15.4 looking +z and down towards -2,-9,-5).
  { position: [-5, 3, 2] as const, angle: 0.24, intensity: 0.45 },
  { position: [2.5, 3, 7] as const, angle: 0.3, intensity: 0.5 },
  { position: [-1, 3, -3] as const, angle: 0.2, intensity: 0.38 }
];

export function deepRecoveryEffectsPass() {
  if (!effectsPassOn) {
    return [effects.fog({ name: "deep recovery suspended-particle haze", color: "#0a2e3a", density: 0.02, intensity: 0.42 })];
  }
  return [
    // Surface sun key (strongest directional): owns the shadow cascades on
    // the sea floor and wreck, and the god-ray direction.
    lights.directional({
      name: "surface sun shadow key",
      position: [12, 30, 8],
      target: [0, -10, -6],
      color: "#a8e6df",
      intensity: 1.0,
      shadow: { cascades: "auto", maxDistance: 60 }
    }),
    effects.contactShadows({ length: 0.4, intensity: 0.8 }),
    // The pre-pass suspended-particle exp2 haze stays: it is what keeps the
    // far basin dark so the lit subject carries the frame.
    effects.fog({ name: "deep recovery suspended-particle haze", color: "#0a2e3a", density: 0.017, intensity: 0.42 }),
    environments.preset("night", { intensity: 0.4, specularIntensity: 1.2, background: false }),
    // Water column: denser with depth below the surface reference, forward
    // in-scatter towards the sun.
    effects.volumetricFog({
      name: "deep recovery water column",
      density: 0.012,
      color: "#12485a",
      intensity: 0.3,
      volumetricQuality: "balanced",
      heightFalloff: 0.06,
      heightReference: 0
    }),
    effects.vignette({ intensity: 0.22, smoothness: 1.8 }),
    ...(vfxOn
      ? [
          ...SHAFTS.map((shaft, index) =>
            effects.lightCone({
              name: `surface sun shaft ${index + 1}`,
              position: shaft.position,
              direction: [-0.18, -1, -0.1],
              length: 24,
              coneAngle: shaft.angle,
              softness: 0.75,
              color: "#9ff3e6",
              intensity: shaft.intensity
            })
          ),
          // Marine snow: flakes scattered outward from the basin centre, then
          // drag-damped and sinking slowly through the water column.
          effects.particles({
            name: "marine snow",
            emitter: "ambient",
            particleCount: 420,
            emissionRate: 95,
            speed: 2.6,
            drag: 0.55,
            gravity: -0.25,
            size: [0.06, 0.14],
            lifetime: [4, 6],
            color: "#bfe9e2",
            materialMode: "soft-alpha",
            seed: 7402
          }).position(-1, -5, -6),
          // Bubble column off the chapel wreck vents (fountain plume preset).
          effects.particles({
            name: "wreck vent bubbles",
            emitter: "fountain",
            particleCount: 160,
            emissionRate: 40,
            radius: 0.5,
            height: 6,
            size: [0.08, 0.18],
            lifetime: [3, 5],
            color: "#d6fbff",
            materialMode: "soft-alpha",
            seed: 7401
          }).position(-2, -14, -9)
        ]
      : [])
  ];
}
