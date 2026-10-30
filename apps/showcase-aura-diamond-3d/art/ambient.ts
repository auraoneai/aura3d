/**
 * Aura Diamond 3D ambient motion (GU47 DIA-N1). Pure functions (no engine, no DOM) for the crowd and the sky props, read
 * by main.ts every frame; nothing here touches the simulation, its RNG or the replay.
 *
 * - `cheerHop`: after a home run each front-row waver hops in place, each starting within `CHEER_MAX_DELAY_S` of the
 *   home run (a fixed per-seat stagger, so the wall ripples instead of jumping as one). Reduced motion: no hops.
 * - `earthYaw`: Lunar Park's rising Earth turns slowly (one turn in `EARTH_TURN_S`); reduced motion holds it still.
 */

/** Every waver starts cheering within this many seconds of the home run. */
export const CHEER_MAX_DELAY_S = 0.45;
/** Seconds a waver keeps hopping. */
export const CHEER_SECONDS = 2.4;
/** Hop height in metres. */
export const CHEER_HOP_M = 0.28;
/** Hops per second. */
export const CHEER_HOPS_PER_S = 2.2;
/** Seconds for one full turn of the lunar Earth. */
export const EARTH_TURN_S = 240;

/** Fixed per-seat start delay in [0, CHEER_MAX_DELAY_S): a Weyl sequence, deterministic and well spread. */
export function cheerDelay(seat: number): number {
  const frac = (((seat + 1) * 0.6180339887498949) % 1 + 1) % 1;
  return frac * CHEER_MAX_DELAY_S;
}

/** Hop height (metres, >= 0) of waver `seat` at `t` seconds after the last home run. */
export function cheerHop(seat: number, t: number, reducedMotion = false): number {
  if (reducedMotion || !Number.isFinite(t)) return 0;
  const local = t - cheerDelay(seat);
  if (local < 0 || local >= CHEER_SECONDS) return 0;
  // Half-sine hops, eased out over the cheer so the wall settles rather than stopping dead.
  const hop = Math.abs(Math.sin(local * CHEER_HOPS_PER_S * Math.PI));
  return CHEER_HOP_M * hop * (1 - local / CHEER_SECONDS);
}

/** Yaw (radians) of the lunar Earth at `t` seconds of page time. */
export function earthYaw(t: number, reducedMotion = false): number {
  if (reducedMotion || !Number.isFinite(t)) return 0;
  return ((t / EARTH_TURN_S) % 1) * Math.PI * 2;
}
