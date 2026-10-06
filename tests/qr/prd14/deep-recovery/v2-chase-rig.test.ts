// tests/qr/prd14/deep-recovery/v2-chase-rig.test.ts — chase rig (§6.9.14).
import { describe, expect, it } from "vitest";
import {
  createDeepRig,
  deepPoseFor,
  fallbackCameraNode,
  pointInRigFrame,
  RIG_FOV
} from "../../../../apps/showcase-deep-recovery/src/v2/scene/camera";

const ctx = (dt = 1 / 60, time = 0) => ({ dt, time, aspect: 16 / 9 }) as never;

const sub = (x = 0, y = -6, z = 0, yaw = 0) => ({ x, y, z, yaw });

describe("deep-recovery chase rig", () => {
  it("reports its rig id inside the [55,70] fov band", () => {
    const rig = createDeepRig(sub());
    expect(rig.id).toBe("deep-recovery.chase");
    const pose = rig.update(ctx());
    expect(pose.fov).toBe(RIG_FOV);
    expect(pose.fov).toBeGreaterThanOrEqual(55);
    expect(pose.fov).toBeLessThanOrEqual(70);
  });

  it("sits above and behind the hull along yaw, aiming through the basin", () => {
    const pose = deepPoseFor(sub(0, -6, 0, 0));
    // Behind: -z of the sub at yaw 0; above it.
    expect(pose.position[2]).toBeLessThan(0 - 8);
    expect(pose.position[1]).toBeGreaterThan(-6 + 4);
    // Aimed ahead and slightly below so the trench reads in the lower frame.
    expect(pose.target[2]).toBeGreaterThan(0);
    expect(pose.target[1]).toBeLessThan(-6);
  });

  it("tracks the sub's yaw (turning moves the eye around the hull)", () => {
    const a = deepPoseFor(sub(0, -6, 0, 0));
    const b = deepPoseFor(sub(0, -6, 0, Math.PI / 2));
    // At yaw π/2 the eye swings to -x of the sub.
    expect(b.position[0]).toBeLessThan(-8);
    expect(Math.abs(b.position[0] - a.position[0])).toBeGreaterThan(8);
  });

  it("keeps the sub inside the forward cone (subject readable at any yaw)", () => {
    for (const yaw of [0, 0.9, -1.7, Math.PI]) {
      const pose = deepPoseFor(sub(3, -20, 8, yaw));
      expect(pointInRigFrame(pose, [3, -20, 8])).toBe(true);
    }
  });

  it("eases toward poses and reset snaps", () => {
    const state = { x: 0, y: -6, z: 0, yaw: 0 };
    const rig = createDeepRig(state);
    rig.reset();
    const first = rig.update(ctx(1 / 60));
    state.y = -30;
    const second = rig.update(ctx(1 / 60));
    expect(second.position[1]).toBeLessThan(first.position[1]); // moving down toward the dive
    expect(second.position[1]).toBeGreaterThan(-23); // eased, not snapped
    rig.reset();
    const snapped = rig.update(ctx(1 / 60));
    expect(Math.abs(snapped.position[1] - deepPoseFor(state).position[1])).toBeLessThan(1e-6);
  });

  it("provides a sane fallback camera (underwater viewpoint, sane fov)", () => {
    const fb = fallbackCameraNode();
    expect((fb as { fov?: number }).fov).toBeLessThanOrEqual(70);
    expect((fb as { position?: readonly number[] }).position![1]).toBeGreaterThan(-10);
  });
});
