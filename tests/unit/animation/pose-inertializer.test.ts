import { describe, expect, it } from "vitest";
import { PoseInertializer } from "../../../packages/animation/src/pose/PoseInertializer.js";
import { createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer.js";

const DT = 1 / 60;

/** Pose rotating about +Y at `omega` rad/s evaluated at `t`. */
function rotatingPose(t: number, omega: number): PoseBuffer {
  const pose = createPoseBuffer(1);
  const half = (omega * t) / 2;
  pose.rotations.set([0, Math.sin(half), 0, Math.cos(half)]);
  pose.positions.set([t * 0.5, 0, 0]); // 0.5 u/s translation
  return pose;
}

function quatAngleBetween(a: readonly number[], b: readonly number[]): number {
  const dot = Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!);
  return 2 * Math.acos(Math.min(1, dot));
}

describe("PoseInertializer (PRD-06 T1.6)", () => {
  it("keeps per-bone angular velocity continuous at transition (≤5% of pre-transition velocity)", () => {
    const omega = 10.0; // rad/s about +Y — fast enough to beat f32 storage noise
    const inertializer = new PoseInertializer(1);
    const previous = rotatingPose(1.0 - DT, omega);
    const latest = rotatingPose(1.0, omega);
    inertializer.transition(latest, previous, DT, 0.2);

    // New pose = the same ongoing motion (zero offset) isolates velocity continuity.
    const newPose = rotatingPose(1.0, omega);
    const out = createPoseBuffer(1);

    // Velocity at the transition boundary: secant over a short window whose
    // swept angle (≈0.04 rad) stays well above Float32Array quantization.
    const elapsed = 4e-3;
    inertializer.apply(out, newPose, elapsed);
    const postSpeed = quatAngleBetween([...latest.rotations], [...out.rotations]) / elapsed;
    expect(Math.abs(postSpeed - omega)).toBeLessThanOrEqual(omega * 0.05);
  });

  it("outputs the captured pose at elapsed=0 (position continuity)", () => {
    const inertializer = new PoseInertializer(1);
    const previous = rotatingPose(0.9, 1.0);
    const latest = rotatingPose(0.95, 1.0);
    inertializer.transition(latest, previous, DT);
    // A discontinuous new pose (new clip starts elsewhere).
    const newPose = createPoseBuffer(1);
    newPose.rotations.set([Math.sin(0.8), 0, 0, Math.cos(0.8)]);
    newPose.positions.set([5, 5, 5]);
    const out = createPoseBuffer(1);
    inertializer.apply(out, newPose, 0);
    for (let axis = 0; axis < 4; axis += 1) {
      expect(out.rotations[axis]!).toBeCloseTo(latest.rotations[axis]!, 6);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      expect(out.positions[axis]!).toBeCloseTo(latest.positions[axis]!, 6);
    }
  });

  it("converges to the new pose as the offset decays", () => {
    const inertializer = new PoseInertializer(1);
    inertializer.transition(rotatingPose(0.5, 1.5), rotatingPose(0.5 - DT, 1.5), DT, 0.1);
    const newPose = createPoseBuffer(1); // identity
    const out = createPoseBuffer(1);
    inertializer.apply(out, newPose, 2.0); // ~20 half-lives of 0.1s
    for (let axis = 0; axis < 4; axis += 1) {
      expect(out.rotations[axis]!).toBeCloseTo(newPose.rotations[axis]!, 4);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      expect(out.positions[axis]!).toBeCloseTo(0, 4);
    }
  });
});
