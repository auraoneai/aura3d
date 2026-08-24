/**
 * Lander authored integration — thrust, RCS attitude, fuel, gravity, storm gusts.
 *
 * This is DOCUMENTED NON-PHYSICAL arcade motion (PRD §5): a fixed-dt semi-implicit
 * Euler integration with authored constants. It exists so the route stays fully
 * deterministic (ghost replay reproduces trajectories hash-for-hash) and so no root
 * route may claim physical-simulation parity. Terrain contact detection still goes
 * through the real Rapier heightfield collider via the contact proxy in main.ts.
 */
import type { GustWindow } from "./sites";

/** Authored moon-gravity-style constant, m/s². */
export const LANDER_GRAVITY = -1.7;
/** Main engine acceleration at full throttle along lander up, m/s². */
export const MAIN_THRUST_ACCELERATION = 4.4;
/** RCS yaw torque rate, radians/s². */
export const RCS_YAW_RATE = 2.6;
/** Signed lateral acceleration from the side RCS jets, m/s². */
export const RCS_LATERAL_ACCELERATION = 0.9;
/** Tilt gained per second of sustained lateral RCS, degrees. */
export const TILT_GAIN_PER_SECOND = 26;
/** Attitude self-righting rate (RCS damping), degrees/s. */
export const TILT_DAMPING_PER_SECOND = 14;
export const MAX_TILT_DEG = 34;
/** Fuel burn per second at full main thrust; RCS burns at 22% of this. */
export const FUEL_BURN_PER_SECOND = 1;
export const RCS_FUEL_FRACTION = 0.22;
/** Velocity clamp keeps blowups out of the deterministic replay. */
export const MAX_SPEED = 60;

export interface Controls {
  /** 0..1 main throttle. */
  readonly thrust: number;
  /** -1..1 rotate demand (A/D). */
  readonly rotate: number;
}

export interface LanderState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Yaw heading, radians. */
  readonly yaw: number;
  /** Tilt off vertical in the direction of lateral motion, degrees. */
  readonly tiltDeg: number;
  /** Remaining fuel in burn-seconds. */
  readonly fuel: number;
  /** Attempt clock, seconds (gust clock shares it). */
  readonly time: number;
}

export function createLanderState(
  spawn: { readonly x: number; readonly y: number; readonly z: number },
  fuelBudget: number
): LanderState {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: Math.PI,
    tiltDeg: 0,
    fuel: fuelBudget,
    time: 0
  };
}

/** Sinusoidal storm gust force with a signed value; zero when no gust profile. */
export function gustForceAt(gust: GustWindow | undefined, timeSeconds: number): number {
  if (!gust) return 0;
  if (timeSeconds < gust.startSeconds) return 0;
  const phase = ((timeSeconds - gust.startSeconds) % gust.periodSeconds) / gust.periodSeconds;
  return Math.sin(phase * Math.PI * 2) * gust.amplitude;
}

/**
 * True while a gust telegraph should be audible/visible before the force applies:
 * inside warnLeadSeconds ahead of startSeconds, or lead seconds ahead of any cycle.
 */
export function gustTelegraphActive(gust: GustWindow | undefined, timeSeconds: number): boolean {
  if (!gust) return false;
  if (timeSeconds < gust.startSeconds - gust.warnLeadSeconds) return false;
  const sinceStart = timeSeconds - gust.startSeconds;
  if (sinceStart < 0) return true;
  const intoCycle = sinceStart % gust.periodSeconds;
  return intoCycle >= gust.periodSeconds - gust.warnLeadSeconds;
}

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

/**
 * Advance the authored state by one fixed step. Pure: same inputs, same output —
 * the property the ghost round-trip unit test depends on.
 */
export function stepLander(
  state: LanderState,
  controls: Controls,
  dt: number,
  gust?: GustWindow | undefined
): LanderState {
  const stepTime = state.time + dt;
  const hasFuel = state.fuel > 0;
  const throttle = hasFuel ? clamp(controls.thrust, 0, 1) : 0;
  const rotate = hasFuel ? clamp(controls.rotate, -1, 1) : 0;

  // Fuel first: burning stops the instant the tank reads empty.
  let fuel = state.fuel - throttle * FUEL_BURN_PER_SECOND * dt - Math.abs(rotate) * FUEL_BURN_PER_SECOND * RCS_FUEL_FRACTION * dt;
  fuel = Math.max(0, fuel);

  // RCS: yaw torque plus lean-in tilt.
  const yaw = state.yaw + rotate * RCS_YAW_RATE * dt;
  const tiltDelta = Math.abs(rotate) > 0.05
    ? Math.sign(rotate) * TILT_GAIN_PER_SECOND * dt * Math.abs(rotate)
    : -Math.sign(state.tiltDeg) * Math.min(Math.abs(state.tiltDeg), TILT_DAMPING_PER_SECOND * dt);
  const tiltDeg = clamp(state.tiltDeg + tiltDelta, -MAX_TILT_DEG, MAX_TILT_DEG);

  // This is a single-axis side/three-quarter lander: signed RCS tilt commands
  // signed world-X translation. Yaw remains a readable visual attitude cue,
  // but cannot rotate one control axis into a direction where A and D initially
  // accelerate the same way.
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const upAccel = Math.cos(tiltRad) * MAIN_THRUST_ACCELERATION * throttle;
  const lateralAccel = Math.sin(tiltRad) * MAIN_THRUST_ACCELERATION * throttle;

  // Storm-front scripted lateral force (sites 2 and 3).
  const gustX = gustForceAt(gust, stepTime);

  let vx = state.vx + (lateralAccel + rotate * RCS_LATERAL_ACCELERATION + gustX) * dt;
  let vy = state.vy + (upAccel + LANDER_GRAVITY) * dt;
  let vz = state.vz;

  // Deterministic velocity clamp.
  const speed = Math.hypot(vx, vy, vz);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }

  return {
    x: state.x + vx * dt,
    y: state.y + vy * dt,
    z: state.z + vz * dt,
    vx,
    vy,
    vz,
    yaw,
    tiltDeg,
    fuel,
    time: stepTime
  };
}

/** Horizontal speed magnitude, m/s. */
export function hspeedOf(state: LanderState): number {
  return Math.hypot(state.vx, state.vz);
}
