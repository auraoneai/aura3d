/**
 * Gridlock Courier (GU47 WP-28 GC-AN1, GC-L5): body pitch from the presented speed, and tail-lamp halos on braking
 * cars (the courier and every traffic car), all in one instanced draw.
 *
 * Presentation only (PRD D8): the pitch reads the presented speed of two render frames, the traffic braking flag reads
 * `TrafficCar.v` against its cruise `speed` (both written by `stepTraffic`, never by this file). Nothing is written back.
 *
 * Why halos and not lights: C-35 caps the practicals at 6 (5 sodium points and the headlight spot), so the brake
 * glow is emissive geometry that the bloom pass picks up (tail red #ff3b3b, PRD WP-28 identity).
 */
import { TAIL_RED } from "./fx";

/** Largest body pitch, radians (2.5 deg). */
export const PITCH_MAX = (2.5 * Math.PI) / 180;
/** Pitch per m/s^2 of longitudinal acceleration (a 15 m/s^2 stop reaches the cap). */
export const PITCH_PER_ACCEL = PITCH_MAX / 15;
/** A traffic car braking: slower than its cruise speed by more than this, m/s. */
export const BRAKE_EPS = 0.6;
/** Halo size (x, y, z) in metres and its height above the road. */
export const HALO = { w: 0.34, h: 0.16, d: 0.06, y: 0.82, inset: 0.28 } as const;
export const HALO_COLOR = TAIL_RED;

export interface PitchState {
  speed: number;
  pitch: number;
}

export const createPitch = (): PitchState => ({ speed: 0, pitch: 0 });

/**
 * One render frame of body pitch: nose down under braking, up under throttle (positive = nose down about the car's
 * x axis). `dt` 0 (manual frames) keeps the pitch; reduced motion halves it. Returns the new pitch.
 */
export function stepPitch(state: PitchState, speed: number, dt: number, reducedMotion = false): number {
  if (dt <= 0) {
    state.speed = speed;
    return state.pitch;
  }
  const accel = (Math.abs(speed) - Math.abs(state.speed)) / dt;
  state.speed = speed;
  const scale = reducedMotion ? 0.5 : 1;
  const want = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, -accel * PITCH_PER_ACCEL)) * scale;
  // springy settle (about 0.15 s)
  state.pitch += (want - state.pitch) * Math.min(1, dt * 7);
  return state.pitch;
}

/** True when a traffic car is held below its cruise speed (following, room or yield). */
export const trafficBraking = (t: { v: number; speed: number }): boolean => t.v < t.speed - BRAKE_EPS;

/** The courier brakes when the brake key is held while rolling forward. */
export const courierBraking = (brakeHeld: boolean, speed: number): boolean => brakeHeld && speed > 1;

/** Halo instance count for `traffic` cars plus the courier (two lamps each). */
export const haloCount = (traffic: number): number => 2 * (traffic + 1);

/**
 * Writes the halo instance matrices: two per car (courier first, then traffic in order), hidden (scale 0 under the
 * road) when not braking. `write(i, x, y, z, yaw, sx, sy, sz)` is the instanced mesh's matrix writer. Returns the
 * number of lit halos.
 */
export function placeHalos(
  courier: { x: number; z: number; yaw: number; halfW: number; halfD: number; braking: boolean },
  traffic: ArrayLike<number>,
  cars: readonly { v: number; speed: number; hw: number; hd: number }[],
  write: (i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) => void
): number {
  let lit = 0;
  const pair = (slot: number, x: number, z: number, yaw: number, hw: number, hd: number, on: boolean) => {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    for (const side of [-1, 1]) {
      const i = slot * 2 + (side < 0 ? 0 : 1);
      if (!on) {
        write(i, x, -50, z, 0, 0, 0, 0);
        continue;
      }
      const lat = side * Math.max(0.2, hw - HALO.inset);
      const back = hd + 0.02;
      write(i, x - s * back + c * lat, HALO.y, z - c * back - s * lat, yaw, HALO.w, HALO.h, HALO.d);
      lit++;
    }
  };
  pair(0, courier.x, courier.z, courier.yaw, courier.halfW, courier.halfD, courier.braking);
  cars.forEach((t, n) => pair(n + 1, traffic[3 * n]!, traffic[3 * n + 1]!, traffic[3 * n + 2]!, t.hw, t.hd, trafficBraking(t)));
  return lit;
}
