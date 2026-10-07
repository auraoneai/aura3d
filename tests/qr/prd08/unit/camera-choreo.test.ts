/**
 * Q-4: `sampleCameraPath` "catmull-rom" is real centripetal Catmull-Rom across
 * keyframes — non-zero velocity through interior keyframes (per-segment
 * smoothstep would report 0).
 */
import { describe, expect, it } from "vitest";
import { sampleCameraPath, type CameraPath } from "../../../../packages/engine/src/agent-api/CameraChoreographer.js";

const path = (interpolation: CameraPath["interpolation"]): CameraPath => ({
  id: "p",
  interpolation,
  keyframes: [
    { id: "k0", time: 0, position: [0, 0, 0], target: [0, 0, -1], fov: 50 },
    { id: "k1", time: 1, position: [4, 0, 0], target: [4, 0, -1], fov: 50 },
    { id: "k2", time: 2, position: [4, 4, 0], target: [4, 4, -1], fov: 50 },
    { id: "k3", time: 3, position: [0, 4, 0], target: [0, 4, -1], fov: 50 }
  ]
});

describe("Q-4 choreographer catmull-rom", () => {
  it("velocity at an interior keyframe is non-zero", () => {
    const p = path("catmull-rom");
    const eps = 0.002;
    const before = sampleCameraPath(p, 1 - eps);
    const after = sampleCameraPath(p, 1 + eps);
    const v = (after.position[1] - before.position[1]) / (2 * eps);
    expect(Math.abs(v)).toBeGreaterThan(0.1);
  });

  it("still passes through keyframes and clamps at ends", () => {
    const p = path("catmull-rom");
    const at1 = sampleCameraPath(p, 1);
    expect(at1.position[0]).toBeCloseTo(4, 5);
    expect(at1.position[1]).toBeCloseTo(0, 5);
    const atStart = sampleCameraPath(p, 0);
    expect(atStart.position).toEqual([0, 0, 0]);
  });

  it("smoothstep is unchanged (zero velocity at keyframes)", () => {
    const p = path("smoothstep");
    const eps = 0.002;
    const before = sampleCameraPath(p, 1 - eps);
    const after = sampleCameraPath(p, 1 + eps);
    const dv = Math.hypot(
      after.position[0] - before.position[0],
      after.position[1] - before.position[1],
      after.position[2] - before.position[2]
    ) / (2 * eps);
    expect(dv).toBeLessThan(0.1);
  });
});
