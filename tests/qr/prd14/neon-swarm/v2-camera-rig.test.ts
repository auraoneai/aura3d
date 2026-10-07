// tests/qr/prd14/neon-swarm/v2-camera-rig.test.ts — T2.3 rig geometry.
// Asserts the top-down rig sits at the §6.9.8 offset over the courier, eases
// the target along the aim lead, and keeps a level horizon.
import { describe, expect, it } from "vitest";
import { createSwarmRig, fallbackCameraNode, type SwarmRigState } from "../../../../apps/showcase-neon-swarm/src/v2/scene/camera";
import type { AuraCameraPose, AuraCameraRigContext } from "@aura3d/engine";

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

const step = (rig: ReturnType<typeof createSwarmRig>, frames: number, dt = 1 / 60): AuraCameraPose => {
  let pose = rig.update(ctx(dt));
  for (let i = 1; i < frames; i += 1) pose = rig.update(ctx(dt));
  return pose;
};

describe("neon-swarm top-down rig (T2.3)", () => {
  it("sits at the authored offset over the courier, aims slightly along aim", () => {
    const state: SwarmRigState = { player: { x: 0, z: 3 }, aim: { x: 0, z: -1 } };
    const rig = createSwarmRig(state);
    const pose = step(rig, 240);
    expect(pose.position[0]).toBeCloseTo(0, 3);
    expect(pose.position[1]).toBeCloseTo(9.1, 3);
    expect(pose.position[2]).toBeCloseTo(3 + 4.8, 3);
    // Aim −z leads the target a small bounded amount ahead of the courier.
    expect(pose.target[2]).toBeLessThan(3);
    expect(pose.target[2]).toBeGreaterThan(3 - 1.4);
    expect(pose.target[0]).toBeCloseTo(0, 3);
    expect(pose.up).toEqual([0, 1, 0]);
    expect(pose.roll).toBe(0);
    expect(pose.fov).toBe(44);
  });

  it("follows the courier as it moves", () => {
    const state: SwarmRigState = { player: { x: 0, z: 3 }, aim: { x: 0, z: -1 } };
    const rig = createSwarmRig(state);
    step(rig, 120);
    state.player = { x: 8, z: -4 };
    const pose = step(rig, 300);
    expect(pose.position[0]).toBeCloseTo(8, 1);
    expect(pose.position[2]).toBeCloseTo(-4 + 4.8, 1);
  });

  it("converges smoothly, not instantaneously", () => {
    const state: SwarmRigState = { player: { x: 0, z: 3 }, aim: { x: 0, z: -1 } };
    const rig = createSwarmRig(state);
    const pose = step(rig, 60);
    state.player = { x: 10, z: 3 };
    const mid = rig.update(ctx(1 / 60));
    expect(mid.position[0]).toBeGreaterThan(pose.position[0]);
    expect(mid.position[0]).toBeLessThan(pose.position[0] + 3);
  });

  it("fallback camera spec is a valid perspective node", () => {
    const spec = fallbackCameraNode();
    expect(spec.mode).toBe("perspective");
    expect(spec.position?.length).toBe(3);
    expect(spec.target?.length).toBe(3);
    expect(spec.fov).toBe(44);
  });
});
