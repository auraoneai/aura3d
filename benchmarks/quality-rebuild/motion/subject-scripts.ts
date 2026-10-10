/**
 * `subject-scripts.ts` — S9 scripted subjects for the six `prd08-motion-*`
 * scenes (phase-5 consumption): each driver id maps to a pure, deterministic
 * `(t: seconds) => SubjectFrame` describing where the subject is and what the
 * scene-specific prop (rig input, hit timing, colliders, rail) does.
 *
 * No engine imports — this module is plain math so it can drive both the
 * Aura3D capture path and the three.js reference adapters unchanged
 * (C-30: identical scripted inputs on both sides).
 */

export interface SubjectFrame {
  /** World position of the primary subject (the `hero` object). */
  readonly subject: readonly [number, number, number];
  /** World velocity (derived; for rigs that read subject velocity). */
  readonly velocity: readonly [number, number, number];
  /** Driver extras — see per-driver fields below. */
  readonly extras?: Readonly<Record<string, number | readonly number[] | boolean>>;
}

export type MotionDriver = "chase" | "impact" | "flight" | "collision" | "rail" | "pacing";

const clampDt = (t: number) => Math.max(0, t);

/** Shared: numerical velocity from the position fn, backward difference. */
function sample(driverPos: (t: number) => readonly [number, number, number], t: number, dt = 1e-3): SubjectFrame {
  const t0 = clampDt(t - dt);
  const p = driverPos(t);
  const p0 = driverPos(t0);
  const vel: [number, number, number] = [(p[0] - p0[0]) / dt, (p[1] - p0[1]) / dt, (p[2] - p0[2]) / dt];
  return { subject: p, velocity: vel };
}

/** chase: subject runs a figure-8 fast (speed FOV reads on straights). */
const chasePos = (t: number) =>
  [Math.sin(t * 0.9) * 7, 0.5, Math.sin(t * 1.8) * 3.5] as const;

/** impact: subject holds near origin; a hit lands at t=0.6 s (trauma pulse). */
const impactPos = (_t: number) => [0, 0.5, 0] as const;

/** flight: subject flies a climbing S-turn so the flight rig banks. */
const flightPos = (t: number) =>
  [Math.sin(t * 0.7) * 6, 1.2 + Math.sin(t * 0.35) * 1.2, Math.cos(t * 0.7) * 6 - 2] as const;

/** collision: subject walks a lane parallel to a wall column so the
 *  sphere-cast probe must pull the eye in front of occluders. Collider
 *  columns ride in `extras` (adapters place matching geometry). */
const collisionPos = (t: number) => [((t * 3) % 24) - 12, 0.5, 0] as const;
const COLLIDERS: readonly (readonly [number, number, number])[] = [
  [-9, 1, 0.9], [-6, 1, -0.9], [-3, 1, 0.9], [0, 1, -0.9],
  [3, 1, 0.9], [6, 1, -0.9], [9, 1, 0.9]
];

/** rail: subject rides the SAME closed 6-point rail the S11 test pins —
 *  the scripted shot is a dolly view of `hero` at `pointAt(t / LOOP)`. */
export const MOTION_RAIL_POINTS: readonly (readonly [number, number, number])[] = [
  [6, 0.5, 0], [4.2, 1, 4.2], [0, 1.5, 6], [-4.2, 0.8, 4.2], [-6, 1.2, 0], [-3, 0.6, -4]
];
const RAIL_LOOP_SECONDS = 12;
const railPos = (t: number) => {
  // Traversal is uniform along the loop; the rail rig itself resolves the
  // spline — this script supplies the subject's linear loop fraction.
  const u = (t % RAIL_LOOP_SECONDS) / RAIL_LOOP_SECONDS;
  const angle = u * Math.PI * 2;
  return [Math.cos(angle) * 5, 0.9 + Math.sin(angle * 2) * 0.4, Math.sin(angle) * 5] as const;
};

/** pacing: a fast mover (12 u/s shuttle) so 120 Hz interpolation is visible. */
const PACING_SPAN = 12;
const pacingPos = (t: number) => {
  const u = (t * 12) % (PACING_SPAN * 2);
  const x = u < PACING_SPAN ? u - PACING_SPAN / 2 : PACING_SPAN * 1.5 - u;
  return [x, 0.5, 0] as const;
};

export function subjectFrame(driver: MotionDriver, t: number): SubjectFrame {
  switch (driver) {
    case "chase":
      return sample(chasePos, t);
    case "impact": {
      const f = sample(impactPos, t);
      return { ...f, extras: { hitAt: 0.6, hit: t >= 0.6 && t < 0.7 } };
    }
    case "flight": {
      const f = sample(flightPos, t);
      const v = f.velocity;
      const bank = Math.atan2(v[0], Math.abs(v[2]) + 1e-3); // turns read as bank
      return { ...f, extras: { bank } };
    }
    case "collision": {
      const f = sample(collisionPos, t);
      return { ...f, extras: { colliders: COLLIDERS.flat() } };
    }
    case "rail": {
      const f = sample(railPos, t);
      return { ...f, extras: { railLoopSeconds: RAIL_LOOP_SECONDS } };
    }
    case "pacing":
      return sample(pacingPos, t);
  }
}
