// tests/qr/prd14/pulse-tunnel/v2-camera-rig.test.ts — T2.3 rig geometry.
// Asserts the chase rig sits low behind the craft looking down the tunnel,
// partially follows lane/jump offsets, and keeps a level horizon.
import { describe, expect, it } from "vitest";
import { createPulseRig, fallbackCameraNode } from "../../../../apps/showcase-pulse-tunnel/src/v2/scene/camera";
import type { AuraCameraPose, AuraCameraRigContext } from "@aura3d/engine";
import { PULSE_PLAYER_Z } from "../../../../apps/showcase-pulse-tunnel/src/gameplay/gates";

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

const step = (rig: ReturnType<typeof createPulseRig>, frames: number, dt = 1 / 60): AuraCameraPose => {
  let pose = rig.update(ctx(dt));
  for (let i = 1; i < frames; i += 1) pose = rig.update(ctx(dt));
  return pose;
};

describe("pulse-tunnel chase rig (T2.3)", () => {
  it("sits low behind the craft, looking down the tunnel", () => {
    const state = { x: 0, y: 0 };
    const rig = createPulseRig(state);
    const pose = step(rig, 240);
    expect(pose.position[2]).toBeCloseTo(PULSE_PLAYER_Z + 2.6, 3);
    expect(pose.position[1]).toBeCloseTo(0.85, 3);
    expect(pose.target[2]).toBeLessThan(-6);
    expect(pose.fov).toBe(62);
    expect(pose.up).toEqual([0, 1, 0]);
    expect(pose.roll).toBe(0);
  });

  it("follows a lane switch partially, not fully", () => {
    const state = { x: 0, y: 0 };
    const rig = createPulseRig(state);
    step(rig, 120);
    state.x = 0.75; // right lane
    const pose = step(rig, 300);
    expect(pose.position[0]).toBeCloseTo(0.75 * 0.4, 1);
    expect(pose.target[0]).toBeCloseTo(0.75 * 0.55, 1);
    // Eye stays on the lane side, target leads further — gates stay readable.
    expect(pose.target[0]).toBeGreaterThan(pose.position[0]);
  });

  it("lifts the eye on a jump but keeps the horizon level", () => {
    const state = { x: 0, y: 0 };
    const rig = createPulseRig(state);
    step(rig, 120);
    state.y = 0.55;
    const pose = step(rig, 300);
    expect(pose.position[1]).toBeGreaterThan(0.85);
    expect(pose.position[1]).toBeLessThan(1.5);
    expect(pose.roll).toBe(0);
    expect(pose.up).toEqual([0, 1, 0]);
  });

  it("fallback camera spec is a valid perspective node", () => {
    const spec = fallbackCameraNode();
    expect(spec.mode).toBe("perspective");
    expect(spec.position?.length).toBe(3);
    expect(spec.target?.length).toBe(3);
    expect(spec.fov).toBe(62);
  });
});
