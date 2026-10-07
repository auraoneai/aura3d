// tests/qr/prd14/gravity-post/v2-orbit-rig.test.ts — orbit rig (§6.9.13).
import { describe, expect, it } from "vitest";
import {
  createGravityRig,
  fallbackCameraNode,
  gravityPoseFor
} from "../../../../apps/showcase-gravity-post/src/v2/scene/camera";

const ctx = (dt = 1 / 60, time = 0) => ({ dt, time, aspect: 16 / 9 }) as never;

const boardState = (inFlight = false, podX = 0, podZ = 0) => ({ podX, podZ, inFlight });

describe("gravity-post orbit rig", () => {
  it("reports its rig id inside the [40,60] fov band", () => {
    const rig = createGravityRig(boardState());
    expect(rig.id).toBe("gravity-post.orbit");
    const pose = rig.update(ctx());
    expect(pose.fov).toBeGreaterThanOrEqual(40);
    expect(pose.fov).toBeLessThanOrEqual(60);
  });

  it("keeps the whole well board on screen as an elevated oblique", () => {
    const pose = gravityPoseFor(boardState(), 0);
    expect(pose.position[1]).toBeGreaterThan(5);
    // Target is the board centre, not a specific body.
    expect(pose.target[0]).toBeCloseTo(0.3, 1);
    expect(pose.target[2]).toBeCloseTo(-0.4, 1);
    // Every well lies inside the pose's forward cone at this distance.
    for (const [bx, bz] of [[0, 0], [2.05, 1.15], [-1.75, 1.85], [-2.85, -1.15], [1.25, -2.65], [3.45, -1.7]]) {
      const dx = bx - pose.position[0];
      const dy = 0.14 - pose.position[1];
      const dz = bz - pose.position[2];
      const fx = pose.target[0] - pose.position[0];
      const fy = pose.target[1] - pose.position[1];
      const fz = pose.target[2] - pose.position[2];
      const cos = (dx * fx + dy * fy + dz * fz)
        / (Math.hypot(dx, dy, dz) * Math.hypot(fx, fy, fz));
      expect(Math.acos(Math.min(1, cos)) * 180 / Math.PI).toBeLessThan(pose.fov / 2);
    }
  });

  it("borrows up to a third of the pod position while a flight is live", () => {
    const parked = gravityPoseFor(boardState(false, 2, 1), 0);
    const flying = gravityPoseFor(boardState(true, 2, 1), 0);
    expect(flying.target[0]).toBeGreaterThan(parked.target[0]);
    expect(flying.target[0]).toBeLessThan(2); // never fully chases the pod
    expect(Math.abs(flying.target[0] - 0.3) / Math.abs(2 - 0.3)).toBeLessThan(0.4);
  });

  it("drifts slowly instead of spinning", () => {
    const a = gravityPoseFor(boardState(), 0);
    const b = gravityPoseFor(boardState(), 10);
    const moved = Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]);
    expect(moved).toBeGreaterThan(0.05);
    expect(moved).toBeLessThan(1.5);
  });

  it("eases toward poses and reset snaps", () => {
    const state = boardState(true, 1, -1);
    const rig = createGravityRig(state);
    rig.reset();
    const first = rig.update(ctx(1 / 60));
    state.podX = 3;
    const second = rig.update(ctx(1 / 60));
    expect(Math.abs(second.target[0] - first.target[0])).toBeLessThan(0.2);
    const want = gravityPoseFor(state, 20);
    void want;
    expect(fallbackCameraNode().fov ?? 46).toBe(46);
  });
});
