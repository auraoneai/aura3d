/**
 * GU47 IC-22 camera direction for Ion Circuit: a countdown sweep (a rail-like arc from a low side hero shot into the
 * chase pose), an afterburner FOV kick, and a slow finish orbit. Pure functions of the race state and wall time; they
 * only move the camera, never the sim (PRD D8). Off under `?look=original`, reduced motion (a cut to the chase pose,
 * the kick capped by `REDUCED_FOV_KICK` in world.ts) and `manual=1` (deterministic capture driving).
 */
import type { HeatsinkLookRow } from "./look";

export type Vec3Out = [number, number, number];

/** the countdown sweep: arc angle (radians, from behind the drone), start radius and height, matching the race's 3.2 s count */
export const SWEEP = { startAngle: (150 * Math.PI) / 180, startRadius: 13, startHeight: 4.2, seconds: 3.2 } as const;
/** the finish orbit: radius, height, angular speed and blend-in time */
export const ORBIT = { radius: 11, height: 3.4, speed: 0.32, blendSeconds: 1.4 } as const;
/** afterburner FOV kick in degrees (twilight); world.ts caps the total kick at 6 under reduced motion */
export const AFTERBURNER_KICK = 5;

const smooth = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

export interface DirectorInput {
  readonly state: string;
  /** seconds left on the countdown (race.countdown) */
  readonly countdown: number;
  /** seconds since the race finished (world-side clock) */
  readonly finishedFor: number;
  /** drone position */
  readonly target: readonly [number, number, number];
  /** chase pose this frame */
  readonly eye: readonly [number, number, number];
  readonly look: readonly [number, number, number];
}

/**
 * Directed eye and look for this frame, written into `eye` / `look`; returns the blend weight (0 = the chase pose is
 * used unchanged). `enabled` is false for the original look, reduced motion and manual capture.
 */
export function directCamera(row: HeatsinkLookRow, enabled: boolean, inp: DirectorInput, eye: Vec3Out, look: Vec3Out): number {
  eye[0] = inp.eye[0]; eye[1] = inp.eye[1]; eye[2] = inp.eye[2];
  look[0] = inp.look[0]; look[1] = inp.look[1]; look[2] = inp.look[2];
  if (!enabled || !row.camera.countdownSweep) return 0;
  const [tx, ty, tz] = inp.target;
  /* the chase eye's offset from the drone, as an azimuth / radius / height the arcs end on */
  const ox = inp.eye[0] - tx, oz = inp.eye[2] - tz;
  const baseAngle = Math.atan2(oz, ox);
  const baseRadius = Math.hypot(ox, oz) || 1;
  const baseHeight = inp.eye[1] - ty;
  let w = 0, angle = baseAngle, radius = baseRadius, height = baseHeight;
  if (inp.state === "countdown") {
    const t = smooth(1 - Math.max(0, inp.countdown) / SWEEP.seconds);
    w = 1 - t;
    angle = baseAngle + SWEEP.startAngle * w;
    radius = baseRadius + (SWEEP.startRadius - baseRadius) * w;
    height = baseHeight + (SWEEP.startHeight - baseHeight) * w;
  } else if (inp.state === "finished") {
    w = smooth(inp.finishedFor / ORBIT.blendSeconds);
    angle = baseAngle + ORBIT.speed * inp.finishedFor;
    radius = baseRadius + (ORBIT.radius - baseRadius) * w;
    height = baseHeight + (ORBIT.height - baseHeight) * w;
  }
  if (w <= 0) return 0;
  eye[0] = tx + Math.cos(angle) * radius; eye[1] = ty + height; eye[2] = tz + Math.sin(angle) * radius;
  /* look blends from the chase look-ahead to the drone itself (a hero framing) */
  look[0] = inp.look[0] + (tx - inp.look[0]) * w; look[1] = inp.look[1] + (ty + 0.6 - inp.look[1]) * w; look[2] = inp.look[2] + (tz - inp.look[2]) * w;
  return w;
}

/** afterburner FOV kick (degrees) for the twilight row; 0 for the original row */
export function afterburnerKick(row: HeatsinkLookRow, afterburner: boolean): number {
  return row.camera.countdownSweep && afterburner ? AFTERBURNER_KICK : 0;
}

/** IC-08 afterburner vignette pulse: extra vignette at full afterburner, and the attack / release rates (1/s) */
export const VIGNETTE_PULSE = { gain: 0.14, attack: 6, release: 2.5 } as const;

/**
 * One step of the afterburner vignette envelope (0..1). Reduced motion (or a look without a vignette) holds it at 0,
 * so the vignette stays at the look's base intensity.
 */
export function vignettePulse(row: HeatsinkLookRow, reduced: boolean, afterburner: boolean, envelope: number, dt: number): number {
  if (reduced || row.post.vignette === null) return 0;
  const target = afterburner ? 1 : 0;
  const rate = target > envelope ? VIGNETTE_PULSE.attack : VIGNETTE_PULSE.release;
  return envelope + (target - envelope) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

/** IC-12: drone heat as 8 quantised emissive steps, copper to white-hot (sRGB hex, intensity); step 0 = no glow */
export const HEAT_STEPS: readonly (readonly [string, number])[] = [
  ["#000000", 0], ["#5a1e08", 0.25], ["#8a2e0a", 0.45], ["#c8441a", 0.7], ["#e8641e", 0.95], ["#ff8a2e", 1.2], ["#ffc070", 1.5], ["#fff0d8", 1.9]
];

/** heat 0..1 to a step index; the original look never glows (step 0) */
export function heatStep(row: HeatsinkLookRow, heat: number): number {
  if (!row.wake.enabled) return 0;
  const h = Math.max(0, Math.min(1, heat));
  return Math.min(HEAT_STEPS.length - 1, Math.floor(h * HEAT_STEPS.length));
}
