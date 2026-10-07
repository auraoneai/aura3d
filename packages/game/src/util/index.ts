/**
 * @aura3d/game/util subpath (prd09). Shared helpers for routes and the
 * package itself; seeded RNG/ease/tween land with the juice PR.
 */

/** Clamp a finite number to the session timescale range [0, 4]; NaN throws. */
export function clampTimeScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    throw new Error(`GAME_TIMESCALE_NAN: clampTimeScale(${String(scale)}) requires a finite number.`);
  }
  return Math.min(4, Math.max(0, scale));
}

/** Monotonic seconds, falling back to Date.now()/1000 outside perf contexts. */
export function nowSeconds(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}
