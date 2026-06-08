// Shared fighter animation adapter: maps a combat state to a clip key + playback speed, and
// computes deterministic transition weights on state change. Pure (no engine/render import) so both
// the Aura Clash arena and the fighting-game template can reuse the same mapping instead of each
// re-deriving it inline. Transitions default to the inertialized (critically-damped) weight curve;
// the linear crossfade is retained as an explicit fallback.

import { inertializedTransitionWeight, DEFAULT_INERTIALIZATION_HALF_LIFE } from "./Inertialization.js";

export type FighterClipKey =
  | "idle"
  | "walk"
  | "run"
  | "air"
  | "down"
  | "guard"
  | "hurt"
  | "ko"
  | "light"
  | "heavy"
  | "special";

export interface FighterAnimationStateInput {
  /** High-level action label from the combat sim. */
  readonly action: string;
  /** Whether the fighter is on the ground (airborne overrides locomotion). */
  readonly grounded: boolean;
  /** Active attack clip key, if mid-attack (overrides everything except KO). */
  readonly attackClipKey?: FighterClipKey | undefined;
  /** KO takes precedence over all other states. */
  readonly knockedOut?: boolean | undefined;
}

export interface FighterClipResolution {
  readonly clipKey: FighterClipKey;
  readonly speed: number;
}

export interface FighterAnimationSpeedTable {
  readonly light?: number;
  readonly heavy?: number;
  readonly special?: number;
  readonly run?: number;
}

const defaultSpeeds: Required<FighterAnimationSpeedTable> = { light: 1.45, heavy: 1.06, special: 0.94, run: 1.18 };

const locomotionByAction: Readonly<Record<string, FighterClipKey>> = {
  idle: "idle",
  walk: "walk",
  run: "run",
  dash: "run",
  guard: "guard",
  block: "guard",
  down: "down",
  crouch: "down",
  hurt: "hurt",
  hit: "hurt"
};

/** Resolve the clip key + speed for a fighter state. Mirrors the Aura Clash arena cascade. */
export function resolveFighterClip(input: FighterAnimationStateInput, speeds: FighterAnimationSpeedTable = {}): FighterClipResolution {
  const table = { ...defaultSpeeds, ...speeds };
  if (input.knockedOut) return { clipKey: "ko", speed: 1 };
  if (input.attackClipKey) {
    const speed = input.attackClipKey === "light" ? table.light : input.attackClipKey === "heavy" ? table.heavy : input.attackClipKey === "special" ? table.special : 1;
    return { clipKey: input.attackClipKey, speed };
  }
  if (!input.grounded) return { clipKey: "air", speed: 1 };
  const action = input.action.toLowerCase();
  const clipKey = locomotionByAction[action] ?? "idle";
  const speed = clipKey === "run" ? table.run : 1;
  return { clipKey, speed };
}

export interface FighterCrossfade<TClip extends string = string> {
  readonly from: TClip;
  readonly to: TClip;
  readonly weights: readonly [number, number];
  readonly done: boolean;
}

/**
 * Deterministic crossfade weights from a previous clip to the current clip over a transition
 * window. `elapsed`/`duration` are in seconds. Returns clamped [fromWeight, toWeight] summing to 1.
 * Generic over clip identifier so callers using clip keys OR raw clip names can both use it.
 */
export function fighterCrossfadeWeights<TClip extends string = string>(from: TClip, to: TClip, elapsed: number, duration: number): FighterCrossfade<TClip> {
  if (from === to || duration <= 0) {
    return { from, to, weights: [0, 1], done: true };
  }
  const t = Math.max(0, Math.min(1, elapsed / duration));
  return { from, to, weights: [1 - t, t], done: t >= 1 };
}

/**
 * Inertialized transition weights from a previous clip to the current clip. This is the **default**
 * fighter transition: the source weight follows a critically-damped decay (zero initial slope,
 * momentum-preserving) instead of the straight linear ramp of {@link fighterCrossfadeWeights}, so
 * move swaps carry through smoothly rather than dissolving. Weights still sum to 1, output is
 * deterministic (pure function of `elapsed`/`duration`/`halfLife`), so deterministic combat replay
 * is unaffected. `halfLife` defaults to ~40% of the transition window so the source has effectively
 * faded by the time the window closes; the linear path remains available as a fallback.
 */
export function fighterInertializedWeights<TClip extends string = string>(
  from: TClip,
  to: TClip,
  elapsed: number,
  duration: number,
  halfLife?: number
): FighterCrossfade<TClip> {
  if (from === to || duration <= 0) {
    return { from, to, weights: [0, 1], done: true };
  }
  const done = elapsed >= duration;
  if (done) {
    return { from, to, weights: [0, 1], done: true };
  }
  const life = halfLife ?? Math.max(1e-4, duration * 0.4);
  const fromWeight = inertializedTransitionWeight(Math.max(0, elapsed), life);
  return { from, to, weights: [fromWeight, 1 - fromWeight], done: false };
}

/** Default transition half-life re-exported for callers that want to align their own timing. */
export { DEFAULT_INERTIALIZATION_HALF_LIFE };
