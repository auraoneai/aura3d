/**
 * GU47 WP-26 VFX preset pack (PRD §3.2 item 3; CR-V1): gate-coloured `paint-splash` bursts on gate matches and pickups,
 * a double splash on PERFECT. Presentation only: the requests are planned from the sound events the renderer already
 * derives from state changes (`audio.ts` `diffSounds`), seeded from the simulation step count, with `camera: false`, so
 * the simulation and its random stream never see them. Reduced motion halves the particle count (PRD §6.3).
 */
import type { AuraAppEffects, AuraVec3, AuraVfxEffectSpec } from "@aura3d/engine";
import type { GameSound } from "./audio";
import { GATE_COLORS } from "./look";

export const PAINT_SPLASH = "paint-splash";
export const PAINT_SPLASH_RING = "paint-splash-ring";

/** Wet paint drops thrown up and out, falling back under gravity (no camera layer: the game keeps its own shake). */
export const PAINT_SPLASH_SPEC: AuraVfxEffectSpec = {
  name: PAINT_SPLASH,
  layers: [
    { type: "emitter", count: 18, speed: 5.5, life: 0.55, gravity: -14, size: 0.16, spread: 0.85, direction: [0, 1, 0.35], drag: 1.2, blend: "alpha" }
  ]
};

/** Second, flatter ring for PERFECT (fires 60 ms after the first splash). */
export const PAINT_SPLASH_RING_SPEC: AuraVfxEffectSpec = {
  name: PAINT_SPLASH_RING,
  layers: [
    { type: "emitter", count: 14, speed: 7.5, life: 0.4, gravity: -6, size: 0.12, spread: 1, direction: [0, 0.25, 0], drag: 2, blend: "alpha", at: 0.06 }
  ]
};

/** Registers the pack once per app (E-F `registerPreset`). */
export function registerPaintPresets(effects: Pick<AuraAppEffects, "registerPreset">): void {
  effects.registerPreset(PAINT_SPLASH, PAINT_SPLASH_SPEC);
  effects.registerPreset(PAINT_SPLASH_RING, PAINT_SPLASH_RING_SPEC);
}

export interface SplashRequest {
  readonly kind: typeof PAINT_SPLASH | typeof PAINT_SPLASH_RING;
  readonly position: AuraVec3;
  readonly color: string;
  readonly count: number;
  readonly seed: number;
}

/** Count of the base splash; halved under reduced motion (PRD §6.3). */
export const SPLASH_COUNT = 18;

/**
 * Bursts for this frame's sound events. `step` is the simulation step count (read-only), so a replay of the same input
 * script requests the same seeds. Only matches, perfects and pickups splash.
 */
export function splashesFor(
  events: readonly { readonly sound: GameSound }[],
  ball: AuraVec3,
  playerColorIndex: number,
  step: number,
  reducedMotion: boolean
): SplashRequest[] {
  const color = GATE_COLORS[playerColorIndex] ?? GATE_COLORS[0];
  const count = reducedMotion ? Math.ceil(SPLASH_COUNT / 2) : SPLASH_COUNT;
  const at: AuraVec3 = [ball[0] ?? 0, (ball[1] ?? 0) + 0.2, ball[2] ?? 0];
  const out: SplashRequest[] = [];
  for (const [i, e] of events.entries()) {
    const seed = (step * 4 + i) >>> 0;
    if (e.sound === "match" || e.sound === "pickup") out.push({ kind: PAINT_SPLASH, position: at, color, count, seed });
    else if (e.sound === "perfect") {
      out.push({ kind: PAINT_SPLASH, position: at, color, count, seed });
      out.push({ kind: PAINT_SPLASH_RING, position: at, color, count: Math.round(count * 0.8), seed: seed + 1 });
    }
  }
  return out;
}

/** Fires the planned bursts on the app's runtime effects (no-op when the VFX flag is off). */
export function fireSplashes(effects: Pick<AuraAppEffects, "burst"> | undefined, requests: readonly SplashRequest[]): number {
  if (!effects) return 0;
  for (const r of requests) effects.burst(r.kind, r.position, { color: r.color, count: r.count, seed: r.seed, camera: false });
  return requests.length;
}
