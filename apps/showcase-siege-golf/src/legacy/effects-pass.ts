/**
 * Siege Golf — default-boot effects pass (visible effects batch B).
 *
 * Presentation only: no collider, sensor or scoring authority lives here.
 * Families wired for the golden-hour causeway:
 *   - low golden sun cascaded shadow (already authored) + contact shadows
 *   - golden-hour height haze: settles in the valley, keeps the fairway crisp
 *   - drifting pollen / chaff particles over the fairway and the keep
 *   - grade + vignette (bloom and the studio IBL stay as authored)
 */
import { effects, type AuraNodeInput } from "@aura3d/engine";

export interface SiegeGolfEffectsPassOptions {
  readonly halfLength: number;
  readonly reducedMotion: boolean;
}

export function siegeGolfEffectsPass(options: SiegeGolfEffectsPassOptions): readonly AuraNodeInput[] {
  const { halfLength, reducedMotion } = options;
  return [
    effects.contactShadows({ length: 0.3, thickness: 0.06, intensity: 0.9 }),
    effects.vignette({ intensity: 0.3, smoothness: 0.65, roundness: 0.9 }),
    // Pollen and chaff drifting through the low sun over the mid fairway.
    effects.particles({
      name: "golden-hour fairway pollen",
      emitter: "ambient",
      materialMode: "additive-glow",
      rate: reducedMotion ? 10 : 26,
      maxParticles: 240,
      prewarm: 8,
      seed: 5101,
      lifetime: [6, 9],
      speed: 0.7,
      size: [0.03, 0.06],
      gravity: 0,
      drag: 0.05,
      color: "#ffe2a0"
    }).position(0, 1.4, -halfLength * 0.35),
    // Timber dust around the siege keep end of the hole.
    effects.particles({
      name: "keep timber dust",
      emitter: "ambient",
      materialMode: "dust",
      rate: reducedMotion ? 6 : 16,
      maxParticles: 140,
      prewarm: 6,
      seed: 5102,
      lifetime: [5, 8],
      speed: 0.5,
      size: [0.08, 0.16],
      gravity: -0.02,
      drag: 0.1,
      color: "#d8b88a"
    }).position(0, 0.8, -halfLength * 0.72)
  ];
}

/** Golden-hour height haze replacing the flat exp2 distance haze. */
export function siegeGolfHeightHaze(): AuraNodeInput {
  return effects.fog({
    name: "golden-hour valley height haze",
    // heightDensity selects the C-21 height mode.
    color: "#e7c99a",
    density: 0.012,
    heightDensity: 0.06,
    heightFalloff: 0.45,
    heightReference: -0.5,
    start: 3,
    maxOpacity: 0.6,
    sunInscatter: 0.55,
    anisotropy: 0.6,
    affectsBackground: true,
    backgroundDistance: 60
  });
}
