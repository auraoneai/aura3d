/**
 * Skyline Runner — default-boot effects pass (visible effects batch B).
 *
 * Presentation only: the platformer controller, colliders, pickups and
 * checkpoints are untouched.
 * Families wired for the dusk-to-night skyline climb:
 *   - act key lights cast cascaded shadows (main.ts) + contact shadows
 *   - act fog becomes height haze (ground-hugging, lighter higher up the climb)
 *   - drifting ember / snow motes per district along the route
 *   - grade + vignette (bloom values are unchanged; see main.ts)
 */
import { effects, type AuraNodeInput } from "@aura3d/engine";

export interface SkylineEffectsPassOptions {
  /** Scene-space district centres (x, y) and the actor plane depth. */
  readonly districts: readonly (readonly number[])[];
  readonly depth: number;
  readonly reducedMotion: boolean;
}

export function skylineEffectsPass(options: SkylineEffectsPassOptions): readonly AuraNodeInput[] {
  const { districts, depth, reducedMotion } = options;
  const motes = districts.map(([x = 0, y = 0], index) =>
    effects.particles({
      name: `skyline district ${index + 1} motes`,
      emitter: "ambient",
      materialMode: index % 2 === 0 ? "additive-glow" : "dust",
      rate: reducedMotion ? 6 : 16,
      maxParticles: 110,
      prewarm: 6,
      seed: 9100 + index,
      lifetime: [5, 8],
      speed: 0.32,
      size: [0.018, 0.04],
      gravity: index % 2 === 0 ? 0.01 : -0.02,
      drag: 0.04,
      color: index % 2 === 0 ? "#ffc690" : "#dbe8ff"
    }).position(x, y + 0.6, depth - 0.4)
  );
  return [
    effects.contactShadows({ length: 0.12, thickness: 0.03, steps: 8, intensity: 0.85 }),
    effects.vignette({ intensity: 0.3, smoothness: 2.4, roundness: 1 }),
    ...motes
  ];
}

/** Height-mode act haze options merged over the act palette's colour. */
export function skylineActHazeOptions(palette: { readonly fogDensity: number }, groundY: number) {
  return {
    // heightDensity selects the C-21 height mode.
    density: palette.fogDensity * 1.1,
    heightDensity: 0.012 + palette.fogDensity * 0.6,
    heightFalloff: 0.3,
    heightReference: groundY,
    start: 2,
    maxOpacity: 0.45,
    affectsBackground: false,
    transitionSeconds: 0.6
  } as const;
}
