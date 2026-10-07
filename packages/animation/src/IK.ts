import { lerpVec3, type Vec3 } from "./Keyframe.js";

export interface TwoBoneIkInput {
  readonly root: Vec3;
  readonly mid: Vec3;
  readonly end: Vec3;
  readonly target: Vec3;
  readonly pole?: Vec3;
  readonly weight?: number;
  readonly allowStretch?: boolean;
}

export interface TwoBoneIkResult {
  readonly root: Vec3;
  readonly mid: Vec3;
  readonly end: Vec3;
  readonly reached: boolean;
  readonly stretched: boolean;
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly targetDistance: number;
  readonly endDistanceToTarget: number;
  readonly poleInfluence: number;
}

export function solveTwoBoneIk(input: TwoBoneIkInput): TwoBoneIkResult {
  const weight = clamp(input.weight ?? 1, 0, 1);
  const upperLength = distance(input.root, input.mid);
  const lowerLength = distance(input.mid, input.end);
  if (upperLength <= 1e-6 || lowerLength <= 1e-6) {
    throw new Error("Two-bone IK requires non-zero upper and lower segment lengths.");
  }
  const targetDelta = subtract(input.target, input.root);
  const targetDistance = length(targetDelta);
  if (targetDistance <= 1e-6) {
    throw new Error("Two-bone IK target must be distinct from the root.");
  }

  const maxReach = upperLength + lowerLength;
  const minReach = Math.abs(upperLength - lowerLength) + 1e-5;
  const solveDistance = input.allowStretch ? targetDistance : clamp(targetDistance, minReach, maxReach - 1e-5);
  const axis = normalize(targetDelta);
  const poleDirection = projectedPoleDirection(input.root, axis, input.pole ?? input.mid);
  const adjacent = clamp((upperLength * upperLength + solveDistance * solveDistance - lowerLength * lowerLength) / (2 * solveDistance), 0, upperLength);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - adjacent * adjacent));
  const solvedEnd = add(input.root, scale(axis, solveDistance));
  const solvedMid = add(add(input.root, scale(axis, adjacent)), scale(poleDirection, height));
  const mid = lerpVec3(input.mid, solvedMid, weight);
  const end = lerpVec3(input.end, solvedEnd, weight);
  const endDistanceToTarget = distance(end, input.target);
  return {
    root: input.root,
    mid,
    end,
    reached: endDistanceToTarget <= 1e-3,
    stretched: targetDistance > maxReach && input.allowStretch === true,
    upperLength,
    lowerLength,
    targetDistance,
    endDistanceToTarget,
    poleInfluence: Math.abs(dot(normalize(subtract(mid, input.root)), poleDirection))
  };
}

/**
 * Convenience knee/elbow pole hint: a point offset from the mid-joint along a forward direction,
 * giving {@link solveTwoBoneIk} a stable bend plane (knees point forward, elbows back). Pure.
 */
export function kneePoleHint(root: Vec3, mid: Vec3, forward: Vec3, distance = 1): Vec3 {
  const dir = normalize(forward);
  const center: Vec3 = [(root[0] + mid[0]) / 2, (root[1] + mid[1]) / 2, (root[2] + mid[2]) / 2];
  return [center[0] + dir[0] * distance, center[1] + dir[1] * distance, center[2] + dir[2] * distance];
}

function projectedPoleDirection(root: Vec3, axis: Vec3, pole: Vec3): Vec3 {
  const poleDelta = subtract(pole, root);
  const projected = subtract(poleDelta, scale(axis, dot(poleDelta, axis)));
  const projectedLength = length(projected);
  if (projectedLength > 1e-6) return scale(projected, 1 / projectedLength);
  const fallback = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] as const : [1, 0, 0] as const;
  const fallbackProjected = subtract(fallback, scale(axis, dot(fallback, axis)));
  return normalize(fallbackProjected);
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function distance(left: Vec3, right: Vec3): number {
  return length(subtract(left, right));
}

