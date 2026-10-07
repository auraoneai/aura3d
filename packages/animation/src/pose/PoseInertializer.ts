/**
 * PRD-06 T1.6 — per-bone inertialized transitions (§6.4).
 *
 * `transition(latest, previous, dt)` captures the outgoing pose plus its
 * per-bone velocity (finite difference of the last two output poses).
 * `apply(out, newPose, elapsed)` writes `newPose` with the captured offset
 * decayed by the existing `inertializedQuat` / `inertializedVec3` math —
 * at `elapsed = 0` the output equals the captured pose (position- and
 * velocity-continuous), then converges to `newPose`.
 */

import {
  inertializationDecayRate,
  inertializedQuat,
  inertializedVec3
} from "../Inertialization.js";
import type { Quat, Vec3 } from "../Keyframe.js";
import { createPoseBuffer, type PoseBuffer } from "./PoseBuffer.js";

export const DEFAULT_POSE_TRANSITION_HALF_LIFE = 0.15;

export class PoseInertializer {
  private captured: PoseBuffer | undefined;
  private readonly positionVelocities: Float32Array;
  private readonly scaleVelocities: Float32Array;
  /** Per-bone angular velocity: axis (unit vec3, from latest·prev⁻¹) and speed (rad/s). */
  private readonly angularSpeeds: Float32Array;
  private readonly angularAxes: Float32Array;
  private readonly boneCount: number;
  private halfLife = DEFAULT_POSE_TRANSITION_HALF_LIFE;

  constructor(boneCount: number) {
    if (!Number.isInteger(boneCount) || boneCount < 0) {
      throw new Error("PoseInertializer requires a non-negative integer bone count.");
    }
    this.boneCount = boneCount;
    this.positionVelocities = new Float32Array(boneCount * 3);
    this.scaleVelocities = new Float32Array(boneCount * 3);
    this.angularSpeeds = new Float32Array(boneCount);
    this.angularAxes = new Float32Array(boneCount * 3);
  }

  /** True once a transition has been captured. */
  get active(): boolean {
    return this.captured !== undefined;
  }

  /**
   * Capture the transition: `latest` is the last output pose before the
   * switch, `previous` the output `dt` seconds earlier (for velocities).
   */
  transition(latest: PoseBuffer, previous: PoseBuffer, dt: number, halfLife = DEFAULT_POSE_TRANSITION_HALF_LIFE): void {
    if (latest.boneCount !== this.boneCount || previous.boneCount !== this.boneCount) {
      throw new Error("PoseInertializer.transition requires poses matching the constructor bone count.");
    }
    if (!(dt > 0)) {
      throw new Error("PoseInertializer.transition requires a positive dt.");
    }
    if (!this.captured) this.captured = createPoseBuffer(this.boneCount);
    const captured = this.captured;
    this.halfLife = halfLife;
    const invDt = 1 / dt;

    for (let bone = 0; bone < this.boneCount; bone += 1) {
      const p = bone * 3;
      const q = bone * 4;
      for (let axis = 0; axis < 3; axis += 1) {
        captured.positions[p + axis] = latest.positions[p + axis]!;
        captured.scales[p + axis] = latest.scales[p + axis]!;
        this.positionVelocities[p + axis] = (latest.positions[p + axis]! - previous.positions[p + axis]!) * invDt;
        this.scaleVelocities[p + axis] = (latest.scales[p + axis]! - previous.scales[p + axis]!) * invDt;
      }
      captured.rotations[q] = latest.rotations[q]!;
      captured.rotations[q + 1] = latest.rotations[q + 1]!;
      captured.rotations[q + 2] = latest.rotations[q + 2]!;
      captured.rotations[q + 3] = latest.rotations[q + 3]!;

      // Angular speed: angle of the per-frame delta rotation (latest·prev⁻¹),
      // signed later against each bone's offset axis at apply time.
      const delta = quatMultiply(
        [latest.rotations[q]!, latest.rotations[q + 1]!, latest.rotations[q + 2]!, latest.rotations[q + 3]!],
        quatConjugate([previous.rotations[q]!, previous.rotations[q + 1]!, previous.rotations[q + 2]!, previous.rotations[q + 3]!])
      );
      const w = Math.min(1, Math.abs(normalizeComponent(delta[3])));
      this.angularSpeeds[bone] = (2 * Math.acos(w)) * invDt;
      const axis = quatAxis(delta);
      this.angularAxes[p] = axis[0];
      this.angularAxes[p + 1] = axis[1];
      this.angularAxes[p + 2] = axis[2];
    }
  }

