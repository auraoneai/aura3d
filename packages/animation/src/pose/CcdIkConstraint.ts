/**
 * T3.4 (PRD-06 §7.1/7.2) — `CcdIkConstraint`: cyclic coordinate descent over a
 * named joint chain — each iteration sweeps tip-to-root rotating every joint so
 * the tip's direction toward the target maximally closes. Cone limits per bone
 * (`coneLimitDeg`), hard cap `iterations ≤ 8`, early-out at `tolerance`
 * (default 1 mm).
 *
 * Pose-space like the rest of the lane: the target arrives world-space and is
 * transformed into model space by `invertTRS(modelMatrix)` before the sweep.
 */

import type { PoseBuffer } from "./PoseBuffer.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";

export interface CcdIkConstraintSpec {
  /** Ordered joint names root→tip. */
  readonly chain: readonly string[];
  /** Max sweep iterations — clamped to 8 (default 8). */
  readonly iterations?: number;
  /** Early-out distance in metres (default 1 mm). */
  readonly tolerance?: number;
  /** Per-bone cone limits (degrees) — caps each joint's per-iteration rotation. */
  readonly coneLimitDeg?: Readonly<Record<string, number>>;
  /** Blend of the solve into the pose (1 = full, 0 = no-op). */
  readonly weight?: number;
}

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

interface Frame {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

function jointIndex(skeleton: SkeletonBinding, name: string): number {
  const indices = skeleton.jointIndicesByName.get(name);
  if (!indices || indices.length === 0) throw new Error(`CcdIkConstraint: unknown bone "${name}".`);
  return indices[0]!;
}

function frames(pose: PoseBuffer, skeleton: SkeletonBinding): Frame[] {
  const cache = new Map<number, Frame>();
  const resolve = (joint: number): Frame => {
    const hit = cache.get(joint);
    if (hit) return hit;
    const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
    const rot: Quat = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!];
    const scl: Vec3 = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!];
    const parent = skeleton.parentIndices[joint] ?? -1;
    if (parent < 0 || parent >= skeleton.boneCount || parent === joint) {
      const f: Frame = { position: pos, rotation: rot, scale: scl };
      cache.set(joint, f);
      return f;
    }
    const pf = resolve(parent);
    const scaled: Vec3 = [pos[0] * pf.scale[0], pos[1] * pf.scale[1], pos[2] * pf.scale[2]];
    const rotated = rotateVec3(pf.rotation, scaled);
    const f: Frame = {
      position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
      rotation: multiplyQuat(pf.rotation, rot),
      scale: [pf.scale[0] * scl[0], pf.scale[1] * scl[1], pf.scale[2] * scl[2]]
    };
    cache.set(joint, f);
    return f;
  };
  const out: Frame[] = [];
  for (let i = 0; i < skeleton.boneCount; i += 1) out.push(resolve(i));
  return out;
}

function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz
  ] as const;
}

function axisAngle(axis: Vec3, radians: number): Quat {
  const half = radians / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l <= 1e-9 ? [0, 0, 0] : [v[0] / l, v[1] / l, v[2] / l];
}

function invertModelTRS(matrix: Float32Array | readonly number[]): { rotation: Quat; scale: Vec3; position: Vec3 } {
  const sx = Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!);
  const sy = Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!);
  const sz = Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!);
  const m00 = matrix[0]! / (sx || 1), m10 = matrix[1]! / (sx || 1), m20 = matrix[2]! / (sx || 1);
  const m01 = matrix[4]! / (sy || 1), m11 = matrix[5]! / (sy || 1), m21 = matrix[6]! / (sy || 1);
  const m02 = matrix[8]! / (sz || 1), m12 = matrix[9]! / (sz || 1), m22 = matrix[10]! / (sz || 1);
  const trace = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return { rotation: [q[0] / l, q[1] / l, q[2] / l, q[3] / l], scale: [sx, sy, sz], position: [matrix[12]!, matrix[13]!, matrix[14]!] };
}

export interface CcdIkResult {
  readonly iterations: number;
  readonly tipError: number;
  readonly reached: boolean;
}

/**
 * Evaluate a CCD chain: sweeps `spec.chain` tip→root up to `iterations` times,
 * rotating each joint by the minimal arc that pulls the tip toward `target`,
 * cone-capped per bone. Writes local rotations back into `pose`.
 */
