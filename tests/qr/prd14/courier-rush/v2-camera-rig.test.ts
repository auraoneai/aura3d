// tests/qr/prd14/courier-rush/v2-camera-rig.test.ts — T2.3 rig geometry.
// Asserts the chase rig trails the van along −forward, aims ahead of the
// bumper, deepens during the drop look-back, and keeps a level horizon.
import { describe, expect, it } from "vitest";
import { createCourierRig, fallbackCameraNode, type CourierRigState } from "../../../../apps/showcase-courier-rush/src/v2/scene/camera";
import type { AuraCameraPose, AuraCameraRigContext } from "@aura3d/engine";

const VAN = { x: -0.45, z: 18.6, heading: -Math.PI / 2 }; // forward f=(0,−1) → −z

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

const step = (rig: ReturnType<typeof createCourierRig>, frames: number, dt = 1 / 60): AuraCameraPose => {
  let pose = rig.update(ctx(dt));
  for (let i = 1; i < frames; i += 1) pose = rig.update(ctx(dt));
  return pose;
};

describe("courier-rush chase rig (T2.3)", () => {
  it("trails the van, aims through the bumper, level horizon", () => {
    const state: CourierRigState = { van: { ...VAN }, lookback: 0 };
    const rig = createCourierRig(state);
    const pose = step(rig, 240);
    // f = (cos h, sin h) = (0,−1) → forward −z; eye trails +z of the van.
    expect(pose.position[2]).toBeGreaterThan(VAN.z + 3);
    expect(pose.position[1]).toBeGreaterThan(1);
    expect(Math.abs(pose.position[0] - VAN.x)).toBeLessThan(1);
    // Forward is f=(cos h, sin h) = (0,−1) → target leads toward −z.
    expect(pose.target[2]).toBeLessThan(VAN.z);
    expect(pose.up).toEqual([0, 1, 0]);
    expect(pose.roll).toBe(0);
    expect(pose.fov).toBeCloseTo(49, 3);
  });

  it("lookback deepens the chase offset mid-envelope", () => {
    const level: CourierRigState = { van: { ...VAN }, lookback: 0 };
    const back: CourierRigState = { van: { ...VAN }, lookback: 0.5 }; // sin(π·0.5)=1 peak swing
    const levelPose = step(createCourierRig(level), 400);
    const backPose = step(createCourierRig(back), 400);
    const levelDist = Math.hypot(levelPose.position[0] - VAN.x, levelPose.position[2] - VAN.z);
    const backDist = Math.hypot(backPose.position[0] - VAN.x, backPose.position[2] - VAN.z);
    expect(backDist).toBeGreaterThan(levelDist + 0.8);
  });

  it("converges smoothly when the van jumps", () => {
    const state: CourierRigState = { van: { ...VAN }, lookback: 0 };
    const rig = createCourierRig(state);
    const pose = step(rig, 60);
    state.van = { x: VAN.x, z: VAN.z - 12, heading: VAN.heading };
    const mid = rig.update(ctx(1 / 60));
    // One frame after a 12 m jump the rig has moved but not teleported.
    expect(mid.position[2]).toBeLessThan(pose.position[2]);
    expect(mid.position[2]).toBeGreaterThan(pose.position[2] - 4);
  });

  it("fallback camera spec is a valid perspective node", () => {
    const spec = fallbackCameraNode();
    expect(spec.mode).toBe("perspective");
    expect(spec.position?.length).toBe(3);
    expect(spec.target?.length).toBe(3);
    expect(spec.fov).toBeCloseTo(49, 3);
  });
});
