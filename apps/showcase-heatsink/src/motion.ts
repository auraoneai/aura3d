/**
 * Thermal Drift secondary motion (GU47 WP-13 HS-19), presentation only (the sim never reads it, replays stay exact):
 * a hover bob on the player drone, a nose-down pitch while boosting (smoothed), and a flicker on the holo billboards.
 * Rotating rings already spin through `SCENERY_ANCHORS.spinSpeed`. Reduced motion: bob 0, no boost pitch, no flicker.
 * Time is the wall clock in seconds, so the bob is the same at 60, 120 and 144 Hz.
 */

export const BOB = { amplitude: 0.06, hz: 1.3 } as const;
/** Boost pitch target in radians (nose down) and its smoothing time in seconds. */
export const BOOST_PITCH = { radians: -0.07, seconds: 0.18 } as const;

export function droneBob(timeSeconds: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : BOB.amplitude * Math.sin(timeSeconds * Math.PI * 2 * BOB.hz);
}

/** One frame of the smoothed boost pitch. */
export function stepBoostPitch(current: number, boosting: boolean, dt: number, reducedMotion: boolean): number {
  const target = boosting && !reducedMotion ? BOOST_PITCH.radians : 0;
  if (reducedMotion) return 0;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / BOOST_PITCH.seconds));
}

/** Holo billboard visibility: a short dropout about twice every 3 s (deterministic in time); always on for reduced motion. */
export function holoVisible(timeSeconds: number, seed: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return true;
  const t = timeSeconds * 0.67 + seed * 0.37;
  const f = t - Math.floor(t);
  return !(f > 0.42 && f < 0.45) && !(f > 0.88 && f < 0.9);
}