function normalize(value: Vec3): Vec3 {
  const valueLength = length(value);
  if (valueLength <= 1e-6) return [0, 1, 0];
  return scale(value, 1 / valueLength);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// T3.1 — `solveTwoBoneIkRotations` (PRD-06 §7.2): pose-space two-bone IK that
// writes LOCAL ROTATIONS for the root and mid joints (the position-space
// `solveTwoBoneIk` above stays as a deprecated wrapper — call sites that only
// need positions keep working).
//
// Solved in MODEL space: the target is transformed by `invertTRS(modelMatrix)`,
// so no rotation needs to be decomposed from the model matrix at all.
// ---------------------------------------------------------------------------

import type { Mat4, Quat } from "./Keyframe.js";
import type { PoseBuffer } from "./pose/PoseBuffer.js";
import type { SkeletonBinding } from "./pose/SkeletonBinding.js";
import { multiplyQuatFlat, normalizeQuatFlat, slerpQuatFlat } from "./pose/quatFlat.js";

/** PRD-06 §7.1 `TwoBoneIkConstraintSpec` — resolved against a bound skeleton by name. */
export interface TwoBoneIkConstraintSpec {
  readonly root: string;
  readonly mid: string;
  readonly tip: string;
  /** Pole plane hint: "auto" keeps the current bend plane; a point or `{bone}` steers it. */
  readonly pole?: "auto" | readonly [number, number, number] | { readonly bone: string };
  /** Optional twist distribution bone (receives `twistWeight` of the plane-align twist). */
  readonly twistBone?: string;
  readonly twistWeight?: number;
  /** Blend of the solve into the current pose (1 = full solve, 0 = untouched). */
  readonly weight?: number;
  /** Reach stretch multiplier > 1 permits targets beyond limb length. */
  readonly allowStretch?: number;
}

interface JointFrame {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

/**
 * World-space (model-space) frame of every joint in `skeleton` under `pose`.
 * Parent transforms are memoized along `parentIndices` walks.
 */
function jointFrames(pose: PoseBuffer, skeleton: SkeletonBinding): JointFrame[] {
  const frames: (JointFrame | undefined)[] = new Array(skeleton.boneCount);
  const resolve = (index: number): JointFrame => {
    const cached = frames[index];
    if (cached) return cached;
    const parent = skeleton.parentIndices[index] ?? -1;
    const lp: Vec3 = [pose.positions[index * 3]!, pose.positions[index * 3 + 1]!, pose.positions[index * 3 + 2]!];
    const lr: Quat = [pose.rotations[index * 4]!, pose.rotations[index * 4 + 1]!, pose.rotations[index * 4 + 2]!, pose.rotations[index * 4 + 3]!];
    const ls: Vec3 = [pose.scales[index * 3]!, pose.scales[index * 3 + 1]!, pose.scales[index * 3 + 2]!];
    if (parent < 0 || parent >= skeleton.boneCount || parent === index) {
      const frame: JointFrame = { position: lp, rotation: lr, scale: ls };
      frames[index] = frame;
      return frame;
    }
    const pf = resolve(parent);
    const scaled: Vec3 = [lp[0] * pf.scale[0], lp[1] * pf.scale[1], lp[2] * pf.scale[2]];
    const rotated = rotateVec3Flat(pf.rotation, 0, scaled);
    const rotation = new Float32Array(4);
    multiplyQuatFlat(rotation, 0, pf.rotation, 0, lr, 0);
    normalizeQuatFlat(rotation, 0);
    const frame: JointFrame = {
      position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
      rotation: [rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!],
      scale: [pf.scale[0] * ls[0], pf.scale[1] * ls[1], pf.scale[2] * ls[2]]
    };
    frames[index] = frame;
    return frame;
  };
  const out: JointFrame[] = new Array(skeleton.boneCount);
  for (let index = 0; index < skeleton.boneCount; index += 1) out[index] = resolve(index);
  return out;
}

function rotateVec3Flat(q: Quat | Float32Array, qOffset: number, v: Vec3): Vec3 {
  const x = q[qOffset]!, y = q[qOffset + 1]!, z = q[qOffset + 2]!, w = q[qOffset + 3]!;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx)
  ];
}

