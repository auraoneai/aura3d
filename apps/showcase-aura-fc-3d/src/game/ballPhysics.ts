// Free-ball physics for the FC sim: quadratic air drag, Magnus curl, turf bounce with energy loss, rolling friction and
// a rolling-without-slipping orientation. Pure and deterministic (no clock, no RNG) so tests can measure trajectories.
import { BALL_R } from "./dims";
import { integrateQuat, quatToEulerZYX } from "./ballOrient";
import type { BallState } from "./types";

export const GRAVITY = 9.81;
export const BOUNCE_RESTITUTION = 0.55; // vertical speed kept per bounce (grass: 0.5–0.6)
export const BOUNCE_HORIZONTAL = 0.86;  // horizontal speed kept per bounce
export const ROLL_DECEL = 2.2;          // rolling friction (m/s²) until the ball stops (arcade 60 m pitch: a 20 m/s ball rolls ~47 m)
export const ROLL_STOP = 0.12;          // below this horizontal speed the ball is at rest (m/s)
export const HOP_MIN = 1.4;             // a rebound slower than this (m/s) is no visible hop: the ball settles into a roll
export const DRAG_K = 0.010;            // a = k·v² (1/m): ½ρ·Cd(0.2)·A/m for a 0.43 kg ball of 0.11 m radius
export const MAGNUS_K = 0.34;           // sidespin → lateral acceleration

type Ball = Pick<BallState, "x" | "y" | "z" | "vx" | "vy" | "vz" | "spin" | "rolling" | "mode" | "rotX" | "rotY" | "rotZ" | "quat">;

/** advance the ball's orientation by angular velocity ω (world axes, rad/s) and refresh the exported Euler angles */
export function spinBall(b: Ball, wx: number, wy: number, wz: number, dt: number): void {
  b.quat = integrateQuat(b.quat, wx, wy, wz, dt);
  const e = quatToEulerZYX(b.quat);
  b.rotX = e[0]; b.rotY = e[1]; b.rotZ = e[2];
}

/** One step of a loose / flying ball. Returns the vertical impact speed (m/s) when it struck the turf this step, else 0. */
export function stepFreeBall(b: Ball, dt: number): number {
  b.vy -= GRAVITY * dt;
  // quadratic air drag — a hard-struck ball sheds speed fast, a slow one barely at all
  const speed3 = Math.hypot(b.vx, b.vy, b.vz);
  const dragF = Math.max(0, 1 - DRAG_K * speed3 * dt);
  b.vx *= dragF; b.vy *= dragF; b.vz *= dragF;
  // Magnus curl: lateral acceleration perpendicular to travel, ∝ sidespin and speed
  const hv = Math.hypot(b.vx, b.vz);
  if (Math.abs(b.spin) > 0.05 && hv > 0.5 && !b.rolling) {
    const px = -b.vz / hv, pz = b.vx / hv;
    const acc = b.spin * MAGNUS_K * Math.min(1.3, hv * 0.09);
    b.vx += px * acc * dt;
    b.vz += pz * acc * dt;
  }
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  // roll about the axis perpendicular to travel (up × v) at v/r, plus the sidespin about the vertical
  spinBall(b, b.vz / BALL_R, b.spin * 1.4, -b.vx / BALL_R, dt);

  let impactSpeed = 0;
  // ground: bounce with energy loss, then roll with friction. The ball's centre settles at turf + radius.
  if (b.y <= BALL_R) {
    b.y = BALL_R;
    if (b.vy < -0.55) {
      impactSpeed = -b.vy;
      b.vy = impactSpeed * BOUNCE_RESTITUTION;
      b.vx *= BOUNCE_HORIZONTAL; b.vz *= BOUNCE_HORIZONTAL;
      b.spin *= 0.6;                      // the turf grabs the sidespin
      if (b.vy < HOP_MIN) {               // no visible hop left → roll
        b.vy = 0; b.rolling = true;
        if (b.mode === "flight") b.mode = "loose";
      }
    } else {
      b.vy = 0;
      b.rolling = true;
      if (b.mode === "flight") b.mode = "loose";
    }
  }
  if (b.rolling) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > ROLL_STOP) {
      const dec = Math.min(sp, ROLL_DECEL * dt);
      b.vx -= (b.vx / sp) * dec;
      b.vz -= (b.vz / sp) * dec;
    } else {
      b.vx = 0; b.vz = 0;
    }
    b.spin *= Math.exp(-1.6 * dt);
  }
  return impactSpeed;
}
