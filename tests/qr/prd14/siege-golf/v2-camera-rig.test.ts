// tests/qr/prd14/siege-golf/v2-camera-rig.test.ts — altitude rig (§6.9.10).
import { describe, expect, it } from "vitest";
import { createSiegeRig } from "../../../../apps/showcase-siege-golf/src/v2/scene/camera";

const ctx = (dt = 1 / 60, time = 0) => ({ dt, time }) as never;

describe("siege-golf altitude rig", () => {
  it("reports its rig id and sits high behind the tee", () => {
    const state = { ball: { x: 0, z: 2 }, ballInFlight: false };
    const rig = createSiegeRig(state);
    expect(rig.id).toBe("siege-golf.altitude");
    const pose = rig.update(ctx());
    expect(pose.position[1]).toBeGreaterThan(7);
    expect(pose.position[2]).toBeGreaterThan(5);
    expect(pose.fov).toBeGreaterThanOrEqual(45);
    expect(pose.fov).toBeLessThanOrEqual(60);
  });

  it("keeps the lane centroid as the aim-phase target", () => {
    const state = { ball: { x: -1, z: 3 }, ballInFlight: false };
    const rig = createSiegeRig(state);
    const pose = rig.update(ctx(1));
    expect(pose.target[2]).toBeCloseTo(-3.4, 1);
    expect(pose.target[1]).toBeCloseTo(0.2, 1);
  });

  it("eases the target toward the ball while a stroke resolves", () => {
    const state = { ball: { x: 1.2, z: -8 }, ballInFlight: true };
    const rig = createSiegeRig(state);
    let pose = rig.update(ctx(0.016));
    const initialZ = pose.target[2];
    for (let i = 0; i < 120; i++) pose = rig.update(ctx(0.016));
    expect(pose.target[2]).toBeLessThan(initialZ);
    // Never chases past the follow-fraction blend toward the ball.
    expect(pose.target[2]).toBeGreaterThan(-8);
    expect(pose.target[1]).toBeCloseTo(0.2, 1);
  });

  it("reset returns the target to the lane centroid", () => {
    const state = { ball: { x: 2, z: -9 }, ballInFlight: true };
    const rig = createSiegeRig(state);
    for (let i = 0; i < 60; i++) rig.update(ctx(0.016));
    rig.reset();
    state.ballInFlight = false;
    const pose = rig.update(ctx(0.016));
    expect(pose.target[2]).toBeCloseTo(-3.4, 1);
  });
});
