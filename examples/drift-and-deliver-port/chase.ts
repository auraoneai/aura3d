/**
 * Drift & Deliver port: the chase camera, ported from the original's camera function (`Cr`) as pure math.
 * Follow heading is smoothed (`CAMERA_CHASE`), the eye trails the car by 5.9 m + 0.048 x speed (+1.2 m while
 * boosting), the look target leads by 5 m + 0.3 x speed, shake is a two-sine wobble scaled by the car's shake
 * plus a speed term, and the field of view opens up with speed and boost.
 */
import { CONFIG, clamp } from "./sim";

export interface ChaseInput {
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  boosting: boolean;
  shake: number;
}

export interface ChaseState {
  /** Smoothed follow heading (`br`). */
  heading: number;
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  /** Camera clock used by the shake wobble (`Gr.t`). */
  time: number;
}

const wobble = (t: number, amp: number, phase: number): number => (0.62 * Math.sin(t * (6.1 + phase)) + 0.38 * Math.sin(t * (11.3 + 1.7 * phase))) * amp;

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
}

/** The original's `Dr()`: the snap used after a teleport. */
export function snapChase(c: ChaseInput): ChaseState {
  const s = Math.sin(c.heading);
  const k = Math.cos(c.heading);
  return {
    heading: c.heading,
    eye: [c.x - 10.6 * s, c.y + 4.3, c.z - 10.6 * k],
    look: [c.x + 5 * s, c.y + 1.25, c.z + 5 * k],
    fov: 56,
    time: 0
  };
}

export function stepChase(cam: ChaseState, c: ChaseInput, dt: number, groundAt: (x: number, z: number) => number = () => 0): void {
  cam.time += dt;
  const speed = Math.abs(c.speed);
  const follow = 0.34 + 0.66 * clamp(speed / 15, 0, 1);
  cam.heading = angleLerp(cam.heading, c.heading, 1 - Math.exp(-CONFIG.CAMERA_CHASE * follow * dt));
  const sn = Math.sin(cam.heading);
  const cs = Math.cos(cam.heading);
  const back = 5.9 + 0.048 * speed + (c.boosting ? 1.2 : 0);
  let ey = c.y + 2.5 + 0.013 * speed;
  const tx = c.x - sn * back;
  const tz = c.z - cs * back;
  ey = Math.max(ey, groundAt(tx, tz) + 1.9);
  const k = 1 - Math.exp(-8 * dt);
  cam.eye[0] += (tx - cam.eye[0]) * k;
  cam.eye[1] += (ey - cam.eye[1]) * k;
  cam.eye[2] += (tz - cam.eye[2]) * k;
  const speedShake = 0.075 * clamp((speed - 22) / 40, 0, 1) + (c.boosting ? 0.05 : 0);
  if (c.shake > 2e-3 || speedShake > 0) {
    const amp = 0.9 * c.shake + speedShake;
    cam.eye[0] += wobble(cam.time, amp, 0);
    cam.eye[1] += wobble(cam.time, 0.7 * amp, 1.3);
  }
  const lead = 5 + 0.3 * speed;
  const lk = 1 - Math.exp(-10 * dt);
  cam.look[0] += (c.x + sn * lead - cam.look[0]) * lk;
  cam.look[1] += (c.y + 1.25 - cam.look[1]) * lk;
  cam.look[2] += (c.z + cs * lead - cam.look[2]) * lk;
  const fovTarget = 56 + clamp(0.28 * speed, 0, 12) + (c.boosting ? 7 : 0);
  cam.fov += (fovTarget - cam.fov) * (1 - Math.exp(-4 * dt));
}
