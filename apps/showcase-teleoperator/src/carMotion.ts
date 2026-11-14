/**
 * GD-16 / WP-08 vehicle motion & conformal lighting attachments:
 * - Underdamped body pitch spring over the sim's read-only `pitch`.
 * - 120 ms colour fade on traffic signal heads.
 * - Full 3D rotated (`pitch`, `yaw`, `roll`) conformal rear LED tail/brake lightbar transforms calibrated per fleet
 *   hull so rear lamps sit flush on the tapered fascia (never floating detached behind or above the car).
 * - Roof-mounted `10 Hz` spinning LiDAR crown pose (`pod-sensor-housing` + `pod-sensor-laser`) for autonomous pods.
 */
import type { AuraTransformSpec } from "@aura3d/engine";
import type { FittedSize, PlayableCarId } from "./rules";

/** Underdamped body spring: the nose dips past the sim pitch under braking and settles in about 0.4 s. */
export const PITCH_SPRING = { omega: 11, zeta: 0.55, max: 0.05 } as const;

export function createPitchSpring() {
  let value = 0;
  let velocity = 0;
  return {
    /** Advances the spring towards `target` (radians). Reduced motion: no overshoot, the sim pitch as is. */
    update(target: number, dt: number, motionOk: boolean): number {
      if (!motionOk) {
        value = target;
        velocity = 0;
        return value;
      }
      // semi-implicit Euler in 1/120 s substeps (stable for any frame time)
      let left = Math.min(Math.max(dt, 0), 0.25);
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 120);
        const accel = PITCH_SPRING.omega * PITCH_SPRING.omega * (target - value) - 2 * PITCH_SPRING.zeta * PITCH_SPRING.omega * velocity;
        velocity += accel * h;
        value += velocity * h;
        left -= h;
      }
      value = Math.max(-PITCH_SPRING.max, Math.min(PITCH_SPRING.max, value));
      return value;
    },
    get value(): number {
      return value;
    },
    reset(): void {
      value = 0;
      velocity = 0;
    }
  };
}

export const SIGNAL_FADE_S = 0.12;
export const SIGNAL_COLORS = ["#43d17a", "#ffb347", "#ff4a3d"] as const;

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Signal head colour `elapsed` seconds after a change from `from` to `to` (linear over `SIGNAL_FADE_S`). */
export function signalFadeColor(from: string, to: string, elapsed: number): string {
  const t = Math.max(0, Math.min(1, elapsed / SIGNAL_FADE_S));
  const a = hex(from);
  const b = hex(to);
  return toHex(a.map((v, i) => v + (b[i]! - v) * t));
}

/**
 * Hull-calibrated rear fascia & rooftop LiDAR mast anchor ratios. `cruiser` aligns its conformal crimson LED brake bars
 * flush on the sculpted `+Z` tailbar (`0.285 * height` ~ 0.83 m, `0.482 * length` ~ 1.88 m) and seats the spinning
 * LiDAR turret atop the obsidian aerodynamic rooftop sensor mast (`0.652 * height` ~ 1.89 m, `-0.04 * length` ~ -0.156 m).
 */
export const HULL_TAIL_MOUNT: Readonly<
  Record<PlayableCarId, { readonly heightFrac: number; readonly spreadFrac: number; readonly rearFrac: number; readonly barScale: readonly [number, number, number]; readonly roofCrownY: number | null; readonly roofCrownZ: number }>
> = {
  cruiser: { heightFrac: 0.285, spreadFrac: 0.3, rearFrac: 0.482, barScale: [1.08, 0.76, 0.75], roofCrownY: 0.652, roofCrownZ: -0.04 },
  coupe: { heightFrac: 0.36, spreadFrac: 0.31, rearFrac: 0.445, barScale: [1.05, 0.75, 0.8], roofCrownY: 0.76, roofCrownZ: -0.02 },
  truck: { heightFrac: 0.44, spreadFrac: 0.34, rearFrac: 0.465, barScale: [1.15, 0.95, 0.85], roofCrownY: null, roofCrownZ: 0 },
  gt: { heightFrac: 0.46, spreadFrac: 0.33, rearFrac: 0.455, barScale: [1.08, 0.7, 0.8], roofCrownY: null, roofCrownZ: 0 },
  interceptor: { heightFrac: 0.47, spreadFrac: 0.33, rearFrac: 0.455, barScale: [1.1, 0.72, 0.8], roofCrownY: 0.84, roofCrownZ: -0.05 }
};

type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number
];

function wrapAngleRad(a: number): number {
  let w = (a + Math.PI) % (Math.PI * 2);
  if (w < 0) w += Math.PI * 2;
  return w - Math.PI;
}

/**
 * Orthonormal vehicle body rotation matrix `R = R_y(yaw) * R_x(pitch) * R_z(roll)` (intrinsic YXZ:
 * road heading `yaw` around world +Y, braking/squat `pitch` around vehicle right +X, lane bank `roll` around forward -Z/+Z).
 */
export function carBodyMatrix(pitch: number, yaw: number, roll: number): Mat3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
  ];
}

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}

function rotYMat3(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c, 0, s,
    0, 1, 0,
    -s, 0, c
  ];
}

