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
 * Hull-calibrated rear fascia anchor ratios. `cruiser` includes a tall roof sensor mast in its fitted `height` (2.90 m),
 * so its rear beltline sits at `0.285 * height` (~0.83 m) and slightly recessed into the rounded tail (`0.425 * length`).
 */
export const HULL_TAIL_MOUNT: Readonly<
  Record<PlayableCarId, { readonly heightFrac: number; readonly spreadFrac: number; readonly rearFrac: number; readonly barScale: readonly [number, number, number]; readonly roofCrownY: number | null; readonly roofCrownZ: number }>
> = {
  cruiser: { heightFrac: 0.285, spreadFrac: 0.29, rearFrac: 0.425, barScale: [0.92, 0.72, 0.75], roofCrownY: 0.895, roofCrownZ: -0.04 },
  coupe: { heightFrac: 0.36, spreadFrac: 0.31, rearFrac: 0.445, barScale: [1.05, 0.75, 0.8], roofCrownY: 0.76, roofCrownZ: -0.02 },
  truck: { heightFrac: 0.44, spreadFrac: 0.34, rearFrac: 0.465, barScale: [1.15, 0.95, 0.85], roofCrownY: null, roofCrownZ: 0 },
  gt: { heightFrac: 0.46, spreadFrac: 0.33, rearFrac: 0.455, barScale: [1.08, 0.7, 0.8], roofCrownY: null, roofCrownZ: 0 },
  interceptor: { heightFrac: 0.47, spreadFrac: 0.33, rearFrac: 0.455, barScale: [1.1, 0.72, 0.8], roofCrownY: 0.84, roofCrownZ: -0.05 }
};

/** Rotate a body-local offset `[lx, ly, lz]` by Euler `(pitch, yaw, roll)` (XYZ intrinsic, matching `setRotation`). */
export function rotateBodyPoint(local: readonly [number, number, number], pitch: number, yaw: number, roll: number): [number, number, number] {
  const [lx, ly, lz] = local;
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  const x1 = lx * cz - ly * sz;
  const y1 = lx * sz + ly * cz;
  const z1 = lz;

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;

  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const x3 = x2;
  const y3 = y2 * cx - z2 * sx;
  const z3 = y2 * sx + z2 * cx;
  return [x3, y3, z3];
}

export interface CarBodyPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}

/** Conformal left + right rear LED brake/tail lightbar instance transforms in view space. */
export function conformalRearLampTransforms(pose: CarBodyPose, size: FittedSize, carId: PlayableCarId): [AuraTransformSpec, AuraTransformSpec] {
  const m = HULL_TAIL_MOUNT[carId];
  const ly = size.height * m.heightFrac;
  const lz = size.length * m.rearFrac;
  const spread = size.width * m.spreadFrac;
  const left = rotateBodyPoint([-spread, ly, lz], pose.pitch, pose.yaw, pose.roll);
  const right = rotateBodyPoint([spread, ly, lz], pose.pitch, pose.yaw, pose.roll);
  return [
    { position: [pose.x + left[0], pose.y + left[1], pose.z + left[2]], rotation: [pose.pitch, pose.yaw + 0.08, pose.roll], scale: [...m.barScale] },
    { position: [pose.x + right[0], pose.y + right[1], pose.z + right[2]], rotation: [pose.pitch, pose.yaw - 0.08, pose.roll], scale: [...m.barScale] }
  ];
}

/** 3D roof LiDAR crown pose (`10 Hz` spinning laser slit) for autonomous fleet hulls (`null` on pure manual muscle/truck). */
export function roofSensorCrownPose(pose: CarBodyPose, size: FittedSize, carId: PlayableCarId, presentClock: number, motionOk: boolean): {
  readonly position: [number, number, number];
  readonly housingRot: [number, number, number];
  readonly laserRot: [number, number, number];
} | null {
  const m = HULL_TAIL_MOUNT[carId];
  if (m.roofCrownY === null) return null;
  const off = rotateBodyPoint([0, size.height * m.roofCrownY, size.length * m.roofCrownZ], pose.pitch, pose.yaw, pose.roll);
  const spin = motionOk ? (presentClock * Math.PI * 20) % (Math.PI * 2) : 0;
  return {
    position: [pose.x + off[0], pose.y + off[1], pose.z + off[2]],
    housingRot: [pose.pitch, pose.yaw, pose.roll],
    laserRot: [pose.pitch, pose.yaw + spin, pose.roll]
  };
}