/** Minimal-arc quaternion rotating unit vector `from` onto unit vector `to`. */
function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const d = clamp(from[0] * to[0] + from[1] * to[1] + from[2] * to[2], -1, 1);
  if (d > 1 - 1e-9) return [0, 0, 0, 1];
  if (d < -1 + 1e-9) {
    // 180°: pick any perpendicular axis.
    const axis: Vec3 = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross: Vec3 = [
      from[1] * axis[2] - from[2] * axis[1],
      from[2] * axis[0] - from[0] * axis[2],
      from[0] * axis[1] - from[1] * axis[0]
    ];
    const n = normalize(cross);
    return [n[0], n[1], n[2], 0];
  }
  const cross: Vec3 = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0]
  ];
  const w = Math.sqrt((1 + d) / 2);
  const s = 1 / (2 * w);
  return [cross[0] * s, cross[1] * s, cross[2] * s, w];
}

function axisAngleQuat(axis: Vec3, radians: number): Quat {
  const half = radians / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/** Signed angle of `a` → `b` about `axis` (all unit vectors). */
function signedAngleAbout(a: Vec3, b: Vec3, axis: Vec3): number {
  const cross: Vec3 = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  return Math.atan2(cross[0] * axis[0] + cross[1] * axis[1] + cross[2] * axis[2], a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

/** Invert a TRS-only mat4 (column-major): exact for node world matrices, no shear support. */
function invertTRS(matrix: Float32Array | readonly number[]): { rotation: Quat; scale: Vec3; position: Vec3 } {
  const sx = Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!);
  const sy = Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!);
  const sz = Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!);
  return {
    rotation: mat3ToQuat(
      matrix[0]! / (sx || 1), matrix[1]! / (sx || 1), matrix[2]! / (sx || 1),
      matrix[4]! / (sy || 1), matrix[5]! / (sy || 1), matrix[6]! / (sy || 1),
      matrix[8]! / (sz || 1), matrix[9]! / (sz || 1), matrix[10]! / (sz || 1)
    ),
    scale: [sx, sy, sz],
    position: [matrix[12]!, matrix[13]!, matrix[14]!]
  };
}

function mat3ToQuat(
  m00: number, m10: number, m20: number,
  m01: number, m11: number, m21: number,
  m02: number, m12: number, m22: number
): Quat {
  const trace = m00 + m11 + m22;
  let q: Quat;
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
  const flat = Float32Array.from(q);
  normalizeQuatFlat(flat, 0);
  return [flat[0]!, flat[1]!, flat[2]!, flat[3]!];
}

function transformPointInvTRS(inv: { rotation: Quat; scale: Vec3; position: Vec3 }, point: Vec3): Vec3 {
  // inv of T*R*S applied to point: S⁻¹ * Rᵀ * (p − t)
  const shifted: Vec3 = [point[0] - inv.position[0], point[1] - inv.position[1], point[2] - inv.position[2]];
  const invRot: Quat = [-inv.rotation[0], -inv.rotation[1], -inv.rotation[2], inv.rotation[3]];
  const rotated = rotateVec3Flat(invRot, 0, shifted);
  return [rotated[0] / (inv.scale[0] || 1), rotated[1] / (inv.scale[1] || 1), rotated[2] / (inv.scale[2] || 1)];
}

function jointIndex(skeleton: SkeletonBinding, name: string): number {
  const indices = skeleton.jointIndicesByName.get(name);
  if (!indices || indices.length === 0) {
    throw new Error(`solveTwoBoneIkRotations: unknown bone "${name}".`);
  }
  return indices[0]!;
}

function setLocalRotation(pose: PoseBuffer, joint: number, parentRotation: Quat, worldRotation: Quat, weight: number): void {
  const invParent: Quat = [-parentRotation[0], -parentRotation[1], -parentRotation[2], parentRotation[3]];
  const local = new Float32Array(4);
  multiplyQuatFlat(local, 0, invParent, 0, worldRotation, 0);
  normalizeQuatFlat(local, 0);
  const out = new Float32Array(4);
  slerpQuatFlat(out, 0, pose.rotations, joint * 4, local, 0, weight);
  pose.rotations[joint * 4] = out[0]!;
  pose.rotations[joint * 4 + 1] = out[1]!;
  pose.rotations[joint * 4 + 2] = out[2]!;
  pose.rotations[joint * 4 + 3] = out[3]!;
}