function rotateByMat3(m: Mat3, local: readonly [number, number, number]): [number, number, number] {
  const [lx, ly, lz] = local;
  return [
    m[0] * lx + m[1] * ly + m[2] * lz,
    m[3] * lx + m[4] * ly + m[5] * lz,
    m[6] * lx + m[7] * ly + m[8] * lz
  ];
}

/**
 * Decomposes a rotation matrix into `@aura3d/engine` `"ZYX"` Euler `[rx, ry, rz]` (`R = R_z(rz) * R_y(ry) * R_x(rx)`),
 * choosing the continuous branch closest to `preferYaw` so pitch + yaw + roll banking and `10 Hz` LiDAR spin never flip.
 */
export function eulerZYXFromMat3(m: Mat3, preferYaw = 0): [number, number, number] {
  const sinRy = Math.max(-1, Math.min(1, -m[6]));
  if (Math.abs(sinRy) < 0.999999) {
    const ryA = Math.asin(sinRy);
    const rxA = Math.atan2(m[7], m[8]);
    const rzA = Math.atan2(m[3], m[0]);

    const ryB = ryA >= 0 ? Math.PI - ryA : -Math.PI - ryA;
    const rxB = Math.atan2(-m[7], -m[8]);
    const rzB = Math.atan2(-m[3], -m[0]);

    const errA = Math.abs(wrapAngleRad(ryA - preferYaw));
    const errB = Math.abs(wrapAngleRad(ryB - preferYaw));
    return errB + 1e-6 < errA ? [rxB, ryB, rzB] : [rxA, ryA, rzA];
  }
  const ry = sinRy >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const rx = Math.atan2(-m[5], m[4]);
  return [rx, ry, 0];
}

/** Exact `@aura3d/engine` `"ZYX"` Euler `[rx, ry, rz]` for a vehicle body with `(pitch, yaw, roll)` attitude. */
export function carBodyEulerZYX(pitch: number, yaw: number, roll: number): [number, number, number] {
  return eulerZYXFromMat3(carBodyMatrix(pitch, yaw, roll), yaw);
}

/** Rotate a body-local offset `[lx, ly, lz]` by vehicle attitude `(pitch, yaw, roll)` (`R_y(yaw) * R_x(pitch) * R_z(roll)`). */
export function rotateBodyPoint(local: readonly [number, number, number], pitch: number, yaw: number, roll: number): [number, number, number] {
  return rotateByMat3(carBodyMatrix(pitch, yaw, roll), local);
}

export interface CarBodyPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}

/** Conformal left + right rear LED brake/tail lightbar instance transforms in view space (`"ZYX"` engine Euler). */
export function conformalRearLampTransforms(pose: CarBodyPose, size: FittedSize, carId: PlayableCarId): [AuraTransformSpec, AuraTransformSpec] {
  const m = HULL_TAIL_MOUNT[carId];
  const ly = size.height * m.heightFrac;
  const lz = size.length * m.rearFrac;
  const spread = size.width * m.spreadFrac;
  const bodyMat = carBodyMatrix(pose.pitch, pose.yaw, pose.roll);
  const left = rotateByMat3(bodyMat, [-spread, ly, lz]);
  const right = rotateByMat3(bodyMat, [spread, ly, lz]);
  const leftRot = eulerZYXFromMat3(mulMat3(bodyMat, rotYMat3(0.08)), pose.yaw + 0.08);
  const rightRot = eulerZYXFromMat3(mulMat3(bodyMat, rotYMat3(-0.08)), pose.yaw - 0.08);
  return [
    { position: [pose.x + left[0], pose.y + left[1], pose.z + left[2]], rotation: leftRot, scale: [...m.barScale] },
    { position: [pose.x + right[0], pose.y + right[1], pose.z + right[2]], rotation: rightRot, scale: [...m.barScale] }
  ];
}

/** 3D roof LiDAR crown pose (`10 Hz` body-axis spinning laser slit) for autonomous fleet hulls (`null` on pure manual muscle/truck). */
export function roofSensorCrownPose(pose: CarBodyPose, size: FittedSize, carId: PlayableCarId, presentClock: number, motionOk: boolean): {
  readonly position: [number, number, number];
  readonly laserPosition: [number, number, number];
  readonly housingRot: [number, number, number];
  readonly laserRot: [number, number, number];
} | null {
  const m = HULL_TAIL_MOUNT[carId];
  if (m.roofCrownY === null) return null;
  const bodyMat = carBodyMatrix(pose.pitch, pose.yaw, pose.roll);
  const baseLocal: readonly [number, number, number] = [0, size.height * m.roofCrownY, size.length * m.roofCrownZ];
  const off = rotateByMat3(bodyMat, baseLocal);
  const laserOff = rotateByMat3(bodyMat, [baseLocal[0], baseLocal[1] + 0.01, baseLocal[2]]);
  const spin = motionOk ? (presentClock * Math.PI * 20) % (Math.PI * 2) : 0;
  return {
    position: [pose.x + off[0], pose.y + off[1], pose.z + off[2]],
    laserPosition: [pose.x + laserOff[0], pose.y + laserOff[1], pose.z + laserOff[2]],
    housingRot: eulerZYXFromMat3(bodyMat, pose.yaw),
    laserRot: eulerZYXFromMat3(mulMat3(bodyMat, rotYMat3(spin)), pose.yaw + spin)
  };
}
