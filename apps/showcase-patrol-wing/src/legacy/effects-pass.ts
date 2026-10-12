// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Public engine builders only, each on a runtime path that
// the default `post` / `vfx` / `lighting` flags enable; flags-off keeps the
// pre-pass coastal haze (and never pays the CPU volumetric-light pass).
//
// Look brief (outdoor, golden hour): low warm sun over a teal coast, aerial
// perspective pushing the far islands back, cloud wisps in the flight
// corridor. Families: sun key (golden-hour directional, cascaded shadows) +
// contact shadows, volumetric aerial haze with height falloff (god rays),
// cloud-wisp smoke and sea-spray particles, sunset IBL on the airframes,
// grade + vignette.
import { effects, environments } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

const WISPS = [
  { at: [-14, 12, -12] as const, seed: 8101 },
  { at: [12, 15, -26] as const, seed: 8102 },
  { at: [-4, 18, -40] as const, seed: 8103 }
];

export function patrolWingEffectsPass() {
  if (!effectsPassOn) {
    return [effects.fog({ name: "coastal haze", density: 0.0042, color: "#42647a", intensity: 0.42 })];
  }
  return [
    effects.contactShadows({ length: 0.5, intensity: 0.7 }),
    environments.preset("sunset", { intensity: 0.75, specularIntensity: 1.1, background: false }),
    // Aerial perspective: denser near the sea, thinning with altitude, with
    // forward in-scatter towards the golden-hour key (S4 god rays).
    effects.volumetricFog({
      name: "coastal aerial haze",
      density: 0.013,
      color: "#6f8fa3",
      intensity: 0.44,
      volumetricQuality: "balanced",
      heightFalloff: 0.05,
      heightReference: 0
    }),
    effects.vignette({ intensity: 0.26, smoothness: 1.7 }),
    ...(vfxOn
      ? [
          ...WISPS.map((wisp, index) =>
            effects.particles({
              name: `flight corridor cloud wisp ${index + 1}`,
              emitter: "ambient",
              particleCount: 60,
              emissionRate: 12,
              speed: 1.6,
              drag: 0.7,
              gravity: 0,
              size: [1.8, 3.4],
              lifetime: [4, 6],
              color: "#f4ede4",
              materialMode: "smoke",
              seed: wisp.seed
            }).position(wisp.at[0], wisp.at[1], wisp.at[2])
          ),
          // Sea spray off the surf line below the corridor.
          effects.particles({
            name: "surf line sea spray",
            emitter: "fountain",
            particleCount: 100,
            emissionRate: 25,
            radius: 6,
            height: 1.4,
            size: [0.08, 0.2],
            lifetime: [1.6, 2.4],
            color: "#e8fbff",
            materialMode: "soft-alpha",
            seed: 8104
          }).position(0, 0.2, -8)
        ]
      : [])
  ];
}
