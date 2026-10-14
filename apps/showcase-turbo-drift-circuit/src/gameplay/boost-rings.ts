/**
 * Turbo Drift Circuit sensor boost rings (PRD TDC-A6 / C3) - OPTIONAL, flag-gated.
 *
 * Emissive rings stand on the fastest straights; driving through one grants a short
 * speed burst via the same kit contact-resolution path nitro already uses. The mode
 * only exists behind `?boost=1`: default OFF keeps every retained lap-time evidence
 * artifact valid, and ON-mode lap times are documented separately in the README.
 *
 * Placement is pure and deterministic: straights are found by curvature sampling of
 * the certified centreline, spaced along progress, always on the racing line so a
 * ring is passed *through* rather than beside. Ring sensors live in the route's own
 * planar collision world as sensor-only bodies tagged `turbo-boost-sensor`; they never
 * resolve penetration and never touch the vehicle-contact evidence path.
 */

export interface TurboBoostRing {
  readonly id: string;
  readonly progress: number;
  readonly point: { readonly x: number; readonly y: number };
  readonly headingGame: number;
  /** Scene-space torus radius (ring opening radius). */
  readonly radiusScene: number;
}

export interface PlanTurboBoostRingsInput {
  readonly sampleAt: (progress: number) => { readonly x: number; readonly y: number; readonly heading: number };
  readonly curvatureAt: (progress: number) => number;
  /** |curvature| below this reads as a straight. */
  readonly straightCurvatureThreshold: number;
  readonly ringCount: number;
  /** Minimum progress separation between rings, 0..1 of a lap. */
  readonly minSeparation: number;
  readonly radiusScene?: number;
}

/** Deterministically pick straight segments and return evenly separated rings. */
export function planTurboBoostRings(input: PlanTurboBoostRingsInput): readonly TurboBoostRing[] {
  const radiusScene = input.radiusScene ?? 0.16;
  const straightness: { progress: number; curvature: number }[] = [];
  const probes = 96;
  for (let index = 0; index < probes; index += 1) {
    const progress = index / probes;
    const curvature = Math.abs(input.curvatureAt(progress));
    if (curvature <= input.straightCurvatureThreshold) {
      straightness.push({ progress, curvature });
    }
  }
  // Rank straights by flatness, then greedily accept rings that respect separation.
  const candidates = [...straightness].sort((a, b) => a.curvature - b.curvature);
  const accepted: TurboBoostRing[] = [];
  for (const candidate of candidates) {
    if (accepted.length >= input.ringCount) break;
    const tooClose = accepted.some((ring) => {
      let delta = Math.abs(ring.progress - candidate.progress);
      while (delta > 0.5) delta = 1 - delta;
      return delta < input.minSeparation;
    });
    if (tooClose) continue;
    const sample = input.sampleAt(candidate.progress);
    accepted.push({
      id: "turbo-boost-ring-" + accepted.length,
      progress: candidate.progress,
      point: { x: sample.x, y: sample.y },
      headingGame: sample.heading,
      radiusScene
    });
  }
  return accepted;
}

/** Burst granted per ring pass. Tuned under the flag only; see README ON-mode notes. */
export const TURBO_BOOST_DURATION_SECONDS = 0.9;
export const TURBO_BOOST_SPEED_MULTIPLIER = 1.18;
export const TURBO_BOOST_FLAG = "boost";

export function turboBoostEnabledFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(TURBO_BOOST_FLAG) === "1";
}

export interface TurboBoostState {
  readonly enabled: boolean;
  readonly remainingSeconds: number;
  readonly hits: number;
  /** Ring ids already consumed on the current lap; cleared each lap. */
  readonly collectedThisLap: readonly string[];
}

export function createTurboBoostState(enabled: boolean): TurboBoostState {
  return { enabled, remainingSeconds: 0, hits: 0, collectedThisLap: [] };
}

/** Advance the burst timer; returns the same state when idle to keep frames stable. */
export function updateTurboBoost(state: TurboBoostState, dt: number): TurboBoostState {
  if (!state.enabled || state.remainingSeconds <= 0) return state;
  return { ...state, remainingSeconds: Math.max(0, state.remainingSeconds - dt) };
}

/** Credit a ring pass once per lap per ring. */
export function collectTurboBoostRing(
  state: TurboBoostState,
  ringId: string,
  lap: number,
  lastBoostLap: number
): { state: TurboBoostState; collected: boolean; lastBoostLap: number } {
  if (!state.enabled) return { state, collected: false, lastBoostLap };
  const freshLap = lap !== lastBoostLap;
  const seen = freshLap ? new Set<string>() : new Set(state.collectedThisLap);
  if (seen.has(ringId)) return { state, collected: false, lastBoostLap };
  seen.add(ringId);
  return {
    state: {
      ...state,
      remainingSeconds: TURBO_BOOST_DURATION_SECONDS,
      hits: state.hits + 1,
      collectedThisLap: [...seen]
    },
    collected: true,
    lastBoostLap: lap
  };
}