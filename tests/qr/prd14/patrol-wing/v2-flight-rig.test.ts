// tests/qr/prd14/patrol-wing/v2-flight-rig.test.ts — §6.9.11 rig proofs.
import { describe, expect, it } from "vitest";
import {
  createPatrolRig,
  patrolPoseFor,
  pointInRigFrame
} from "../../../../apps/showcase-patrol-wing/src/v2/scene/camera";

const ctx = (dt: number) => ({ dt, time: 0, aspect: 16 / 9 });

const aircraft = (
  position: readonly [number, number, number],
  forward: readonly [number, number, number] = [1, 0, 0],
  up: readonly [number, number, number] = [0, 1, 0]
) => ({ position, forward, up });

describe("patrol-wing flight rig", () => {
  it("reports its rig id inside the [65,73] fov band", () => {
    const rig = createPatrolRig(aircraft([0, 6, 0]));
    expect(rig.id).toBe("patrol-wing.flight");
    const pose = rig.update(ctx(1 / 60));
    expect(pose.fov).toBeGreaterThanOrEqual(65);
    expect(pose.fov).toBeLessThanOrEqual(73);
  });

  it("trails behind and above the aircraft along its forward axis", () => {
    const pose = patrolPoseFor(aircraft([0, 6, 0], [1, 0, 0]));
    // Behind: -x of the nose; above: +y. Aimed ahead of the nose so the
    // ring corridor reads in the upper frame.
    expect(pose.position[0]).toBeLessThan(-8);
    expect(pose.position[1]).toBeGreaterThan(6 + 3);
    expect(pose.target[0]).toBeGreaterThan(5);
    expect(pose.target[1]).toBeLessThan(6);
  });

  it("tracks the aircraft's climb attitude (pitch changes the eye, not just the aim)", () => {
    const level = patrolPoseFor(aircraft([0, 6, 0], [1, 0, 0]));
    const climbing = patrolPoseFor(aircraft([0, 6, 0], [0.85, 0.52, 0]));
    // Nose-up: the eye drops lower relative to the nose and the target rises.
    expect(climbing.position[1]).toBeLessThan(level.position[1]);
    expect(climbing.target[1]).toBeGreaterThan(level.target[1]);
  });

  it("keeps the aircraft inside the forward cone (subject readable at any yaw)", () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7]) {
      const forward = [Math.cos(yaw), 0, -Math.sin(yaw)] as const;
      const state = aircraft([4, 8, -2], forward);
      expect(pointInRigFrame(patrolPoseFor(state), state.position)).toBe(true);
    }
  });

  it("rejects gates far outside the cone but accepts ones on the flight line", () => {
    const state = aircraft([0, 6, 0], [1, 0, 0]);
    const pose = patrolPoseFor(state);
    expect(pointInRigFrame(pose, [18, 7, 0.5])).toBe(true); // ahead on the line
    expect(pointInRigFrame(pose, [-20, 6, 0])).toBe(false); // behind
    expect(pointInRigFrame(pose, [0, 6, 60])).toBe(false); // hard right
  });

  it("eases toward poses and reset snaps", () => {
    const state = { position: [0, 6, 0] as const, forward: [1, 0, 0] as const, up: [0, 1, 0] as const };
    const mutable = {
      position: [...state.position] as [number, number, number],
      forward: [...state.forward] as [number, number, number],
      up: [...state.up] as [number, number, number]
    };
    const rig = createPatrolRig(mutable);
    rig.reset();
    const first = rig.update(ctx(1 / 60));
    mutable.position[1] = 20;
    const second = rig.update(ctx(1 / 60));
    const want = patrolPoseFor(mutable).position[1]!;
    expect(second.position[1]).toBeGreaterThan(first.position[1]!); // rising toward the climb
    expect(second.position[1]).toBeLessThan(want); // eased, not snapped
    rig.reset();
    const snapped = rig.update(ctx(1 / 60));
    expect(Math.abs(snapped.position[1]! - want)).toBeLessThan(1e-6);
  });

  it("provides a sane fallback camera (sortie viewpoint, sane fov)", () => {
    const state = aircraft([0, 6, 0]);
    const pose = patrolPoseFor(state);
    expect(pose.far).toBeGreaterThan(pose.near);
    expect(Math.hypot(...pose.position.map((v, i) => v - pose.target[i]!))).toBeGreaterThan(4);
  });
});
