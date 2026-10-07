/**
 * T3.3 (PRD-06 §7.1/7.2) — `LookAtConstraint`: pose-space look-at that
 * distributes the required yaw/pitch across the named bones by weight,
 * enforces `yawLimitDeg`/`pitchLimitDeg` on the aggregate rotation, and
 * smooths applied angles with a critically-damped spring (`halfLife`,
 * default 0.12 s — same convention as PoseInertializer).
 *
 * Stateful: the spring keeps per-constraint applied yaw/pitch; ±180° targets
 * unwrap against the previous applied yaw so sweeping behind the character
 * never snaps sign.
 *
 * `eyes` (optional bone names) aim directly at the target after the weighted
 * pass — eye saccades are instant, not spring-smoothed.
 */

import type { PoseBuffer } from "./PoseBuffer.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";

export interface LookAtConstraintSpec {
  /** Weighted chain (e.g. spine 0.25 / neck 0.35 / head 0.4). Weights need not sum to 1. */
  readonly bones: readonly { readonly bone: string; readonly weight: number }[];
  /** Model-space forward axis of the bones (default "+z"). */
  readonly forwardAxis?: "+z" | "-z" | "+y";
  /** Aggregate yaw cap about the model-space up axis (default 90°). */
  readonly yawLimitDeg?: number;
  /** Aggregate pitch cap about the rotated right axis (default 60°). */
  readonly pitchLimitDeg?: number;
  /** Optional eye bones that aim at the target directly (full correction). */
  readonly eyes?: readonly string[];
  /** Critically-damped smoothing half-life in seconds (default 0.12). */
  readonly halfLife?: number;
}

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const UP: Vec3 = [0, 1, 0];

function jointIndex(skeleton: SkeletonBinding, name: string): number {
  const indices = skeleton.jointIndicesByName.get(name);
  if (!indices || indices.length === 0) throw new Error(`LookAtConstraint: unknown bone "${name}".`);
  return indices[0]!;
}