export function solveCcdIk(
  pose: PoseBuffer,
  skeleton: SkeletonBinding,
  modelMatrix: Float32Array | readonly number[],
  spec: CcdIkConstraintSpec,
  target: Vec3
): CcdIkResult {
  const weight = spec.weight ?? 1;
  if (weight <= 0 || spec.chain.length === 0) return { iterations: 0, tipError: Infinity, reached: false };
  const maxIterations = Math.min(8, spec.iterations ?? 8);
  const tolerance = spec.tolerance ?? 0.001;

  const invModel = invertModelTRS(modelMatrix);
  const shifted: Vec3 = [target[0] - invModel.position[0], target[1] - invModel.position[1], target[2] - invModel.position[2]];
  const invRot: Quat = [-invModel.rotation[0], -invModel.rotation[1], -invModel.rotation[2], invModel.rotation[3]];
  const scaledShift = rotateVec3(invRot, shifted);
  const targetLocal: Vec3 = [
    scaledShift[0] / (invModel.scale[0] || 1),
    scaledShift[1] / (invModel.scale[1] || 1),
    scaledShift[2] / (invModel.scale[2] || 1)
  ];

  const chainIndices = spec.chain.map((name) => jointIndex(skeleton, name));
  const tipIndex = chainIndices[chainIndices.length - 1]!;

  let iterations = 0;
  let tipError = Infinity;
  for (let iter = 0; iter < maxIterations; iter += 1) {
    const current = frames(pose, skeleton); // refresh after each write below
    tipError = Math.hypot(
      current[tipIndex]!.position[0] - targetLocal[0],
      current[tipIndex]!.position[1] - targetLocal[1],
      current[tipIndex]!.position[2] - targetLocal[2]
    );
    if (tipError <= tolerance) break;
    iterations += 1;

    // Sweep tip→root (chain is ordered root→tip, so walk backwards).
    for (let i = chainIndices.length - 1; i >= 0; i -= 1) {
      const joint = chainIndices[i]!;
      const snapshot = frames(pose, skeleton);
      const jointPos = snapshot[joint]!.position;
      const tipPos = snapshot[tipIndex]!.position;
      const toTip: Vec3 = normalize([tipPos[0] - jointPos[0], tipPos[1] - jointPos[1], tipPos[2] - jointPos[2]]);
      const toTarget: Vec3 = normalize([targetLocal[0] - jointPos[0], targetLocal[1] - jointPos[1], targetLocal[2] - jointPos[2]]);
      if (Math.hypot(toTip[0], toTip[1], toTip[2]) <= 1e-9 || Math.hypot(toTarget[0], toTarget[1], toTarget[2]) <= 1e-9) continue;

      const cross: Vec3 = [
        toTip[1] * toTarget[2] - toTip[2] * toTarget[1],
        toTip[2] * toTarget[0] - toTip[0] * toTarget[2],
        toTip[0] * toTarget[1] - toTip[1] * toTarget[0]
      ];
      const crossLen = Math.hypot(cross[0], cross[1], cross[2]);
      const dot = Math.max(-1, Math.min(1, toTip[0] * toTarget[0] + toTip[1] * toTarget[1] + toTip[2] * toTarget[2]));
      let angle = Math.atan2(crossLen, dot);
      const coneLimit = spec.coneLimitDeg?.[spec.chain[i]!];
      if (coneLimit !== undefined) {
        angle = Math.min(angle, (coneLimit * Math.PI) / 180);
      }
      if (angle <= 1e-7 || crossLen <= 1e-9) continue;
      const axis: Vec3 = [cross[0] / crossLen, cross[1] / crossLen, cross[2] / crossLen];
      const rot = axisAngle(axis, angle);
      const worldNew = multiplyQuat(rot, snapshot[joint]!.rotation);
      const parent = skeleton.parentIndices[joint] ?? -1;
      const parentRot: Quat = parent >= 0 ? snapshot[parent]!.rotation : [0, 0, 0, 1];
      const inv: Quat = [-parentRot[0], -parentRot[1], -parentRot[2], parentRot[3]];
      const local = multiplyQuat(inv, worldNew);
      const ll = Math.hypot(local[0], local[1], local[2], local[3]) || 1;
      // Weight blends the CCD step with the current local rotation.
      const out = new Float32Array(4);
      slerpFlat(pose.rotations, joint * 4, local, weight, out);
      pose.rotations[joint * 4] = out[0]!;
      pose.rotations[joint * 4 + 1] = out[1]!;
      pose.rotations[joint * 4 + 2] = out[2]!;
      pose.rotations[joint * 4 + 3] = out[3]!;
    }
  }
  return { iterations, tipError, reached: tipError <= tolerance };
}

function slerpFlat(current: Float32Array, offset: number, local: Quat, t: number, out: Float32Array): void {
  let ax = current[offset]!, ay = current[offset + 1]!, az = current[offset + 2]!, aw = current[offset + 3]!;
  let bx = local[0], by = local[1], bz = local[2], bw = local[3];
  let d = ax * bx + ay * by + az * bz + aw * bw;
  if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  let s0 = 1 - t, s1 = t;
  if (d < 0.9995) {
    const theta = Math.acos(d);
    const sin = Math.sin(theta);
    s0 = Math.sin(s0 * theta) / sin;
    s1 = Math.sin(s1 * theta) / sin;
  }
  out[0] = ax * s0 + bx * s1;
  out[1] = ay * s0 + by * s1;
  out[2] = az * s0 + bz * s1;
  out[3] = aw * s0 + bw * s1;
}
