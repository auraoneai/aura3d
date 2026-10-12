/**
 * Gravity Post — default-boot effects pass (visible effects batch B).
 *
 * Presentation only: no node here owns gameplay state, colliders or input.
 * Families wired on the public planning board:
 *   - cascaded key shadow (the key light in main.ts now casts onto the
 *     board; screen-space contact shadows were dropped for frame cost)
 *   - volumetric inscatter / god rays from the warm solar key
 *   - height haze hugging the play plane (depth separation board -> void)
 *   - solar-wind dust and ember particles around Sol
 *   - grade + vignette (bloom values are unchanged; see main.ts)
 */
import { effects, type AuraNodeInput } from "@aura3d/engine";

export interface GravityPostEffectsPassOptions {
  readonly playPlaneY: number;
  readonly reducedMotion: boolean;
}

/** Nodes that must precede the plain fog node (the last fog node wins). */
export function gravityPostEffectsPass(options: GravityPostEffectsPassOptions): readonly AuraNodeInput[] {
  const { playPlaneY, reducedMotion } = options;
  return [
    effects.vignette({ intensity: 0.3, smoothness: 2.4, roundness: 1 }),
    // God rays: driven by the strongest directional light (the warm solar key).
    effects.volumetricFog({
      name: "solar key inscatter",
      density: 0.32,
      intensity: 0.42,
      color: "#ffbe7a",
      heightFalloff: 0.9,
      heightReference: playPlaneY
    }),
    // Solar wind: slow warm motes drifting off Sol across the board. The
    // "ambient" emitter spreads in every direction from the origin, so the
    // cloud radius is roughly speed x lifetime (~3 board units).
    effects.particles({
      name: "solar wind motes",
      emitter: "ambient",
      materialMode: "additive-glow",
      rate: reducedMotion ? 12 : 18,
      maxParticles: 144,
      prewarm: 8,
      seed: 1414,
      lifetime: [6, 9],
      speed: 0.42,
      size: [0.045, 0.09],
      gravity: 0,
      drag: 0.02,
      color: "#ffd59a"
    }).position(0, playPlaneY + 0.3, 0),
    // Corona embers rising out of the sun disc.
    effects.particles({
      name: "sol corona embers",
      emitter: "ambient",
      materialMode: "spark",
      rate: reducedMotion ? 8 : 14,
      maxParticles: 72,
      prewarm: 3,
      seed: 2718,
      lifetime: [1.2, 2.2],
      speed: 0.5,
      size: [0.03, 0.06],
      gravity: 0.08,
      color: "#ff9a3c"
    }).position(0, playPlaneY + 0.2, 0)
  ];
}

/** Height haze replacing the flat exp2 board fog: thick at the plane, clear above. */
export function gravityPostHeightHaze(playPlaneY: number): AuraNodeInput {
  return effects.fog({
    name: "board height haze",
    // heightDensity selects the C-21 height mode (no explicit `mode` needed).
    color: "#184a63",
    density: 0.012,
    heightDensity: 0.06,
    heightFalloff: 1.1,
    heightReference: playPlaneY - 0.4,
    start: 1.5,
    maxOpacity: 0.5,
    sunInscatter: 0.45,
    anisotropy: 0.55,
    affectsBackground: false
  });
}
