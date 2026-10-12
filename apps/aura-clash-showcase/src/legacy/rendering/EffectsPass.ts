// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Public engine builders only, mounted in the root stage
// scene that owns this route's renderer. Under the default `post` flag the
// compatibility source's own postprocess chain is dropped (renderInput
// POST_LEGACY_POSTPROCESS), so the root scene's effect nodes are the chain.
// Flags-off returns nothing and the route keeps its pre-pass look.
//
// Look brief (arena-fight / night-city): hard cool key over a dark downtown
// ring, sodium and neon accents, haze between the fighters and the skyline.
// Families: shadowed moon key + contact shadows, god rays through the stage
// haze, rising embers + drifting street dust, grade + vignette, and a
// brighter IBL / lighter haze on the compatibility source (see
// `auraClashSourceLook`).
import { effects, lights } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

export function auraClashRootEffects(options: { readonly reducedMotion: boolean }) {
  if (!effectsPassOn) return [];
  return [
    lights.directional({
      name: "Aura Clash arena moon key",
      position: [-3.2, 6.4, 5.6],
      target: [0, 0.9, 0],
      color: "#cfe0ff",
      intensity: 1.7,
      shadow: { cascades: "auto", maxDistance: 20 }
    }),
    // Drives the S4 god rays from the moon key; the fog colour itself comes
    // from the compatibility source's environmentFog.
    effects.volumetricFog({ name: "Aura Clash stage haze rays", density: 0.02, color: "#3b4a6a", intensity: 0.32 }),
    effects.colorGrade({ exposure: 1.2, contrast: 1.06, saturation: 1.1 }),
    effects.vignette({ intensity: 0.22, smoothness: 1.8 }),
    ...(vfxOn
      ? [
          effects.particles({
            name: "Aura Clash stage embers",
            emitter: "fountain",
            particleCount: options.reducedMotion ? 60 : 140,
            emissionRate: options.reducedMotion ? 14 : 34,
            radius: 3.4,
            height: 2.6,
            size: [0.012, 0.03],
            lifetime: [2.2, 3.4],
            color: "#ffb15c",
            materialMode: "additive-glow",
            seed: 9101
          }).position(0, 0, -0.6),
          effects.particles({
            name: "Aura Clash street dust",
            emitter: "fountain",
            particleCount: 120,
            emissionRate: 26,
            radius: 4.2,
            height: 1.6,
            size: [0.02, 0.05],
            lifetime: [4, 5.5],
            color: "#9fc6ff",
            materialMode: "soft-alpha",
            seed: 9102
          }).position(0, 0, 0.4)
        ]
      : [])
  ];
}
