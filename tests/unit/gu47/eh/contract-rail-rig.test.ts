/**
 * GU47 E-H (WP-8) item 1: the contract `rigs.rail` factory
 * (`packages/engine/src/contracts/camera.ts`) returns the controller's
 * arc-length Catmull-Rom rail (`agent-api/camera/rigs/rail.ts`), not the PR 0a
 * static pose at `points[0]`.
 */
import { describe, expect, it } from "vitest";
import { stubCameraRigFactories, type AuraCameraPose, type AuraCameraRig } from "../../../../packages/engine/src/contracts/camera";

const previous: AuraCameraPose = { position: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0], roll: 0, fov: 55, near: 0.05, far: 100 };

function poseAt(rig: AuraCameraRig, seconds: number): AuraCameraPose {
  return rig.update({
    dt: 1 / 60,
    time: seconds * 1000,
    aspect: 16 / 9,
    previous,
    subject: () => undefined,
    probe: { sphereCast: () => ({ hit: false, distance: Infinity }), occluders: () => [] }
  });
}

describe("GU47 E-H contract rigs.rail", () => {
  it("returns the real rail: the camera travels the points over `duration`", () => {
    const rig = stubCameraRigFactories.rail({ points: [[0, 1, 0], [5, 1, 0], [10, 1, 0]], lookAt: [0, 0, -10], duration: 4 });
    expect(rig.id).toBe("rail");
    const start = poseAt(rig, 0);
    const middle = poseAt(rig, 2);
    const end = poseAt(rig, 4);
    expect(start.position[0]).toBeCloseTo(0, 3);
    expect(middle.position[0]).toBeGreaterThan(2);
    expect(middle.position[0]).toBeLessThan(8);
    expect(end.position[0]).toBeCloseTo(10, 3);
    // The stub returned points[0] forever.
    expect(end.position).not.toEqual(start.position);
    expect(end.target).toEqual([0, 0, -10]);
  });

  it("reads a Vec3[] lookAt as a track (the stub mis-read it as one point)", () => {
    const rig = stubCameraRigFactories.rail({
      points: [[0, 2, 5], [10, 2, 5]],
      lookAt: [[0, 0, 0], [10, 0, 0]],
      duration: 1,
      ease: "linear"
    });
    expect(poseAt(rig, 0).target[0]).toBeCloseTo(0, 3);
    expect(poseAt(rig, 0.5).target[0]).toBeCloseTo(5, 1);
    expect(poseAt(rig, 1).target[0]).toBeCloseTo(10, 3);
  });

  it("honours ease and fov", () => {
    const linear = stubCameraRigFactories.rail({ points: [[0, 0, 0], [10, 0, 0]], lookAt: [0, 0, -1], duration: 1, ease: "linear", fov: 35 });
    const eased = stubCameraRigFactories.rail({ points: [[0, 0, 0], [10, 0, 0]], lookAt: [0, 0, -1], duration: 1, ease: "inCubic" });
    expect(poseAt(linear, 0.25).position[0]).toBeCloseTo(2.5, 1);
    expect(poseAt(eased, 0.25).position[0]).toBeLessThan(1);
    expect(poseAt(linear, 0.5).fov).toBe(35);
    // Without fov the rail keeps the controller default (50).
    expect(poseAt(eased, 0.5).fov).toBe(50);
  });

  it("keeps the controller contract: fewer than 2 points throw", () => {
    expect(() => stubCameraRigFactories.rail({ points: [[0, 0, 0]], lookAt: [0, 0, 0], duration: 1 })).toThrow(/>= 2 points/);
  });
});
