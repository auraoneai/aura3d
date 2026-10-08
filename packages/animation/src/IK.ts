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


function jointIndex(skeleton: SkeletonBinding, name: string): number {
  const indices = skeleton.jointIndicesByName.get(name);
  if (!indices || indices.length === 0) {
    throw new Error(`solveTwoBoneIkRotations: unknown bone "${name}".`);
  }
  return indices[0]!;
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
// §13 — shared scratch for `solveTwoBoneIkRotations`. Grows once to the
// largest skeleton seen; a generation mark lets each call reuse the arrays
// without clearing them.
const IK_SCRATCH = {
  boneCount: 0,
  pos: new Float32Array(0),
  rot: new Float32Array(0),
  scl: new Float32Array(0),
  mark: new Uint32Array(0),
  gen: 0
};

const ikQuatScratchA = new Float32Array(4);
const ikQuatScratchB = new Float32Array(4);
const ikQuatScratchC = new Float32Array(4);
const ikQuatScratchD = new Float32Array(4);
const ikQuatScratchE = new Float32Array(4);
const ikQuatScratchF = new Float32Array(4);
const ikQuatScratchG = new Float32Array(4);
const ikQuatScratchH = new Float32Array(4);
const ikQuatScratchI = new Float32Array(4);

function ikScratch(boneCount: number): typeof IK_SCRATCH {
  if (boneCount > IK_SCRATCH.boneCount) {
    IK_SCRATCH.boneCount = boneCount;
    IK_SCRATCH.pos = new Float32Array(boneCount * 3);
    IK_SCRATCH.rot = new Float32Array(boneCount * 4);
    IK_SCRATCH.scl = new Float32Array(boneCount * 3);
    IK_SCRATCH.mark = new Uint32Array(boneCount);
    IK_SCRATCH.gen = 0;
  }
  return IK_SCRATCH;
}

/** Scalar `quatFromUnitVectors`: minimal-arc rotation `from`→`to` into `out`. */
function quatFromUnitVectorsInto(out: Float32Array, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void {
  const d = clamp(fx * tx + fy * ty + fz * tz, -1, 1);
  if (d > 1 - 1e-9) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
    return;
  }
  if (d < -1 + 1e-9) {
    // 180°: pick any perpendicular axis.
    const ax = Math.abs(fx) < 0.9 ? 1 : 0;
    const ay = Math.abs(fx) < 0.9 ? 0 : 1;
    let cx = fy * 0 - fz * ay;
    let cy = fz * ax - fx * 0;
    let cz = fx * ay - fy * ax;
    const l = Math.hypot(cx, cy, cz) || 1;
    cx /= l; cy /= l; cz /= l;
    out[0] = cx; out[1] = cy; out[2] = cz; out[3] = 0;
    return;
  }
  const cx = fy * tz - fz * ty;
  const cy = fz * tx - fx * tz;
  const cz = fx * ty - fy * tx;
  const w = Math.sqrt((1 + d) / 2);
  const s = 1 / (2 * w);
  out[0] = cx * s; out[1] = cy * s; out[2] = cz * s; out[3] = w;
}

/** Lazy world-frame resolve into IK_SCRATCH — mirrors the removed `jointFrames`. */
function ikResolveFrame(pose: PoseBuffer, skeleton: SkeletonBinding, s: typeof IK_SCRATCH, gen: number, index: number): void {
  if (s.mark[index] === gen) return;
  const lp = index * 3;
  const lr = index * 4;
  const pPos = pose.positions;
  const pRot = pose.rotations;
  const pScl = pose.scales;
  const parent = skeleton.parentIndices[index] ?? -1;
  if (parent < 0 || parent >= skeleton.boneCount || parent === index) {
    s.pos[lp] = pPos[lp]!; s.pos[lp + 1] = pPos[lp + 1]!; s.pos[lp + 2] = pPos[lp + 2]!;
    s.rot[lr] = pRot[lr]!; s.rot[lr + 1] = pRot[lr + 1]!; s.rot[lr + 2] = pRot[lr + 2]!; s.rot[lr + 3] = pRot[lr + 3]!;
    s.scl[lp] = pScl[lp]!; s.scl[lp + 1] = pScl[lp + 1]!; s.scl[lp + 2] = pScl[lp + 2]!;
    s.mark[index] = gen;
    return;
  }
  ikResolveFrame(pose, skeleton, s, gen, parent);
  const pp = parent * 3;
  const pr = parent * 4;
  const qx = s.rot[pr]!, qy = s.rot[pr + 1]!, qz = s.rot[pr + 2]!, qw = s.rot[pr + 3]!;
  const sx = pPos[lp]! * s.scl[pp]!;
  const sy = pPos[lp + 1]! * s.scl[pp + 1]!;
  const sz = pPos[lp + 2]! * s.scl[pp + 2]!;
  const ix = qw * sx + qy * sz - qz * sy;
  const iy = qw * sy + qz * sx - qx * sz;
  const iz = qw * sz + qx * sy - qy * sx;
  const iw = -qx * sx - qy * sy - qz * sz;
  s.pos[lp] = s.pos[pp]! + (ix * qw + iw * -qx + iy * -qz - iz * -qy);
  s.pos[lp + 1] = s.pos[pp + 1]! + (iy * qw + iw * -qy + iz * -qx - ix * -qz);
  s.pos[lp + 2] = s.pos[pp + 2]! + (iz * qw + iw * -qz + ix * -qy - iy * -qx);
  multiplyQuatFlat(s.rot, lr, s.rot, pr, pRot, lr);
  normalizeQuatFlat(s.rot, lr);
  s.scl[lp] = s.scl[pp]! * pScl[lp]!;
  s.scl[lp + 1] = s.scl[pp + 1]! * pScl[lp + 1]!;
  s.scl[lp + 2] = s.scl[pp + 2]! * pScl[lp + 2]!;
  s.mark[index] = gen;
}

/** Parent's resolved world rotation into `out` (identity at the root). */
function ikParentRot(pose: PoseBuffer, skeleton: SkeletonBinding, s: typeof IK_SCRATCH, gen: number, index: number, out: Float32Array): Float32Array {
  const parent = skeleton.parentIndices[index] ?? -1;
  if (parent < 0 || parent >= skeleton.boneCount) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
    return out;
  }
  ikResolveFrame(pose, skeleton, s, gen, parent);
  const pr = parent * 4;
  out[0] = s.rot[pr]!; out[1] = s.rot[pr + 1]!; out[2] = s.rot[pr + 2]!; out[3] = s.rot[pr + 3]!;
  return out;
}