/**
 * T3.1 (PRD-06 §7.2): solve a two-bone chain in pose space — writes the local
 * rotations of `spec.root` and `spec.mid` so `spec.tip` reaches `target`
 * (world space). The solve is analytic: `solveTwoBoneIk` places the joints,
 * then the new directions convert back to local rotations with pole-plane and
 * twist distribution handled.
 *
 * - `pole`: "auto" (default) keeps the current bend plane; a world point or
 *   `{ bone }` steers the plane through that point/bone.
 * - `weight`: blends between the current pose and the solved pose (0 = no-op).
 * - `twistBone`/`twistWeight`: distributes the plane-alignment twist onto an
 *   extra joint (e.g. a forearm twist bone).
 * - `allowStretch`: multiplier > 1 lets the tip reach beyond the limb length.
 */
export function solveTwoBoneIkRotations(
  pose: PoseBuffer,
  skeleton: SkeletonBinding,
  modelMatrix: Float32Array | readonly number[],
  spec: TwoBoneIkConstraintSpec,
  target: readonly [number, number, number]
): void {
  const weight = clamp(spec.weight ?? 1, 0, 1);
  if (weight <= 0) return;

  const rootIndex = jointIndex(skeleton, spec.root);
  const midIndex = jointIndex(skeleton, spec.mid);
  const tipIndex = jointIndex(skeleton, spec.tip);
  const frames = jointFrames(pose, skeleton);

  const invModel = invertTRS(modelMatrix);
  const targetLocal = transformPointInvTRS(invModel, [target[0], target[1], target[2]]);

  let polePoint: Vec3 | undefined;
  if (spec.pole && spec.pole !== "auto") {
    if ("bone" in spec.pole) {
      polePoint = [...frames[jointIndex(skeleton, spec.pole.bone)].position] as Vec3;
    } else {
      polePoint = transformPointInvTRS(invModel, [spec.pole[0], spec.pole[1], spec.pole[2]] as Vec3);
    }
  }

  const solved = solveTwoBoneIk({
    root: frames[rootIndex]!.position,
    mid: frames[midIndex]!.position,
    end: frames[tipIndex]!.position,
    target: targetLocal,
    pole: polePoint,
    allowStretch: (spec.allowStretch ?? 0) > 1
  });

  const rootPos = frames[rootIndex]!.position;
  const midPos0 = frames[midIndex]!.position;
  const tipPos0 = frames[tipIndex]!.position;

  // Root swing: minimal arc midDir0 → midDir1, then a residual roll about the
  // new axis so the bend plane matches the pole plane (solvedMid sits on it).
  const midDir0 = normalize(subtract(midPos0, rootPos));
  const midDir1 = normalize(subtract(solved.mid, rootPos));
  const swing = quatFromUnitVectors(midDir0, midDir1);

  const poleDir0 = planeNormal(midDir0, normalize(subtract(polePoint ?? midPos0, rootPos)));
  const poleDir1 = planeNormal(midDir1, normalize(subtract(polePoint ?? solved.mid, rootPos)));
  const swungNormal = rotateVec3Flat(swing, 0, poleDir0);
  const twistAngle = signedAngleAbout(swungNormal, poleDir1, midDir1);
  const roll = axisAngleQuat(midDir1, twistAngle);
  const q1 = new Float32Array(4);
  multiplyQuatFlat(q1, 0, roll, 0, swing, 0);

  // Mid swing: the tip's direction under the root's solved frame onto the
  // solved end direction.
  // Tip position after rotating the whole chain about the root by q1:
  const tipDelta = rotateVec3Flat(q1, 0, subtract(tipPos0, rootPos));
  const tipAfterRootPos: Vec3 = [rootPos[0] + tipDelta[0], rootPos[1] + tipDelta[1], rootPos[2] + tipDelta[2]];
  const tipDir1 = normalize(subtract(tipAfterRootPos, solved.mid));
  const tipDir2 = normalize(subtract(solved.end, solved.mid));
  const q2 = quatFromUnitVectors(tipDir1, tipDir2);

  const parentOf = (index: number): Quat => {
    const parent = skeleton.parentIndices[index] ?? -1;
    return parent >= 0 && parent < skeleton.boneCount ? frames[parent]!.rotation : [0, 0, 0, 1];
  };

  const rootWorldSolved = new Float32Array(4);
  multiplyQuatFlat(rootWorldSolved, 0, q1, 0, frames[rootIndex]!.rotation, 0);
  normalizeQuatFlat(rootWorldSolved, 0);
  setLocalRotation(pose, rootIndex, parentOf(rootIndex), [rootWorldSolved[0]!, rootWorldSolved[1]!, rootWorldSolved[2]!, rootWorldSolved[3]!], weight);

  const midWorldAfterRoot = new Float32Array(4);
  multiplyQuatFlat(midWorldAfterRoot, 0, q1, 0, frames[midIndex]!.rotation, 0);
  const midWorldSolved = new Float32Array(4);
  multiplyQuatFlat(midWorldSolved, 0, q2, 0, midWorldAfterRoot, 0);
  normalizeQuatFlat(midWorldSolved, 0);
  // The mid's parent is the root in a strict two-bone chain; if a joint sits
  // between them, its frame rode the root's rotation too.
  const midParentSolved: Quat = (skeleton.parentIndices[midIndex] === rootIndex)
    ? [rootWorldSolved[0]!, rootWorldSolved[1]!, rootWorldSolved[2]!, rootWorldSolved[3]!]
    : ((): Quat => {
        const p = skeleton.parentIndices[midIndex] ?? -1;
        if (p < 0) return [0, 0, 0, 1];
        const rotated = new Float32Array(4);
        multiplyQuatFlat(rotated, 0, q1, 0, frames[p]!.rotation, 0);
        normalizeQuatFlat(rotated, 0);
        return [rotated[0]!, rotated[1]!, rotated[2]!, rotated[3]!];
      })();
  setLocalRotation(pose, midIndex, midParentSolved, [midWorldSolved[0]!, midWorldSolved[1]!, midWorldSolved[2]!, midWorldSolved[3]!], weight);

  // Twist distribution: apply `twistWeight` of the plane-align roll to the
  // twist bone's local rotation (twist bones sit between mid and tip).
  if (spec.twistBone && (spec.twistWeight ?? 0) > 0) {
    const twistIndex = jointIndex(skeleton, spec.twistBone);
    const twistQ = axisAngleQuat(midDir1, twistAngle * (spec.twistWeight ?? 0));
    const twistWorld = new Float32Array(4);
    multiplyQuatFlat(twistWorld, 0, twistQ, 0, frames[twistIndex]!.rotation, 0);
    normalizeQuatFlat(twistWorld, 0);
    setLocalRotation(pose, twistIndex, parentOf(twistIndex), [twistWorld[0]!, twistWorld[1]!, twistWorld[2]!, twistWorld[3]!], weight);
  }
}

/** Plane normal `normalize(cross(dir, towardPole))` — zero-safe. */
function planeNormal(dir: Vec3, towardPole: Vec3): Vec3 {
  const cross: Vec3 = [
    dir[1] * towardPole[2] - dir[2] * towardPole[1],
    dir[2] * towardPole[0] - dir[0] * towardPole[2],
    dir[0] * towardPole[1] - dir[1] * towardPole[0]
  ];
  const n = normalize(cross);
  if (Math.hypot(n[0], n[1], n[2]) <= 1e-6) {
    // Degenerate: pick any perpendicular.
    const axis: Vec3 = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return normalize([
      dir[1] * axis[2] - dir[2] * axis[1],
      dir[2] * axis[0] - dir[0] * axis[2],
      dir[0] * axis[1] - dir[1] * axis[0]
    ]);
  }
  return n;
}

/**
 * @deprecated PRD-06 T3.1: prefer {@link solveTwoBoneIkRotations}, which writes
 * local pose rotations directly. `solveTwoBoneIk` stays for position-space
 * consumers (e.g. FootIk mid points) until they migrate.
 */
export type { TwoBoneIkInput as LegacyTwoBoneIkInput };
