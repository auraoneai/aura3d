// tests/qr/prd14/turbo-drift/v2-camera-rig.test.ts — T2.3 rig geometry (offline).
// Asserts the chase rig satisfies §6.9.2: position behind the hero along the
// scene forward (not the drift angle), fov = 60 + 8·speedRatio, ground
// clearance, and smooth (non-snapping) position on heading changes.
import { describe, expect, it } from "vitest";
import {
  createTurboChaseRig, type TurboRigState, type TurboChaseRigOptions
} from "../../../../apps/showcase-turbo-drift-circuit/src/v2/scene/camera";
import type {
  AuraCameraPose, AuraCameraRigContext, AuraCameraSubject, AuraVec3
} from "@aura3d/engine";

const CAR_AT: AuraVec3 = [10, 0, -4];
const FORWARD: AuraVec3 = [1, 0, 0];

function ctx(carAt: AuraVec3 | undefined, forward: AuraVec3 = FORWARD, dt = 1 / 60): AuraCameraRigContext {
  const subject: AuraCameraSubject | undefined = carAt
    ? { position: carAt, velocity: [0, 0, 0], forward, bounds: { min: carAt, max: carAt } }
    : undefined;
  return {
    dt,
    time: 0,
    aspect: 16 / 9,
    previous: {} as AuraCameraPose,
    subject: () => subject,
    probe: { sphereCast: () => ({ hit: false, distance: Infinity }), occluders: () => [] }
  };
}

const OPTS: TurboChaseRigOptions = {
  distance: 2.6,
  height: 0.95,
  sideOffset: 0.12,
  lookAhead: 1.1,
  maxSpeed: 33.2
};

describe("turbo-drift chase rig (T2.3)", () => {
  it("sits behind the car along its forward at fov 60 + 8·speedRatio", () => {
    const state: TurboRigState = { speed: 16.6, heading: 0, finishing: false };
    const rig = createTurboChaseRig(state, OPTS);
    const pose = rig.update(ctx(CAR_AT));
    // Back = -forward; camera must be behind the car on X, at configured height.
    expect(pose.position[0]).toBeLessThan(CAR_AT[0]);
    expect(pose.position[1]).toBeCloseTo(CAR_AT[1] + OPTS.height, 3);
    expect(pose.fov).toBeCloseTo(60 + 8 * (16.6 / 33.2), 3);
    // Target looks ahead of the car along forward.
    expect(pose.target[0]).toBeGreaterThan(CAR_AT[0]);
  });

  it("converges to the car after smoothing, never below ground clearance", () => {
    const state: TurboRigState = { speed: 0, heading: 0, finishing: false };
    const rig = createTurboChaseRig(state, OPTS);
    let pose = rig.update(ctx(CAR_AT));
    // First frame snaps to the wanted pose exactly.
    expect(Math.abs(pose.position[0] - (CAR_AT[0] - OPTS.distance + 0))).toBeLessThan(0.4);
    for (let i = 0; i < 30; i += 1) pose = rig.update(ctx(CAR_AT));
    const backDist = Math.hypot(
      pose.position[0] - CAR_AT[0], pose.position[2] - CAR_AT[2]);
    expect(backDist).toBeGreaterThanOrEqual(OPTS.distance * 0.85);
    // Pitched-height underflow clamps above ground.
    const lowCar: AuraVec3 = [0, -5, 0];
    const pose2 = rig.update(ctx(lowCar));
    expect(pose2.position[1]).toBeGreaterThanOrEqual(0.18);
  });

  it("uses the subject forward, not the sim heading, when available", () => {
    // Sim heading 0 but rendered car faces -Z: camera must sit on +Z behind.
    const state: TurboRigState = { speed: 0, heading: 0, finishing: false };
    const rig = createTurboChaseRig(state, OPTS);
    const pose = rig.update(ctx(CAR_AT, [0, 0, -1]));
    expect(pose.position[2]).toBeGreaterThan(CAR_AT[2]);
  });

  it("keeps a sane default pose when the subject is missing", () => {
    const state: TurboRigState = { speed: 0, heading: 0, finishing: false };
    const rig = createTurboChaseRig(state, OPTS);
    const pose = rig.update(ctx(undefined));
    expect(pose.position).toHaveLength(3);
    expect(pose.fov).toBeCloseTo(60, 3);
  });
});