/** Scalar form of the removed `mat3ToQuat` — same sign conventions, writes into `out`. */
function mat3ToQuatInto(out: Float32Array, m00: number, m10: number, m20: number, m01: number, m11: number, m21: number, m02: number, m12: number, m22: number): void {
  const trace = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; w = 0.25 / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; w = (m21 - m12) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; w = (m02 - m20) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; w = (m10 - m01) / s;
  }
  const l = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
}

/** Flat `setLocalRotation`: `local = parent⁻¹·world` slerped into the pose at `weight`. */
function setLocalRotationFlat(pose: PoseBuffer, joint: number, parentRotation: Float32Array, worldRotation: Float32Array, weight: number): void {
  const invP = ikQuatScratchI;
  invP[0] = -parentRotation[0]!;
  invP[1] = -parentRotation[1]!;
  invP[2] = -parentRotation[2]!;
  invP[3] = parentRotation[3]!;
  const local = ikQuatScratchB;
  multiplyQuatFlat(local, 0, invP, 0, worldRotation, 0);
  normalizeQuatFlat(local, 0);
  const out = ikQuatScratchA;
  slerpQuatFlat(out, 0, pose.rotations, joint * 4, local, 0, weight);
  pose.rotations[joint * 4] = out[0]!;
  pose.rotations[joint * 4 + 1] = out[1]!;
  pose.rotations[joint * 4 + 2] = out[2]!;
  pose.rotations[joint * 4 + 3] = out[3]!;
}

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

  // §13 — flat scratch + lazy frame resolution: the object-of-arrays
  // `jointFrames` built ~boneCount objects and ~40 array literals per call
  // (~6× over the 2µs two-bone budget). Frames resolve only for the joints
  // this solve touches (chain + ancestors + pole/twist), into grow-once
  // module scratch marked by a generation counter — zero per-call alloc.
  const s = ikScratch(skeleton.boneCount);
  const gen = ++s.gen;
  ikResolveFrame(pose, skeleton, s, gen, rootIndex);
  ikResolveFrame(pose, skeleton, s, gen, midIndex);
  ikResolveFrame(pose, skeleton, s, gen, tipIndex);

  const rp = rootIndex * 3;
  const mp = midIndex * 3;
  const tp = tipIndex * 3;
  const rootX = s.pos[rp]!, rootY = s.pos[rp + 1]!, rootZ = s.pos[rp + 2]!;
  const midX = s.pos[mp]!, midY = s.pos[mp + 1]!, midZ = s.pos[mp + 2]!;
  const tipX = s.pos[tp]!, tipY = s.pos[tp + 1]!, tipZ = s.pos[tp + 2]!;

  // invModel = invertTRS(modelMatrix) → scalars; targetLocal = S⁻¹·Rᵀ·(t − pos).
  const m0c = modelMatrix[0]!, m1c = modelMatrix[1]!, m2c = modelMatrix[2]!;
  const m4c = modelMatrix[4]!, m5c = modelMatrix[5]!, m6c = modelMatrix[6]!;
  const m8c = modelMatrix[8]!, m9c = modelMatrix[9]!, m10c = modelMatrix[10]!;
  const m12c = modelMatrix[12]!, m13c = modelMatrix[13]!, m14c = modelMatrix[14]!;
  const msx = Math.sqrt(m0c * m0c + m1c * m1c + m2c * m2c) || 1;
  const msy = Math.sqrt(m4c * m4c + m5c * m5c + m6c * m6c) || 1;
  const msz = Math.sqrt(m8c * m8c + m9c * m9c + m10c * m10c) || 1;
  const mRot = ikQuatScratchF;
  mat3ToQuatInto(
    mRot,
    m0c / msx, m1c / msx, m2c / msx,
    m4c / msy, m5c / msy, m6c / msy,
    m8c / msz, m9c / msz, m10c / msz
  );
  const tpx = target[0] - m12c, tpy = target[1] - m13c, tpz = target[2] - m14c;
  // rotate by conjugate of mRot
  const crx = -mRot[0], cry = -mRot[1], crz = -mRot[2], crw = mRot[3];
  const tIx = crw * tpx + cry * tpz - crz * tpy;
  const tIy = crw * tpy + crz * tpx - crx * tpz;
  const tIz = crw * tpz + crx * tpy - cry * tpx;
  const tIw = -crx * tpx - cry * tpy - crz * tpz;
  const targetX = (tIx * crw + tIw * -crx + tIy * -crz - tIz * -cry) / msx;
  const targetY = (tIy * crw + tIw * -cry + tIz * -crx - tIx * -crz) / msy;
  const targetZ = (tIz * crw + tIw * -crz + tIx * -cry - tIy * -crx) / msz;

  // polePoint (model space) — bone position or transformed world point.
  let poleX = 0, poleY = 0, poleZ = 0;
  let hasPole = false;
  if (spec.pole && spec.pole !== "auto") {
    if ("bone" in spec.pole) {
      const poleJoint = jointIndex(skeleton, spec.pole.bone);
      ikResolveFrame(pose, skeleton, s, gen, poleJoint);
      const pp = poleJoint * 3;
      poleX = s.pos[pp]!; poleY = s.pos[pp + 1]!; poleZ = s.pos[pp + 2]!;
    } else {
      const ppx = spec.pole[0] - m12c, ppy = spec.pole[1] - m13c, ppz = spec.pole[2] - m14c;
      const pIx = crw * ppx + cry * ppz - crz * ppy;
      const pIy = crw * ppy + crz * ppx - crx * ppz;
      const pIz = crw * ppz + crx * ppy - cry * ppx;
      const pIw = -crx * ppx - cry * ppy - crz * ppz;
      poleX = (pIx * crw + pIw * -crx + pIy * -crz - pIz * -cry) / msx;
      poleY = (pIy * crw + pIw * -cry + pIz * -crx - pIx * -crz) / msy;
      poleZ = (pIz * crw + pIw * -crz + pIx * -cry - pIy * -crx) / msz;
    }
    hasPole = true;
  }

  // solveTwoBoneIk inline — same math (chain lengths, pole-projected plane,
  // adjacent/height), scalar form.
  const udx = midX - rootX, udy = midY - rootY, udz = midZ - rootZ;
  const upperLength = Math.sqrt(udx * udx + udy * udy + udz * udz);
  const ldx = tipX - midX, ldy = tipY - midY, ldz = tipZ - midZ;
  const lowerLength = Math.sqrt(ldx * ldx + ldy * ldy + ldz * ldz);
  if (upperLength <= 1e-6 || lowerLength <= 1e-6) {
    throw new Error("Two-bone IK requires non-zero upper and lower segment lengths.");
  }
  const tdx = targetX - rootX, tdy = targetY - rootY, tdz = targetZ - rootZ;
  const targetDistance = Math.sqrt(tdx * tdx + tdy * tdy + tdz * tdz);
  if (targetDistance <= 1e-6) {
    throw new Error("Two-bone IK target must be distinct from the root.");
  }
  const maxReach = upperLength + lowerLength;
  const minReach = Math.abs(upperLength - lowerLength) + 1e-5;
  const allowStretch = (spec.allowStretch ?? 0) > 1;
  const solveDistance = allowStretch ? targetDistance : clamp(targetDistance, minReach, maxReach - 1e-5);
  const axisX = tdx / targetDistance, axisY = tdy / targetDistance, axisZ = tdz / targetDistance;
  // projectedPoleDirection: pole = polePoint ?? mid
  const plX = hasPole ? poleX : midX, plY = hasPole ? poleY : midY, plZ = hasPole ? poleZ : midZ;
  const pdx = plX - rootX, pdy = plY - rootY, pdz = plZ - rootZ;
  const pdDot = pdx * axisX + pdy * axisY + pdz * axisZ;
  let prjX = pdx - axisX * pdDot, prjY = pdy - axisY * pdDot, prjZ = pdz - axisZ * pdDot;
  const prjLen = Math.sqrt(prjX * prjX + prjY * prjY + prjZ * prjZ);
  if (prjLen > 1e-6) {
    prjX /= prjLen; prjY /= prjLen; prjZ /= prjLen;
  } else {
    const fx = Math.abs(axisY) < 0.9 ? 0 : 1;
    const fy = Math.abs(axisY) < 0.9 ? 1 : 0;
    const fDot = fx * axisX + fy * axisY;
    let fpx = fx - axisX * fDot, fpy = fy - axisY * fDot, fpz = -axisZ * fDot;
    const fl = Math.sqrt(fpx * fpx + fpy * fpy + fpz * fpz) || 1;
    prjX = fpx / fl; prjY = fpy / fl; prjZ = fpz / fl;
  }
  const adjacent = clamp((upperLength * upperLength + solveDistance * solveDistance - lowerLength * lowerLength) / (2 * solveDistance), 0, upperLength);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - adjacent * adjacent));
  const sEndX = rootX + axisX * solveDistance, sEndY = rootY + axisY * solveDistance, sEndZ = rootZ + axisZ * solveDistance;
  const sMidX = rootX + axisX * adjacent + prjX * height;
  const sMidY = rootY + axisY * adjacent + prjY * height;
  const sMidZ = rootZ + axisZ * adjacent + prjZ * height;
  // The solve itself is unblended — solveTwoBoneIk lerps mid/end at weight=1
  // here (the caller never passed weight), and `setLocalRotation` applies the
  // real blend when writing back into the pose.
  const smX = sMidX, smY = sMidY, smZ = sMidZ;
  const seX = sEndX, seY = sEndY, seZ = sEndZ;

  // Root swing: minimal arc midDir0 → midDir1, then a residual roll about the
  // new axis so the bend plane matches the pole plane (solvedMid sits on it).
  let m0x = midX - rootX, m0y = midY - rootY, m0z = midZ - rootZ;
  let m0l = Math.sqrt(m0x * m0x + m0y * m0y + m0z * m0z);
  if (m0l <= 1e-6) { m0x = 0; m0y = 1; m0z = 0; m0l = 1; }
  const md0x = m0x / m0l, md0y = m0y / m0l, md0z = m0z / m0l;
  let m1x = smX - rootX, m1y = smY - rootY, m1z = smZ - rootZ;
  let m1l = Math.sqrt(m1x * m1x + m1y * m1y + m1z * m1z);
  if (m1l <= 1e-6) { m1x = 0; m1y = 1; m1z = 0; m1l = 1; }
  const md1x = m1x / m1l, md1y = m1y / m1l, md1z = m1z / m1l;
  const swing = ikQuatScratchA;
  quatFromUnitVectorsInto(swing, md0x, md0y, md0z, md1x, md1y, md1z);

  // poleDir0/1 = planeNormal(midDir, normalize(polePoint|mid - root))
  let p0x = (hasPole ? poleX : midX) - rootX, p0y = (hasPole ? poleY : midY) - rootY, p0z = (hasPole ? poleZ : midZ) - rootZ;
  const p0l = Math.sqrt(p0x * p0x + p0y * p0y + p0z * p0z);
  if (p0l <= 1e-6) { p0x = 0; p0y = 1; p0z = 0; } else { p0x /= p0l; p0y /= p0l; p0z /= p0l; }
  let pd0x = md0y * p0z - md0z * p0y, pd0y = md0z * p0x - md0x * p0z, pd0z = md0x * p0y - md0y * p0x;
  const pd0l = Math.sqrt(pd0x * pd0x + pd0y * pd0y + pd0z * pd0z);
  if (pd0l <= 1e-6) {
    const ux = Math.abs(md0x) < 0.9 ? 1 : 0, uy = Math.abs(md0x) < 0.9 ? 0 : 1;
    pd0x = md0y * 0 - md0z * uy;
    pd0y = md0z * ux - md0x * 0;
    pd0z = md0x * uy - md0y * ux;
    const ul = Math.sqrt(pd0x * pd0x + pd0y * pd0y + pd0z * pd0z) || 1;
    pd0x /= ul; pd0y /= ul; pd0z /= ul;
  } else {
    pd0x /= pd0l; pd0y /= pd0l; pd0z /= pd0l;
  }
  let p1x = (hasPole ? poleX : smX) - rootX, p1y = (hasPole ? poleY : smY) - rootY, p1z = (hasPole ? poleZ : smZ) - rootZ;
  const p1l = Math.sqrt(p1x * p1x + p1y * p1y + p1z * p1z);
  if (p1l <= 1e-6) { p1x = 0; p1y = 1; p1z = 0; } else { p1x /= p1l; p1y /= p1l; p1z /= p1l; }
  let pd1x = md1y * p1z - md1z * p1y, pd1y = md1z * p1x - md1x * p1z, pd1z = md1x * p1y - md1y * p1x;
  const pd1l = Math.sqrt(pd1x * pd1x + pd1y * pd1y + pd1z * pd1z);
  if (pd1l <= 1e-6) {
    const ux = Math.abs(md1x) < 0.9 ? 1 : 0, uy = Math.abs(md1x) < 0.9 ? 0 : 1;
    pd1x = md1y * 0 - md1z * uy;
    pd1y = md1z * ux - md1x * 0;
    pd1z = md1x * uy - md1y * ux;
    const ul = Math.sqrt(pd1x * pd1x + pd1y * pd1y + pd1z * pd1z) || 1;
    pd1x /= ul; pd1y /= ul; pd1z /= ul;
  } else {
    pd1x /= pd1l; pd1y /= pd1l; pd1z /= pd1l;
  }
  // swungNormal = rotateVec3(swing, poleDir0)
  const swx = swing[0], swy = swing[1], swz = swing[2], sww = swing[3];
  const snIx = sww * pd0x + swy * pd0z - swz * pd0y;
  const snIy = sww * pd0y + swz * pd0x - swx * pd0z;
  const snIz = sww * pd0z + swx * pd0y - swy * pd0x;
  const snIw = -swx * pd0x - swy * pd0y - swz * pd0z;
  const snx = snIx * sww + snIw * -swx + snIy * -swz - snIz * -swy;
  const sny = snIy * sww + snIw * -swy + snIz * -swx - snIx * -swz;
  const snz = snIz * sww + snIw * -swz + snIx * -swy - snIy * -swx;
  // twistAngle = signedAngleAbout(swungNormal, poleDir1, midDir1)
  const tacx = sny * pd1z - snz * pd1y;
  const tacy = snz * pd1x - snx * pd1z;
  const tacz = snx * pd1y - sny * pd1x;
  const twistAngle = Math.atan2(
    tacx * md1x + tacy * md1y + tacz * md1z,
    snx * pd1x + sny * pd1y + snz * pd1z
  );
  // roll = axisAngleQuat(midDir1, twistAngle); q1 = roll * swing
  const half = twistAngle / 2;
  const sHalf = Math.sin(half);
  const roll = ikQuatScratchB;
  roll[0] = md1x * sHalf; roll[1] = md1y * sHalf; roll[2] = md1z * sHalf; roll[3] = Math.cos(half);
  const q1 = ikQuatScratchC;
  multiplyQuatFlat(q1, 0, roll, 0, swing, 0);

  // Mid swing: tip direction under the root's solved frame onto solved-end dir.
  const tvx = tipX - rootX, tvy = tipY - rootY, tvz = tipZ - rootZ;
  const q1x = q1[0], q1y = q1[1], q1z = q1[2], q1w = q1[3];
  const tdIx = q1w * tvx + q1y * tvz - q1z * tvy;
  const tdIy = q1w * tvy + q1z * tvx - q1x * tvz;
  const tdIz = q1w * tvz + q1x * tvy - q1y * tvx;
  const tdIw = -q1x * tvx - q1y * tvy - q1z * tvz;
  const tipAfterX = rootX + tdIx * q1w + tdIw * -q1x + tdIy * -q1z - tdIz * -q1y;
  const tipAfterY = rootY + tdIy * q1w + tdIw * -q1y + tdIz * -q1x - tdIx * -q1z;
  const tipAfterZ = rootZ + tdIz * q1w + tdIw * -q1z + tdIx * -q1y - tdIy * -q1x;
  let td1x = tipAfterX - smX, td1y = tipAfterY - smY, td1z = tipAfterZ - smZ;
  const td1l = Math.sqrt(td1x * td1x + td1y * td1y + td1z * td1z);
  if (td1l <= 1e-6) { td1x = 0; td1y = 1; td1z = 0; } else { td1x /= td1l; td1y /= td1l; td1z /= td1l; }
  let td2x = seX - smX, td2y = seY - smY, td2z = seZ - smZ;
  const td2l = Math.sqrt(td2x * td2x + td2y * td2y + td2z * td2z);
  if (td2l <= 1e-6) { td2x = 0; td2y = 1; td2z = 0; } else { td2x /= td2l; td2y /= td2l; td2z /= td2l; }
  const q2 = ikQuatScratchD;
  quatFromUnitVectorsInto(q2, td1x, td1y, td1z, td2x, td2y, td2z);

  const rootWorldSolved = ikQuatScratchE;
  multiplyQuatFlat(rootWorldSolved, 0, q1, 0, s.rot, rootIndex * 4);
  normalizeQuatFlat(rootWorldSolved, 0);
  setLocalRotationFlat(pose, rootIndex, ikParentRot(pose, skeleton, s, gen, rootIndex, ikQuatScratchF), rootWorldSolved, weight);

  const midWorldAfterRoot = ikQuatScratchG;
  multiplyQuatFlat(midWorldAfterRoot, 0, q1, 0, s.rot, midIndex * 4);
  const midWorldSolved = ikQuatScratchH;
  multiplyQuatFlat(midWorldSolved, 0, q2, 0, midWorldAfterRoot, 0);
  normalizeQuatFlat(midWorldSolved, 0);
  // The mid's parent is the root in a strict two-bone chain; if a joint sits
  // between them, its frame rode the root's rotation too.
  const midParentSolved = ikQuatScratchI;
  if (skeleton.parentIndices[midIndex] === rootIndex) {
    midParentSolved.set(rootWorldSolved);
  } else {
    const p = skeleton.parentIndices[midIndex] ?? -1;
    if (p < 0) {
      midParentSolved[0] = 0; midParentSolved[1] = 0; midParentSolved[2] = 0; midParentSolved[3] = 1;
    } else {
      ikResolveFrame(pose, skeleton, s, gen, p);
      multiplyQuatFlat(midParentSolved, 0, q1, 0, s.rot, p * 4);
      normalizeQuatFlat(midParentSolved, 0);
    }
  }
  setLocalRotationFlat(pose, midIndex, midParentSolved, midWorldSolved, weight);

  // Twist distribution: apply `twistWeight` of the plane-align roll to the
  // twist bone's local rotation (twist bones sit between mid and tip).
  if (spec.twistBone && (spec.twistWeight ?? 0) > 0) {
    const twistIndex = jointIndex(skeleton, spec.twistBone);
    ikResolveFrame(pose, skeleton, s, gen, twistIndex);
    const tHalf = (twistAngle * (spec.twistWeight ?? 0)) / 2;
    const tS = Math.sin(tHalf);
    const twistQ = ikQuatScratchB;
    twistQ[0] = md1x * tS; twistQ[1] = md1y * tS; twistQ[2] = md1z * tS; twistQ[3] = Math.cos(tHalf);
    const twistWorld = ikQuatScratchG;
    multiplyQuatFlat(twistWorld, 0, twistQ, 0, s.rot, twistIndex * 4);
    normalizeQuatFlat(twistWorld, 0);
    setLocalRotationFlat(pose, twistIndex, ikParentRot(pose, skeleton, s, gen, twistIndex, ikQuatScratchF), twistWorld, weight);
  }
}


/**
 * @deprecated PRD-06 T3.1: prefer {@link solveTwoBoneIkRotations}, which writes
 * local pose rotations directly. `solveTwoBoneIk` stays for position-space
 * consumers (e.g. FootIk mid points) until they migrate.
 */
export type { TwoBoneIkInput as LegacyTwoBoneIkInput };