interface JointFrame {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

function jointFrame(pose: PoseBuffer, skeleton: SkeletonBinding, joint: number, cache: Map<number, JointFrame>): JointFrame {
  const cached = cache.get(joint);
  if (cached) return cached;
  const pos: Vec3 = [pose.positions[joint * 3]!, pose.positions[joint * 3 + 1]!, pose.positions[joint * 3 + 2]!];
  const rot: Quat = [pose.rotations[joint * 4]!, pose.rotations[joint * 4 + 1]!, pose.rotations[joint * 4 + 2]!, pose.rotations[joint * 4 + 3]!];
  const scl: Vec3 = [pose.scales[joint * 3]!, pose.scales[joint * 3 + 1]!, pose.scales[joint * 3 + 2]!];
  const parent = skeleton.parentIndices[joint] ?? -1;
  if (parent < 0 || parent >= skeleton.boneCount || parent === joint) {
    const frame: JointFrame = { position: pos, rotation: rot, scale: scl };
    cache.set(joint, frame);
    return frame;
  }
  const pf = jointFrame(pose, skeleton, parent, cache);
  const scaled: Vec3 = [pos[0] * pf.scale[0], pos[1] * pf.scale[1], pos[2] * pf.scale[2]];
  const rotated = rotateVec3(pf.rotation, scaled);
  const frame: JointFrame = {
    position: [pf.position[0] + rotated[0], pf.position[1] + rotated[1], pf.position[2] + rotated[2]],
    rotation: multiplyQuat(pf.rotation, rot),
    scale: [pf.scale[0] * scl[0], pf.scale[1] * scl[1], pf.scale[2] * scl[2]]
  };
  cache.set(joint, frame);
  return frame;
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

/** Invert a TRS-only mat4 for target world→model conversion. */
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
  return {
    rotation: [q[0] / l, q[1] / l, q[2] / l, q[3] / l],
    scale: [sx, sy, sz],
    position: [matrix[12]!, matrix[13]!, matrix[14]!]
  };
}

function forwardVector(axis: "+z" | "-z" | "+y"): Vec3 {
  if (axis === "-z") return [0, 0, -1];
  if (axis === "+y") return [0, 1, 0];
  return [0, 0, 1];
}

export interface LookAtConstraint {
  /** Apply the constraint: writes local rotations of the spec's bones. */
  apply(pose: PoseBuffer, skeleton: SkeletonBinding, modelMatrix: Float32Array | readonly number[], target: Vec3, dt: number): void;
  /** Current smoothed yaw/pitch (radians) — diagnostics. */
  readonly smoothed: { readonly yaw: number; readonly pitch: number };
  /** Reset the spring (e.g. on teleport). */
  reset(): void;
}

export function createLookAtConstraint(spec: LookAtConstraintSpec): LookAtConstraint {
  const halfLife = spec.halfLife ?? 0.12;
  const yawLimit = ((spec.yawLimitDeg ?? 90) * Math.PI) / 180;
  const pitchLimit = ((spec.pitchLimitDeg ?? 60) * Math.PI) / 180;
  const axis = forwardVector(spec.forwardAxis ?? "+z");
  const state = { yaw: 0, pitch: 0 };

  return {
    get smoothed() {
      return { yaw: state.yaw, pitch: state.pitch };
    },
    reset() {
      state.yaw = 0;
      state.pitch = 0;
    },
    apply(pose, skeleton, modelMatrix, target, dt) {
      const frames = new Map<number, JointFrame>();
      const invModel = invertModelTRS(modelMatrix);
      // Target in model space.
      const shifted: Vec3 = [target[0] - invModel.position[0], target[1] - invModel.position[1], target[2] - invModel.position[2]];
      const invRot: Quat = [-invModel.rotation[0], -invModel.rotation[1], -invModel.rotation[2], invModel.rotation[3]];
      const rotatedTarget = rotateVec3(invRot, shifted);
      const targetLocal: Vec3 = [
        rotatedTarget[0] / (invModel.scale[0] || 1),
        rotatedTarget[1] / (invModel.scale[1] || 1),
        rotatedTarget[2] / (invModel.scale[2] || 1)
      ];

      // Desired yaw/pitch off the LAST weighted bone's current forward.
      const last = spec.bones[spec.bones.length - 1];
      if (!last) return;
      const lastFrame = jointFrame(pose, skeleton, jointIndex(skeleton, last.bone), frames);
      const forward = rotateVec3(lastFrame.rotation, axis);
      const toTarget = normalize([
        targetLocal[0] - lastFrame.position[0],
        targetLocal[1] - lastFrame.position[1],
        targetLocal[2] - lastFrame.position[2]
      ]);
      if (Math.hypot(toTarget[0], toTarget[1], toTarget[2]) <= 1e-9) return;

      // Yaw about model up: signed angle between the XZ projections.
      const forwardFlat: Vec3 = normalize([forward[0], 0, forward[2]]);
      const targetFlat: Vec3 = normalize([toTarget[0], 0, toTarget[2]]);
      // atan2(cross·up, dot) — cross(f,t)·up = fz·tx − fx·tz
      const crossY = forwardFlat[2] * targetFlat[0] - forwardFlat[0] * targetFlat[2];
      const yaw = Math.atan2(crossY, forwardFlat[0] * targetFlat[0] + forwardFlat[2] * targetFlat[2]);

      // Pitch = the rotation about the yawed RIGHT axis needed to reach the
      // target's elevation. R_x(+θ) pitches +Z forward DOWN, so elevation up
      // is a negative right-axis rotation.
      const pitch = -Math.atan2(toTarget[1], Math.max(1e-9, Math.hypot(toTarget[0], toTarget[2])));

      let targetYaw = Math.max(-yawLimit, Math.min(yawLimit, yaw));
      const targetPitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));

      // The constraint composes each frame's distributed share ON TOP of the
      // animated pose (the pose the mixer just wrote — never last frame's
      // constraint output), so the smoothed angles are absolute and
      // convergent. `state` starts at 0 for a smooth ramp-in.
      // ±180° unwrap: pull the TARGET onto the smoothed value's branch — the
      // smoothed yaw itself keeps growing continuously past ±π (equivalent mod
      // 2π in the applied share), so sweeping behind never snaps sign.
      while (targetYaw - state.yaw > Math.PI) targetYaw -= Math.PI * 2;
      while (targetYaw - state.yaw < -Math.PI) targetYaw += Math.PI * 2;
      const blend = 1 - Math.pow(2, -dt / halfLife);
      state.yaw += (targetYaw - state.yaw) * blend;
      state.pitch += (targetPitch - state.pitch) * blend;

      // Distribute smoothed angles across the bones by weight; write back.
      for (const entry of spec.bones) {
        const index = jointIndex(skeleton, entry.bone);
        const frame = jointFrame(pose, skeleton, index, frames);
        const yawShare = state.yaw * entry.weight;
        const pitchShare = state.pitch * entry.weight;
        const yawQ = axisAngle(UP, yawShare);
        const afterYaw = multiplyQuat(yawQ, frame.rotation);
        // Pitch about the post-yaw right axis (yawed +X).
        const right = rotateVec3(yawQ, [1, 0, 0]);
        const pitchQ = axisAngle(right, pitchShare);
        const world = multiplyQuat(pitchQ, afterYaw);
        const l = Math.hypot(world[0], world[1], world[2], world[3]) || 1;
        const normalized: Quat = [world[0] / l, world[1] / l, world[2] / l, world[3] / l];
        const parent = skeleton.parentIndices[index] ?? -1;
        const parentRot: Quat = parent >= 0 ? jointFrame(pose, skeleton, parent, frames).rotation : [0, 0, 0, 1];
        const inv: Quat = [-parentRot[0], -parentRot[1], -parentRot[2], parentRot[3]];
        const local = multiplyQuat(inv, normalized);
        const ll = Math.hypot(local[0], local[1], local[2], local[3]) || 1;
        pose.rotations[index * 4] = local[0] / ll;
        pose.rotations[index * 4 + 1] = local[1] / ll;
        pose.rotations[index * 4 + 2] = local[2] / ll;
        pose.rotations[index * 4 + 3] = local[3] / ll;
        // Downstream bones see this bone's new world rotation — drop the whole
        // cache so later entries recompute against the updated pose.
        frames.clear();
      }

      // Eyes aim directly at the target (instant saccade, no spring).
      for (const eyeName of spec.eyes ?? []) {
        const index = jointIndex(skeleton, eyeName);
        const frame = jointFrame(pose, skeleton, index, frames);
        const eyeForward = rotateVec3(frame.rotation, axis);
        const eyeToTarget = normalize([
          targetLocal[0] - frame.position[0],
          targetLocal[1] - frame.position[1],
          targetLocal[2] - frame.position[2]
        ]);
        const d = eyeForward[0] * eyeToTarget[0] + eyeForward[1] * eyeToTarget[1] + eyeForward[2] * eyeToTarget[2];
        if (d > 1 - 1e-6) continue;
        const cross: Vec3 = [
          eyeForward[1] * eyeToTarget[2] - eyeForward[2] * eyeToTarget[1],
          eyeForward[2] * eyeToTarget[0] - eyeForward[0] * eyeToTarget[2],
          eyeForward[0] * eyeToTarget[1] - eyeForward[1] * eyeToTarget[0]
        ];
        const w = Math.sqrt((1 + Math.max(-1, d)) / 2);
        const s = 1 / (2 * w);
        const aim: Quat = [cross[0] * s, cross[1] * s, cross[2] * s, w];
        const world = multiplyQuat(aim, frame.rotation);
        const parent = skeleton.parentIndices[index] ?? -1;
        const parentRot: Quat = parent >= 0 ? jointFrame(pose, skeleton, parent, frames).rotation : [0, 0, 0, 1];
        const inv: Quat = [-parentRot[0], -parentRot[1], -parentRot[2], parentRot[3]];
        const local = multiplyQuat(inv, world);
        const ll = Math.hypot(local[0], local[1], local[2], local[3]) || 1;
        pose.rotations[index * 4] = local[0] / ll;
        pose.rotations[index * 4 + 1] = local[1] / ll;
        pose.rotations[index * 4 + 2] = local[2] / ll;
        pose.rotations[index * 4 + 3] = local[3] / ll;
      }
    }
  };
}