  /**
   * Write `newPose` with the captured offset decayed over `elapsed` seconds
   * into `out`. Buffers are reused — `out` may alias `newPose`.
   */
  apply(out: PoseBuffer, newPose: PoseBuffer, elapsed: number): PoseBuffer {
    if (!this.captured) {
      throw new Error("PoseInertializer.apply called before transition().");
    }
    if (newPose.boneCount !== this.boneCount || out.boneCount !== this.boneCount) {
      throw new Error("PoseInertializer.apply requires poses matching the constructor bone count.");
    }
    const captured = this.captured;
    const halfLife = this.halfLife;

    for (let bone = 0; bone < this.boneCount; bone += 1) {
      const p = bone * 3;
      const q = bone * 4;

      const posOffset: Vec3 = [
        captured.positions[p]! - newPose.positions[p]!,
        captured.positions[p + 1]! - newPose.positions[p + 1]!,
        captured.positions[p + 2]! - newPose.positions[p + 2]!
      ];
      const posVelocity: Vec3 = [
        this.positionVelocities[p]!,
        this.positionVelocities[p + 1]!,
        this.positionVelocities[p + 2]!
      ];
      const decayedPos = inertializedVec3(posOffset, elapsed, halfLife, posVelocity);
      out.positions[p] = newPose.positions[p]! + decayedPos[0];
      out.positions[p + 1] = newPose.positions[p + 1]! + decayedPos[1];
      out.positions[p + 2] = newPose.positions[p + 2]! + decayedPos[2];

      const scaleOffset: Vec3 = [
        captured.scales[p]! - newPose.scales[p]!,
        captured.scales[p + 1]! - newPose.scales[p + 1]!,
        captured.scales[p + 2]! - newPose.scales[p + 2]!
      ];
      const scaleVelocity: Vec3 = [
        this.scaleVelocities[p]!,
        this.scaleVelocities[p + 1]!,
        this.scaleVelocities[p + 2]!
      ];
      const decayedScale = inertializedVec3(scaleOffset, elapsed, halfLife, scaleVelocity);
      out.scales[p] = newPose.scales[p]! + decayedScale[0];
      out.scales[p + 1] = newPose.scales[p + 1]! + decayedScale[1];
      out.scales[p + 2] = newPose.scales[p + 2]! + decayedScale[2];

      const source: Quat = [
        captured.rotations[q]!,
        captured.rotations[q + 1]!,
        captured.rotations[q + 2]!,
        captured.rotations[q + 3]!
      ];
      const target: Quat = [
        newPose.rotations[q]!,
        newPose.rotations[q + 1]!,
        newPose.rotations[q + 2]!,
        newPose.rotations[q + 3]!
      ];
      // Sign the captured angular speed onto this bone's offset axis so
      // momentum keeps pushing in the pre-transition direction.
      const offset = quatMultiply(quatNormalize(source), quatConjugate(quatNormalize(target)));
      const offsetAxis = quatAxis(offset);
      const velAxis: Vec3 = [this.angularAxes[p]!, this.angularAxes[p + 1]!, this.angularAxes[p + 2]!];
      const sign = dot3(offsetAxis, velAxis) >= 0 ? 1 : -1;
      const offsetAngle = 2 * Math.acos(Math.min(1, Math.abs(offset[3])));
      let blended: Quat;
      if (offsetAngle < 1e-4 && this.angularSpeeds[bone]! > 0) {
        // Degenerate case: poses already match, so the offset axis is
        // undefined — decay momentum about the *captured velocity* axis
        // instead of an arbitrary fallback axis.
        const decayed = inertializedScalarInline(0, this.angularSpeeds[bone]!, elapsed, halfLife);
        const momentum: Quat = [
          velAxis[0] * Math.sin(decayed / 2),
          velAxis[1] * Math.sin(decayed / 2),
          velAxis[2] * Math.sin(decayed / 2),
          Math.cos(decayed / 2)
        ];
        blended = quatNormalize(quatMultiply(momentum, quatNormalize(target)));
      } else {
        blended = inertializedQuat(source, target, elapsed, halfLife, this.angularSpeeds[bone]! * sign);
      }
      out.rotations[q] = blended[0];
      out.rotations[q + 1] = blended[1];
      out.rotations[q + 2] = blended[2];
      out.rotations[q + 3] = blended[3];
    }
    return out;
  }

  /** Drop the captured transition (no allocation). */
  clear(): void {
    this.captured = undefined;
  }
}

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length <= 1e-9) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function normalizeComponent(x: number): number {
  return Number.isFinite(x) ? x : 1;
}

/** Rotation axis of a unit quaternion (normalized, or +X for identity). */
function quatAxis(q: Quat): Vec3 {
  const s = Math.sqrt(Math.max(0, 1 - Math.min(1, q[3] * q[3])));
  if (s < 1e-8) return [1, 0, 0];
  return [q[0] / s, q[1] / s, q[2] / s];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** `Inertialization.ts`'s scalar spring, inlined so `elapsed = 0` maps to `offset0`. */
function inertializedScalarInline(offset0: number, velocity0: number, t: number, halfLife: number): number {
  if (!(t > 0)) return offset0;
  const k = inertializationDecayRate(halfLife);
  if (!Number.isFinite(k)) return 0;
  return (offset0 + (velocity0 + k * offset0) * t) * Math.exp(-k * t);
}
