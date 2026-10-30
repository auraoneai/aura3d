// Glint Courier — presentation motion (DD47-AN1, DD47-AN2). Pure maths, unit-tested; world.ts applies it to the
// courier node and the lamp. Never feeds back into the sim (PRD D8).

/** Yaw easing time constant (s) and the largest yaw step drawn in one frame. */
export const YAW_TAU = 0.09;
export const YAW_MAX_STEP = Math.PI / 4;
/** Bank at full turn rate, radians (12 degrees); reduced motion draws 30% of every amplitude. */
export const BANK_MAX = (12 * Math.PI) / 180;
export const REDUCED_AMPLITUDE = 0.3;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export interface CourierPose { yaw: number; roll: number }

/** Eases the drawn yaw toward the travel yaw and banks into the turn (roll follows the remaining yaw error). */
export function stepCourierPose(pose: CourierPose, targetYaw: number, dt: number, reducedMotion: boolean): CourierPose {
  const err = wrap(targetYaw - pose.yaw);
  const k = 1 - Math.exp(-Math.max(0, dt) / YAW_TAU);
  const step = Math.max(-YAW_MAX_STEP, Math.min(YAW_MAX_STEP, err * k));
  const yaw = wrap(pose.yaw + step);
  const amp = reducedMotion ? REDUCED_AMPLITUDE : 1;
  // a 90-degree turn still to go banks fully; the bank eases out as the yaw settles
  const rest = wrap(targetYaw - yaw);
  const roll = -Math.max(-1, Math.min(1, rest / (Math.PI / 2))) * BANK_MAX * amp;
  return { yaw, roll };
}

/** Board power-up wave (READY) and clear sweep: a front that crosses the board from the spawn row outward. */
export const WAVE_SECONDS = 1.2;
/** Lamp dims to this fraction during the clear sweep. */
export const CLEAR_LAMP_DIM = 0.4;

/**
 * Brightness (0..1) a trace at `distance` tiles from the wave origin shows `t` seconds after the wave starts: lit
 * behind the front, dark ahead of it; everything is lit once the wave is done. Reduced motion: a uniform fade-in.
 */
export function waveLevel(distance: number, t: number, maxDistance: number, reducedMotion: boolean): number {
  if (t <= 0) return 0;
  if (t >= WAVE_SECONDS) return 1;
  const u = t / WAVE_SECONDS;
  if (reducedMotion) return u;
  const front = u * (maxDistance + 2);
  return Math.max(0, Math.min(1, (front - distance) / 2));
}

type V3 = readonly [number, number, number];

/** A camera shot as rail points (world space) and a look-at, before the engine rig is built. */
export interface ShotPlan { readonly points: readonly V3[]; readonly lookAt: V3; readonly duration: number }

/**
 * DD47-C1 board intro (1.5 s READY): a low macro pass over the courier's spawn, then a rise into the play rig.
 * `rig` is the fitted play pose so the second shot lands exactly where the game camera takes over.
 */
export function introShots(spawn: V3, rig: { position: V3; target: V3 }): readonly ShotPlan[] {
  const [sx, , sz] = spawn;
  return [
    { points: [[sx - 3.2, 1.6, sz + 3.4], [sx + 1.2, 1.3, sz + 2.6]], lookAt: [sx, 0.3, sz], duration: 0.7 },
    { points: [[sx + 1.2, 1.3, sz + 2.6], [rig.position[0] * 0.5, rig.position[1] * 0.55, rig.position[2] * 0.7], [...rig.position]], lookAt: rig.target, duration: 0.8 }
  ];
}

/** DD47-C1 clear orbit: 2 s, a quarter turn around the board centre at the play rig's height and distance. */
export function clearOrbitShot(rig: { position: V3; target: V3 }, steps = 6): ShotPlan {
  const [px, py, pz] = rig.position;
  const r = Math.hypot(px, pz), a0 = Math.atan2(px, pz);
  const points: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (i / steps) * (Math.PI / 2);
    points.push([Math.sin(a) * r, py, Math.cos(a) * r]);
  }
  return { points, lookAt: rig.target, duration: 2 };
}

/** Sequences are skipped on reduced motion and on captures (autoplay, freeze or a webdriver), so stills stay still. */
export function cinematicsAllowed(reducedMotion: boolean, search: string, webdriver: boolean): boolean {
  if (reducedMotion || webdriver) return false;
  const p = new URLSearchParams(search);
  return !(p.has("freeze") || p.get("autoplay") === "1" || p.get("demo") === "1" || p.get("cinematics") === "0");
}
