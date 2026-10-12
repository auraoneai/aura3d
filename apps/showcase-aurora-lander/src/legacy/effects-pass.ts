/**
 * Aurora Lander — default-boot effects pass (visible effects batch B).
 *
 * Presentation only: nothing here owns flight, contact or scoring state.
 * Families wired for the night-valley landing:
 *   - moonlight key cascaded shadow (already authored)
 *   - valley height fog: dense in the basin, clear at the ridgelines
 *   - regolith dust over the first pad and aurora sparkle high in the sky
 *   - grade + vignette (bloom values are unchanged; see main.ts)
 */
import { effects, type AuraNodeInput } from "@aura3d/engine";

export interface AuroraLanderEffectsPassOptions {
  /** First site's pad centre (x, ground height, z). */
  readonly pad: readonly [number, number, number];
  readonly reducedMotion: boolean;
}

/** Nodes that must precede the plain fog node (the last fog node wins). */
export function auroraLanderEffectsPass(options: AuroraLanderEffectsPassOptions): readonly AuraNodeInput[] {
  const [padX, padY, padZ] = options.pad;
  const calm = options.reducedMotion;
  return [
    effects.vignette({ intensity: 0.42, smoothness: 2.4, roundness: 1 }),
    // Regolith dust lifting off the first landing pad (thruster wash read).
    effects.particles({
      name: "regolith pad dust",
      emitter: "ambient",
      materialMode: "dust",
      rate: calm ? 14 : 22,
      maxParticles: 180,
      prewarm: 6,
      seed: 3301,
      lifetime: [4, 7],
      speed: 1.6,
      size: [0.24, 0.55],
      gravity: -0.05,
      drag: 0.2,
      color: "#9fb6c8"
    }).position(padX, padY + 0.6, padZ),
    // Aurora sparkle: slow cyan motes high over the valley.
    effects.particles({
      name: "aurora sky sparkle",
      emitter: "ambient",
      materialMode: "additive-glow",
      rate: calm ? 8 : 12,
      maxParticles: 120,
      prewarm: 10,
      seed: 3302,
      lifetime: [7, 10],
      speed: 3.2,
      size: [0.25, 0.5],
      gravity: 0,
      drag: 0.02,
      color: "#5eead4"
    }).position(padX, padY + 24, padZ - 18)
  ];
}

/** Valley height fog: thick on the basin floor, thinning towards the ridges. */
export function auroraLanderValleyFog(padY: number): AuraNodeInput {
  return effects.fog({
    name: "valley height fog",
    // heightDensity selects the C-21 height mode.
    color: "#183150",
    density: 0.007,
    heightDensity: 0.05,
    heightFalloff: 0.09,
    heightReference: padY,
    start: 3,
    maxOpacity: 0.68,
    sunInscatter: 0.35,
    anisotropy: 0.5,
    affectsBackground: false
  });
}
