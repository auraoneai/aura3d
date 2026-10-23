/**
 * Drift & Deliver port: the driving model.
 *
 * A line-for-line port of the original game's `zr(dt)` car physics (plus the shake decay that its camera
 * function applies each step), kept free of any rendering or DOM. State and update order are the original's:
 * the hidden values that `__tp` does not reset (steering smoothing `steer`, the drift lean `lean`, the stuck
 * timer `stuck`, boost) carry across teleports exactly as they do in the game.
 */

export const CONFIG = {
  CAR_MAX_SPEED: 58,
  CAR_ACCELERATION: 26,
  CAR_BRAKE: 40,
  GRIP: 12,
  DRIFT_GRIP: 2.6,
  TURN_RATE: 2.15,
  BOOST_MULTIPLIER: 1.75,
  BOOST_DRAIN_RATE: 0.32,
  DRIFT_REFILL_RATE: 0.3,
  CAMERA_CHASE: 2.7
} as const;

/** Original world constants (`Wt`, `Yt`, `Lt`, `Ft`): block pitch, street half width, block half size, city half extent. */
export const WORLD = { pitch: 60, streetHalf: 8.5, blockHalf: 21.5, extent: 450, xClamp: 476, zMin: -476, zMax: 498 } as const;

export interface Keys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  shift: boolean;
  space: boolean;
}

export const NO_KEYS: Keys = { w: false, a: false, s: false, d: false, shift: false, space: false };

export type SolidKind = "hard" | "car" | "prop" | "post";

export interface Solid {
  x: number;
  z: number;
  hw: number;
  hd: number;
  kind: SolidKind;
}

export interface Footprint {
  halfW: number;
  halfD: number;
}

export interface CarState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  boost: number;
  drifting: boolean;
  boosting: boolean;
  shake: number;
  combo: number;
  comboTimer: number;
  /** World-frame velocity (`mr`). */
  vx: number;
  vz: number;
  /** Smoothed steering input (`wr`). */
  steer: number;
  /** Drift lean angle (`yr`), visual in the original but carried. */
  lean: number;
  /** Time spent pushing against something at under 2.2 m/s (`Mr`). */
  stuck: number;
}

