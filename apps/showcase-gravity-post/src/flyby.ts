/**
 * Gravity Post — skippable flyby beats.
 *
 * The beat clock is a public timeline.once() spec consumed route-locally: when
 * the pod first visits a planet, the director runs one FLYBY_SECONDS beat that
 * sweeps an emissive drone ring around the visited body (deterministic node
 * motion driven from app.onFrame), shows a caption, and locks launch input.
 * Skippable with any key/click; prefers-reduced-motion skips beats entirely.
 */
import { timeline } from "@aura3d/engine";
import { WELL_BODIES } from "./contracts";
import type { WellBody } from "./wells";

export const FLYBY_SECONDS = 2.6;
const FLYBY_SPEC = timeline.once({ seconds: FLYBY_SECONDS });

export interface FlybyState {
  active: boolean;
  bodyId: string | null;
  elapsed: number;
  skipped: boolean;
  /** Bodies that already had their first-visit beat this campaign. */
  readonly visited: Set<string>;
  beatsRun: number;
  beatsSkippedReducedMotion: number;
}

export function createFlybyState(): FlybyState {
  return {
    active: false,
    bodyId: null,
    elapsed: 0,
    skipped: false,
    visited: new Set<string>(),
    beatsRun: 0,
    beatsSkippedReducedMotion: 0
  };
}

export function flybySpecSeconds(): number {
  return FLYBY_SPEC.seconds ?? FLYBY_SECONDS;
}

/**
 * Body ids get exactly one first-visit beat per campaign.
 * With reducedMotion the visit is recorded but the beat never runs.
 */
export function requestFlyby(state: FlybyState, bodyId: string, options: { readonly reducedMotion?: boolean } = {}): boolean {
  const body = WELL_BODIES.find((candidate) => candidate.id === bodyId);
  if (!body || body.id === "sol") return false;
  if (state.visited.has(bodyId)) return false;
  state.visited.add(bodyId);
  if (options.reducedMotion) {
    state.beatsSkippedReducedMotion += 1;
    return false;
  }
  state.active = true;
  state.bodyId = bodyId;
  state.elapsed = 0;
  state.skipped = false;
  state.beatsRun += 1;
  return true;
}

export function skipFlyby(state: FlybyState): void {
  if (!state.active) return;
  state.skipped = true;
}

/**
 * Advance the beat; returns the beat progress ratio (0..1) while active, and
 * null once the beat has finished or been skipped.
 */
export function updateFlyby(state: FlybyState, dt: number): number | null {
  if (!state.active) return null;
  state.elapsed += Math.max(0, dt);
  if (state.skipped || state.elapsed >= flybySpecSeconds()) {
    state.active = false;
    state.bodyId = null;
    return null;
  }
  return Math.min(1, state.elapsed / flybySpecSeconds());
}

export function flybyBody(bodyId: string | null): WellBody | undefined {
  if (!bodyId) return undefined;
  return WELL_BODIES.find((candidate) => candidate.id === bodyId);
}
