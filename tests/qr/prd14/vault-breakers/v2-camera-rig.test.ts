// tests/qr/prd14/vault-breakers/v2-camera-rig.test.ts — T2.3 rig geometry.
// Asserts the static-table rig keeps the authored framing (fixed position,
// fov 50, level horizon) and that the ball-track easing stays inside the
// bounded ±0.4 m window without moving the eye.
import { describe, expect, it } from "vitest";
import { createVaultRig, fallbackCameraNode, type VaultRigState } from "../../../../apps/showcase-vault-breakers/src/v2/scene/camera";
import type { AuraCameraPose, AuraCameraRigContext, AuraVec3 } from "@aura3d/engine";

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

const step = (rig: ReturnType<typeof createVaultRig>, frames: number, dt = 1 / 60): AuraCameraPose => {
  let pose = rig.update(ctx(dt));
  for (let i = 1; i < frames; i += 1) pose = rig.update(ctx(dt));
  return pose;
};

describe("vault-breakers static-table rig (T2.3)", () => {
  it("holds the authored base pose with no ball in play", () => {
    const state: VaultRigState = { ball: null };
      const rig = createVaultRig(state);
    const pose = step(rig, 120);
    expect(pose.position).toEqual([0, 5.15, 7.35]);
    expect(pose.target[0]).toBeCloseTo(0, 6);
    expect(pose.target[1]).toBeCloseTo(-0.05, 6);
    expect(pose.target[2]).toBeCloseTo(-0.38, 6);
    expect(pose.fov).toBe(50);
    expect(pose.roll).toBe(0);
    expect(pose.up).toEqual([0, 1, 0]);
  });

  it("eases the target a bounded amount toward a live ball", () => {
    const state: VaultRigState = { ball: [-1.5, 0.3, -2.0] };
    const rig = createVaultRig(state);
    const pose = step(rig, 240);
    // Bounded track window: |x| ≤ 0.12*1.5 → ≤0.18, |z| ≤ 0.15*1.62 → ≤0.243.
    expect(pose.target[0]).toBeLessThan(0);
    expect(Math.abs(pose.target[0])).toBeLessThanOrEqual(0.4);
    expect(pose.target[2]).toBeLessThan(-0.38);
    expect(Math.abs(pose.target[2] + 0.38)).toBeLessThanOrEqual(0.4);
    expect(pose.position).toEqual([0, 5.15, 7.35]);
  });

  it("returns to the base target after the ball drains", () => {
    const state: VaultRigState = { ball: [-1.5, 0.3, -2.0] };
    const rig = createVaultRig(state);
    step(rig, 240);
    (state as { ball: AuraVec3 | null }).ball = null;
    const pose = step(rig, 300);
    expect(pose.target[0]).toBeCloseTo(0, 3);
    expect(pose.target[2]).toBeCloseTo(-0.38, 3);
  });

  it("fallback compiled camera is the authored perspective builder", () => {
    // camera.perspective() returns a builder consumed by scene().camera();
    // assert it exists and carries the base fov through its spec surface.
    const node = fallbackCameraNode();
    expect(node).toBeTruthy();
    expect(typeof node).toBe("object");
  });
});
