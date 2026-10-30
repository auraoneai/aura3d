/**
 * IRON CROWN ambient motion (GU47 WP-15 IC47-AN2, partial): the Crown's crowd bobs in its seats and jumps on a K.O.
 *
 * The crowd is two instanced nodes (bodies and heads, `CROWD_IDS`); the bob moves each node as a whole (one transform
 * write per node per frame, no instance rewrite), so it costs no draws. A K.O. lifts the amplitude and tempo for
 * CROWD_CHEER.seconds, then it settles back. Reduced motion: the crowd holds still. Visual only.
 */
export const CROWD_IDS = { bodies: "ic-crowd-bodies", heads: "ic-crowd-heads" } as const;

export const CROWD_IDLE = { amplitude: 0.02, hz: 0.9 } as const;
export const CROWD_CHEER = { amplitude: 0.09, hz: 2.3, seconds: 2.6 } as const;

/**
 * Vertical offset (metres) of the crowd at `t` seconds; `koAge` is seconds since the last K.O. (Infinity when none).
 * Heads trail the bodies a little (`lag`) so the bob reads as people, not a sliding slab.
 */
export function crowdBob(t: number, koAge: number, reducedMotion: boolean, lag = 0): number {
  if (reducedMotion) return 0;
  const cheer = koAge >= 0 && koAge < CROWD_CHEER.seconds ? 1 - koAge / CROWD_CHEER.seconds : 0;
  const amplitude = CROWD_IDLE.amplitude + (CROWD_CHEER.amplitude - CROWD_IDLE.amplitude) * cheer;
  const hz = CROWD_IDLE.hz + (CROWD_CHEER.hz - CROWD_IDLE.hz) * cheer;
  // A rectified sine for the cheer (people jump up from their seats, never below them).
  const wave = Math.sin(2 * Math.PI * hz * (t - lag));
  const shape = cheer > 0 ? Math.abs(wave) * cheer + ((wave + 1) / 2) * (1 - cheer) : (wave + 1) / 2;
  return Number((amplitude * shape).toFixed(4));
}
