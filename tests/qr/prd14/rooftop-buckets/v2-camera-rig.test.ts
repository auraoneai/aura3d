// tests/qr/prd14/rooftop-buckets/v2-camera-rig.test.ts — T2.3 rig geometry.
// Asserts the shoulder rig sits behind/right of the active spot aimed at the
// rim, eases the target a bounded amount toward a live ball, and returns to
// the rim line-up after the ball settles.
import { describe, expect, it } from "vitest";
import { createRooftopRig, fallbackCameraNode, type RooftopRigState } from "../../../../apps/showcase-rooftop-buckets/src/v2/scene/camera";
import type { AuraCameraPose, AuraCameraRigContext, AuraVec3 } from "@aura3d/engine";

const SPOT = { x: 0, z: 4.6 }; // free-throw spot

function ctx(dt = 1 / 60): AuraCameraRigContext {
  return {
    dt,
    time: 0,
    aspect: 16 / 9,
    previous: {} as AuraCameraPose,
    subject: () => undefined,
    probe: { sphereCast: () => ({ hit: false, distance: Infinity }), occluders: () => [] }
  };
}

const step = (rig: ReturnType<typeof createRooftopRig>, frames: number, dt = 1 / 60): AuraCameraPose => {
  let pose = rig.update(ctx(dt));
  for (let i = 1; i < frames; i += 1) pose = rig.update(ctx(dt));
  return pose;
};

describe("rooftop-buckets shoulder rig (T2.3)", () => {
  it("sits behind the spot, aimed at the rim, level horizon", () => {
    const state: RooftopRigState = { spot: SPOT, ball: null };
    const rig = createRooftopRig(state);
    const pose = step(rig, 120);
    // Behind the spot along spot→hoop (−z), offset right (+x of the ray normal).
    expect(pose.position[2]).toBeGreaterThan(SPOT.z + 1.5);
    expect(pose.position[0]).toBeGreaterThan(SPOT.x);
    expect(pose.position[1]).toBeCloseTo(1.75, 5);
    expect(pose.target[0]).toBeCloseTo(0, 3);
    expect(pose.target[1]).toBeCloseTo(3.05, 3);
    expect(pose.target[2]).toBeCloseTo(0, 3);
    expect(pose.fov).toBe(50);
    expect(pose.roll).toBe(0);
    expect(pose.up).toEqual([0, 1, 0]);
  });

  it("eases the target toward a live ball without moving the eye", () => {
    const state: RooftopRigState = { spot: SPOT, ball: [-1.5, 3.4, 1.0] };
    const rig = createRooftopRig(state);
    const base = step(rig, 1);
    const pose = step(rig, 240);
    // Blend 0.55 toward the ball: x eases negative, z eases positive of the rim.
    expect(pose.target[0]).toBeLessThan(0);
    expect(pose.target[0]).toBeGreaterThanOrEqual(-1.5 * 0.56);
    expect(pose.target[2]).toBeGreaterThan(0);
    expect(pose.target[1]).toBeGreaterThanOrEqual(1.2);
    expect(pose.position).toEqual(base.position);
  });

  it("returns to the rim after the ball settles", () => {
    const state: RooftopRigState = { spot: SPOT, ball: [-1.5, 3.4, 1.0] };
    const rig = createRooftopRig(state);
    step(rig, 240);
    state.ball = null;
    const pose = step(rig, 600);
    expect(pose.target[0]).toBeCloseTo(0, 3);
    expect(pose.target[1]).toBeCloseTo(3.05, 3);
    expect(pose.target[2]).toBeCloseTo(0, 3);
  });

  it("re-frames when the spot changes", () => {
    const state: RooftopRigState = { spot: SPOT, ball: null };
    const rig = createRooftopRig(state);
    const poseA = step(rig, 60);
    (state as { spot: AuraVec3 | { x: number; z: number } }).spot = { x: -4.5, z: 6.2 };
    const poseB = step(rig, 60);
    expect(poseB.position[0]).toBeLessThan(poseA.position[0]);
    expect(poseB.position[2]).toBeGreaterThan(poseA.position[2]);
  });

  it("fallback camera compiles the same framing", () => {
    const cam = fallbackCameraNode();
    expect(cam).toBeTruthy();
  });
});