export function createCar(): CarState {
  return { x: 30.1, z: -120, heading: 0, speed: 0, boost: 1, drifting: false, boosting: false, shake: 0, combo: 0, comboTimer: 0, vx: 0, vz: 0, steer: 0, lean: 0, stuck: 0 };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** `__tp`: position, heading, velocity and speed reset; steering smoothing, lean, stuck and boost carry. */
export function teleport(car: CarState, x: number, z: number, heading?: number): void {
  car.x = x;
  car.z = z;
  if (heading !== undefined) car.heading = heading;
  car.vx = 0;
  car.vz = 0;
  car.speed = 0;
}

interface Contact {
  nx: number;
  nz: number;
  depth: number;
  solid: Solid;
}

/** The original `oo(point, radius)`: push the probe point out of overlapping solids, report the deepest. */
function resolveSolids(solids: readonly Solid[], p: { x: number; z: number }, radius: number): Contact | null {
  let best: Contact | null = null;
  for (const s of solids) {
    const w = s.hw + radius;
    const d = s.hd + radius;
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    if (dx > -w && dx < w && dz > -d && dz < d) {
      const ox = w - Math.abs(dx);
      const oz = d - Math.abs(dz);
      const soft = s.kind === "prop" ? 0.34 : s.kind === "post" ? 0.7 : 1;
      let nx = 0;
      let nz = 0;
      let depth: number;
      if (ox < oz) {
        nx = dx < 0 ? -1 : 1;
        depth = ox;
        p.x += nx * ox * soft;
      } else {
        nz = dz < 0 ? -1 : 1;
        depth = oz;
        p.z += nz * oz * soft;
      }
      if (!best || depth > best.depth) best = { nx, nz, depth, solid: s };
    }
  }
  return best;
}

/** One physics step (`zr`) followed by the camera function's shake decay. Returns true while skidding. */
export function stepCar(car: CarState, dt: number, keys: Keys, solids: readonly Solid[] = [], footprint: Footprint = { halfW: 1, halfD: 2.2 }): boolean {
  const C = CONFIG;
  const t2 = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
  car.steer += (t2 - car.steer) * Math.min(1, 11 * dt);
  const n2 = Math.sin(car.heading);
  const o2 = Math.cos(car.heading);
  let a2 = car.vx * n2 + car.vz * o2;
  let r2 = car.vx * o2 - car.vz * n2;
  car.boosting = keys.shift && car.boost > 0.01 && a2 > 3;
  if (car.boosting) car.boost = Math.max(0, car.boost - C.BOOST_DRAIN_RATE * dt);
  else car.boost = Math.min(1, car.boost + 0.1 * dt);
  const s2 = C.CAR_MAX_SPEED * (car.boosting ? 1 : 1 / C.BOOST_MULTIPLIER);
  const i2 = C.CAR_ACCELERATION * (car.boosting ? C.BOOST_MULTIPLIER : 1);
  if (keys.w) a2 += i2 * dt * (1 - clamp(a2 / (1.15 * s2), 0, 0.92));
  if (keys.s) a2 -= (a2 > 1 ? C.CAR_BRAKE : 0.55 * C.CAR_ACCELERATION) * dt;
  a2 *= Math.exp(-(keys.w || keys.s ? (car.boosting ? 0.1 : 0.22) : 1.1) * dt);
  a2 = clamp(a2, -16, s2);
  car.drifting = keys.space && Math.abs(a2) > 7;
  const c2 = car.drifting ? C.DRIFT_GRIP : C.GRIP;
  r2 *= Math.exp(-c2 * dt);
  r2 = clamp(r2, -26, 26);
  const l2 = clamp(Math.abs(a2) / 34, 0, 1);
  const A2 = 0.42 + 0.58 * (1 - 0.82 * l2);
  const d2 = clamp(Math.abs(a2) / 4.5, 0, 1);
  const f2 = C.TURN_RATE * A2 * d2 * (car.drifting ? 1.45 : 1);
  const p2 = car.steer * f2 * (a2 < -0.5 ? -1 : 1) * dt;
  car.heading += p2;
  r2 -= p2 * a2 * (car.drifting ? 1.15 : 0.62);
  if (car.drifting) car.boost = Math.min(1, car.boost + C.DRIFT_REFILL_RATE * dt);
  const h2 = Math.sin(car.heading);
  const u2 = Math.cos(car.heading);
  car.vx = a2 * h2 + r2 * u2;
  car.vz = a2 * u2 - r2 * h2;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const g2 = footprint.halfD - 0.55 * footprint.halfW;
  const x2 = 1.06 * footprint.halfW;
  let m2 = 0;
  const probe = { x: 0, z: 0 };
  for (let pass = 0; pass < 2; pass++) {
    for (const e5 of [g2, -g2]) {
      probe.x = car.x + h2 * e5;
      probe.z = car.z + u2 * e5;
      const px = probe.x;
      const pz = probe.z;
      const hit = resolveSolids(solids, probe, x2);
      if (!hit) continue;
      car.x += probe.x - px;
      car.z += probe.z - pz;
      const into = car.vx * hit.nx + car.vz * hit.nz;
      if (into < 0) {
        const kind = hit.solid.kind;
        const restitution = kind === "hard" ? 0.16 : kind === "car" ? 0.28 : 0.02;
        const scale = kind === "prop" ? 0.16 : kind === "post" ? 0.42 : 1;
        car.vx -= into * hit.nx * (1 + restitution) * scale;
        car.vz -= into * hit.nz * (1 + restitution) * scale;
        m2 = Math.max(m2, -into * scale);
        const damp = kind === "prop" ? 0.985 : kind === "post" ? 0.94 : 0.9;
        car.vx *= damp;
        car.vz *= damp;
      }
    }
  }
  if ((keys.w || keys.s) && Math.hypot(car.vx, car.vz) < 2.2) car.stuck += dt;
  else car.stuck = 0;
  if (car.stuck > 0.45) {
    car.vx = 7 * -h2;
    car.vz = 7 * -u2;
    car.heading += 1.9 * (car.steer !== 0 ? (car.steer > 0 ? 1 : -1) : 1) * dt;
  }
  if (m2 > 6) {
    car.shake = Math.min(1, car.shake + 0.028 * m2);
    car.combo = 0;
    car.comboTimer = 0;
  }
  car.x = clamp(car.x, -WORLD.xClamp, WORLD.xClamp);
  car.z = clamp(car.z, WORLD.zMin, WORLD.zMax);
  car.speed = a2;
  const w2 = Math.atan2(r2, Math.max(2, Math.abs(a2)));
  car.lean += (clamp(w2, -0.72, 0.72) - car.lean) * Math.min(1, 8 * dt);
  const skidding = Math.abs(r2) > 4.5;
  // Camera function (chase view): shake decays while it is above 2e-3.
  if (car.shake > 2e-3) car.shake *= Math.exp(-6 * dt);
  return skidding;
}

/** Recorded state vector, in the reference's field order. */
export function stateVector(car: CarState): [number, number, number, number, number, number, number, number] {
  return [car.x, car.z, car.heading, car.speed, car.boost, car.drifting ? 1 : 0, car.boosting ? 1 : 0, car.shake];
}
