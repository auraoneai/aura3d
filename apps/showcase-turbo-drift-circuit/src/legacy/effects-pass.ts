/**
 * Turbo Drift Circuit — default-boot effects pass (visible effects batch B).
 *
 * Presentation only: vehicle physics, laps and drift scoring are untouched.
 * Families wired for the late-afternoon circuit:
 *   - low sun key with cascaded shadows (enabled in main.ts) + contact shadows
 *   - volumetric inscatter / god rays from the low sun key
 *   - warm ground-hugging height haze for treeline depth separation
 *   - trackside dust drifting over the start straight and the hairpin
 *   - grade + vignette (bloom values are unchanged; see main.ts)
 */
import { effects, type AuraNodeInput, type AuraVec3 } from "@aura3d/engine";

export interface TurboEffectsPassOptions {
  readonly sceneSize: number;
  readonly startPoint: AuraVec3;
  readonly apexPoint: AuraVec3;
  readonly reducedMotion: boolean;
}

export function turboEffectsPass(options: TurboEffectsPassOptions): readonly AuraNodeInput[] {
  const { sceneSize, startPoint, apexPoint, reducedMotion } = options;
  const dust = (name: string, seed: number, at: AuraVec3) =>
    effects.particles({
      name,
      emitter: "ambient",
      materialMode: "dust",
      rate: reducedMotion ? 10 : 24,
      maxParticles: 200,
      prewarm: 6,
      seed,
      lifetime: [5, 8],
      speed: 1.3,
      size: [0.12, 0.28],
      gravity: -0.03,
      drag: 0.15,
      color: "#e8b79a"
    }).position(at[0], at[1] + 0.6, at[2]);
  return [
    effects.contactShadows({ length: 0.35, thickness: 0.06, intensity: 0.9 }),
    effects.vignette({ intensity: 0.3, smoothness: 0.65, roundness: 0.9 }),
    effects.volumetricFog({
      name: "low sun inscatter",
      density: 0.3,
      intensity: 0.38,
      color: "#ffb88a",
      heightFalloff: 0.12,
      heightReference: 0
    }),
    dust("start straight dust", 8101, startPoint),
    dust("hairpin dust", 8102, apexPoint),
    // Sun motes: a broad, slow glitter of warm specks over the infield.
    effects.particles({
      name: "infield sun motes",
      emitter: "ambient",
      materialMode: "additive-glow",
      rate: reducedMotion ? 8 : 20,
      maxParticles: 180,
      prewarm: 8,
      seed: 8103,
      lifetime: [7, 10],
      speed: sceneSize * 0.05,
      size: [0.06, 0.12],
      gravity: 0,
      drag: 0.02,
      color: "#ffd9a8"
    }).position(0, 2.5, 0)
  ];
}

/** Warm ground haze replacing the near-invisible flat exp2 distance fog. */
export function turboHeightHaze(color: string): AuraNodeInput {
  return effects.fog({
    name: "circuit height haze",
    // heightDensity selects the C-21 height mode.
    color,
    density: 0.004,
    heightDensity: 0.03,
    heightFalloff: 0.16,
    heightReference: 0,
    start: 6,
    maxOpacity: 0.62,
    sunInscatter: 0.5,
    anisotropy: 0.6,
    affectsBackground: false
  });
}
