/**
 * Idol grounding (render layer only): the serpent's back is the only ground on the Snake Way. Its cross-section is
 * `road.ts` PROFILE scaled by the body's girth (the walkable top at y ~0.48, the parapet crest at |x| 4.55, the flanks
 * falling to the body's widest point at |x| 9.4, y -4.8); beyond that there is open air above the cloud sea.
 *
 * Idol models are grounded at their lowest vertex, so placing them at the road-centre lift (`onRoad(frame, x, 0)`) leaves
 * a wide model floating over the falling edge of the top, over a slimmer body (girth < 1) or over the flank. These
 * helpers give the lowest body surface under a footprint, and the placements put the model's base `GROUND_SINK` below it.
 *
 * Exempt (meant to float): the sky islands and the soul column, the colossal serpent head rising out of the cloud sea,
 * the sanctuary planetlet hanging above the tail, and the coiled tail monument crowning the tail's tapering tip where
 * the road ends in open air; orbs, souls and power-ups are floating pickups.
 */
import type { RoadFrame, V3 } from "../road";

/** How far a grounded model's base sits under the lowest surface point of its footprint (m). */
export const GROUND_SINK = 0.12;

/** Upper surface of the body's cross-section (x across, y up), from parapet-less flank to flank. */
const TOP: readonly (readonly [number, number])[] = [
  [-9.4, -4.8], [-8.2, -1.3], [-5.6, 0.1], [-4.55, 1.32], [-3.6, 0.3], [-1.8, 0.44], [0, 0.48],
  [1.8, 0.44], [3.6, 0.3], [4.55, 1.32], [5.6, 0.1], [8.2, -1.3], [9.4, -4.8]
];
export const BODY_HALF_WIDTH = 9.4;

/** Body surface height (along the frame's up, from `frame.p`) at lateral `x`; -Infinity past the flanks (open air). */
export function surfaceHeight(girth: number, x: number): number {
  const g = Math.max(0.05, girth);
  const u = x / g;
  if (u < TOP[0]![0] || u > TOP[TOP.length - 1]![0]) return Number.NEGATIVE_INFINITY;
  for (let i = 0; i < TOP.length - 1; i++) {
    const a = TOP[i]!, b = TOP[i + 1]!;
    if (u >= a[0] && u <= b[0]) return g * (a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0] || 1));
  }
  return Number.NEGATIVE_INFINITY;
}

/** Lowest body surface over the lateral span [x0, x1] (profile vertices inside the span included). */
export function lowestSurface(girth: number, x0: number, x1: number): number {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  let y = Math.min(surfaceHeight(girth, lo), surfaceHeight(girth, hi));
  const g = Math.max(0.05, girth);
  for (const [px] of TOP) if (px * g > lo && px * g < hi) y = Math.min(y, surfaceHeight(girth, px * g));
  for (let k = 1; k < 8; k++) y = Math.min(y, surfaceHeight(girth, lo + ((hi - lo) * k) / 8));
  return y;
}

/**
 * World base point for a model whose footprint spans [x - halfWidth, x + halfWidth]: `GROUND_SINK` under the lowest
 * surface there. The point sits at lateral `at` (default `x`, the footprint centre). Symmetric models whose feet straddle
 * the road (torii, gatehouse) pass the span of one foot set as `x`/`halfWidth` and `at = 0`, so the model stays centred
 * on the road (owner GPU QA 2026-11-18: placing the torii origin at its right feet put its left pillar in the lanes and
 * the runner ran straight through it).
 */
export function groundedBase(frame: RoadFrame, x: number, halfWidth: number, extraSink = 0, at = x): V3 {
  const y = lowestSurface(frame.girth, x - halfWidth, x + halfWidth);
  const h = (Number.isFinite(y) ? y : -BODY_HALF_WIDTH) - GROUND_SINK - extraSink;
  return [frame.p[0] + frame.R[0] * at + frame.U[0] * h, frame.p[1] + frame.R[1] * at + frame.U[1] * h, frame.p[2] + frame.R[2] * at + frame.U[2] * h];
}

/** Ground footprints (half-width across the road, m) of the pooled Idol road entities at their drawn size. */
export const ENTITY_HALF_WIDTH: Readonly<Record<string, number>> = { barrier: 1.52, arch: 1.1, oni: 1.6, sweeper: 1.56, feast: 1.01 };

/** Roadside lanterns stand on the serpent's flank, outside the parapet (lateral, as a multiple of girth). */
export const LANTERN_LATERAL = 6.9;
/** Pedestal half-width of the Idol lantern (its stone base). */
export const LANTERN_FOOT = 0.7;

/**
 * Idol torii: its feet (native |x| 4.83-8.57 m) are drawn at TORII_FOOT_FIT x girth across, so they stand on the
 * parapet and flank instead of hanging past the body; the base sinks to the lowest surface under the feet.
 */
export const TORII_FOOT_FIT = 0.95;
export const TORII_FEET: readonly [number, number] = [4.83, 8.57];
/** Gatehouse feet (native |x| 6.47-18.43 m; the scale in idolModels.ts keeps them on the body). */
export const GATEHOUSE_FEET: readonly [number, number] = [6.47, 18.43];

/**
 * Pass-through QA (owner 2026-11-18): the runner's lateral corridor on foot. Lanes sit at +-LANE_WIDTH (2.3 m) and the
 * sculpted runner is ~0.45 m half-wide with swinging arms; nothing solid may stand inside this half-width.
 */
export const RUNNER_CORRIDOR_HALF = 2.3 + 0.45 + 0.3;
/** Inner edge of the Idol torii's posts (m from the road centre) at `girth`. */
export const toriiInnerPost = (girth: number): number => TORII_FEET[0] * TORII_FOOT_FIT * girth;
/** True when a torii at this girth keeps its posts out of the runner's corridor. */
export const toriiClearsLanes = (girth: number): boolean => toriiInnerPost(girth) >= RUNNER_CORRIDOR_HALF;
