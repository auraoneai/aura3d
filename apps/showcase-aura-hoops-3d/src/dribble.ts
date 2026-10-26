export const BALL_R = 0.13;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Phase landmarks of one dribble bounce: palm and ball ride together until RIDE_END, the ball meets the floor at FLOOR_AT. */
export const DRIB_RIDE_END = 0.35;
export const DRIB_PALM_TURN = 0.60;
export const DRIB_FLOOR_AT = 0.66;
export const DRIB_BALL_GAP = 0.09; // palm centroid rides this far above the ball crown
export const DRIB_FLOOR_Y = BALL_R; // ball centre on the floor at the bounce
export const DRIB_CYCLE_STAND = 0.46;
export const DRIB_CYCLE_RUN = 0.30;
export const DRIB_SHOULDER_FALLBACK = 1.5; // world shoulder Y (standing) before sockets resolve
/** Palm heights above the floor: waist at the meet, low in the crouch at the push (the arm alone reaches 0.55 m below the shoulder). */
export const DRIB_PALM_TOP = 1.02;
export const DRIB_PALM_PUSH = 0.62;
export const DRIB_ARM_REACH = 0.55;
/** Running dribble: a lower apex (ball about 0.8 m) and a palm that follows it down with the torso bent over (the legs stay on the run clip). */
export const DRIB_PALM_TOP_RUN = 0.92;
export const DRIB_PALM_PUSH_RUN = 0.60;

/** Phase at which the palm is back on the ball and carries it again (the contact window closes the cycle). */
export const DRIB_CATCH_FROM = 0.92;

export function dribbleCycleY(t: number, shoulderY: number, moving = false): { palmY: number; ballY: number; effort: number } {
  const top = Math.min(moving ? DRIB_PALM_TOP_RUN : DRIB_PALM_TOP, shoulderY - 0.30);
  const push = Math.max(moving ? DRIB_PALM_PUSH_RUN : DRIB_PALM_PUSH, shoulderY - DRIB_ARM_REACH);
  const low = push - 0.04;
  let palmY: number;
  let effort: number;
  if (t < DRIB_RIDE_END) {
    const s = t / DRIB_RIDE_END;
    effort = Math.pow(s, 1.6);
    palmY = lerp(top, push, effort); // palm accelerates down with the ball
  } else if (t < DRIB_PALM_TURN) {
    const s = (t - DRIB_RIDE_END) / (DRIB_PALM_TURN - DRIB_RIDE_END);
    effort = 1; // stay sunk until the ball has met the floor: standing up early lifts the hand away from the bounce
    palmY = lerp(push, low, 1 - (1 - s) * (1 - s)); // decelerate into the turnaround
  } else {
    const s = (t - DRIB_PALM_TURN) / (1 - DRIB_PALM_TURN);
    effort = t < DRIB_FLOOR_AT ? 1 : 1 - smoothstep((t - DRIB_FLOOR_AT) / (1 - DRIB_FLOOR_AT));
    palmY = lerp(low, top, smoothstep(s)); // rise back to the meet
  }
  return { palmY, ballY: dribbleBallY(t, palmY, push - DRIB_BALL_GAP, top - DRIB_BALL_GAP), effort };
}

/**
 * Ball height for phase `t`. `palmY` is the palm the ball rides while in contact (pass the RENDERED palm so the ball can
 * never leave a hand that could not follow its target); `releaseY` is the ball height at the moment it leaves the palm and
 * `catchY` the height of the palm that receives it, both read live by the caller. In the air the ball falls to the floor
 * and rebounds, so the bounce point is always `DRIB_FLOOR_Y`.
 */
export function dribbleBallY(t: number, palmY: number, releaseY: number, catchY: number): number {
  if (t < DRIB_RIDE_END) return palmY - DRIB_BALL_GAP; // glued under the riding palm
  if (t < DRIB_FLOOR_AT) {
    const s = (t - DRIB_RIDE_END) / (DRIB_FLOOR_AT - DRIB_RIDE_END);
    return lerp(releaseY, DRIB_FLOOR_Y, Math.pow(s, 1.2)); // thrown down after separation
  }
  if (t >= DRIB_CATCH_FROM) return palmY - DRIB_BALL_GAP; // caught: the palm carries it again
  const s = (t - DRIB_FLOOR_AT) / (DRIB_CATCH_FROM - DRIB_FLOOR_AT);
  return lerp(DRIB_FLOOR_Y, catchY, 1 - Math.pow(1 - s, 1.7)); // gravity rise into the palm
}

/**
 * 1 while the palm is on the ball (riding down, and the catch at the top of the bounce), 0 while the ball is free in
 * the air. Anything that offsets the ball from the palm (stride lead, outward nudge) is scaled by `1 - weight` so the ball
 * is always glued to the palm at the contact points, however fast the handler runs.
 */
export function dribbleContactWeight(phase: number): number {
  const t = ((phase % 1) + 1) % 1;
  if (t < DRIB_RIDE_END) return 1;
  if (t < DRIB_FLOOR_AT) return 1 - smoothstep((t - DRIB_RIDE_END) / 0.1);
  if (t < DRIB_CATCH_FROM) return smoothstep((t - DRIB_FLOOR_AT - 0.1) / (DRIB_CATCH_FROM - DRIB_FLOOR_AT - 0.1));
  return 1;
}

/** Horizontal ball position for a held dribble: on the palm at contact, drifting ahead of it with the handler's stride only while the ball is in the air. */
export function dribbleBallXZ(
  palm: readonly [number, number, number], holder: { x: number; z: number; vx: number; vz: number }, phase: number
): { x: number; z: number } {
  const w = dribbleContactWeight(phase);
  const ox = palm[0] - holder.x;
  const oz = palm[2] - holder.z;
  const olen = Math.hypot(ox, oz) || 1;
  const free = 1 - w;
  return {
    x: palm[0] + (ox / olen) * 0.02 * free + holder.vx * 0.04 * free,
    z: palm[2] + (oz / olen) * 0.02 * free + holder.vz * 0.04 * free
  };
}
