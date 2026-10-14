// tests/qr/prd14/bank-shot/v2-camera-rig.test.ts — T2.3 rig geometry (offline).
// Asserts the aim-orbit rig produces poses inside the art-direction contract:
// cue-ball orbit distance 1.1–2.0 m, pitch 18–38°, fov within [35, 50],
// and that `rolling` poses converge to the 3/4 overhead roll camera.
import { describe, expect, it } from "vitest";
import { createBankShotRig, type BankShotRigState } from "../../../../apps/showcase-bank-shot/src/v2/scene/camera";
import type { AuraCameraPose, AuraCameraRigContext, AuraCameraSubject, AuraVec3 } from "@aura3d/engine";

const CUE_AT: AuraVec3 = [-0.7, 0.08, 0];

function ctx(subjectAt: AuraVec3 | undefined, dt = 1 / 60): AuraCameraRigContext {
  const subject: AuraCameraSubject | undefined = subjectAt
    ? { position: subjectAt, velocity: [0, 0, 0], forward: [0, 0, 1], bounds: { min: subjectAt, max: subjectAt } }
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

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

describe("bank-shot aim-orbit rig (T2.3)", () => {
  it("orbits the cue ball behind the aim direction at contract distance and pitch", () => {
    const state: BankShotRigState = { aimAngle: 0.3, rolling: false };
    const rig = createBankShotRig(state);
    const pose = rig.update(ctx(CUE_AT));
    const dx = pose.position[0] - CUE_AT[0];
    const dy = pose.position[1] - CUE_AT[1];
    const dz = pose.position[2] - CUE_AT[2];
    const distance = Math.hypot(dx, dy, dz);
    expect(distance).toBeGreaterThanOrEqual(1.1);
    expect(distance).toBeLessThanOrEqual(2.0);
    const pitch = Math.asin(dy / distance);
    expect(deg(pitch)).toBeGreaterThanOrEqual(18);
    expect(deg(pitch)).toBeLessThanOrEqual(38);
    // Camera sits BEHIND the cue ball relative to the aim direction.
    const yaw = Math.atan2(dz, dx);
    let yawDiff = yaw - (state.aimAngle + Math.PI);
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
    expect(Math.abs(yawDiff)).toBeLessThan(0.01);
    expect(pose.target).toEqual(CUE_AT);
    expect(pose.fov).toBeGreaterThanOrEqual(35);
    expect(pose.fov).toBeLessThanOrEqual(50);
  });

  it("blends toward the 3/4 overhead roll camera while balls roll", () => {
    const state: BankShotRigState = { aimAngle: 0, rolling: true };
    const rig = createBankShotRig(state);
    // After several frames the pose should sit near the overhead position.
    let pose = rig.update(ctx(CUE_AT, 1 / 60));
    for (let i = 0; i < 30; i += 1) pose = rig.update(ctx(CUE_AT, 1 / 60));
    // Overhead: high above the table and pitched down at the play surface.
    expect(pose.position[1]).toBeGreaterThan(1.2);
    expect(pose.position[1]).toBeLessThanOrEqual(2.6);
    expect(pose.fov).toBeGreaterThanOrEqual(35);
    expect(pose.fov).toBeLessThanOrEqual(50);
  });

  it("stays at the aim orbit while not rolling", () => {
    const rig = createBankShotRig({ aimAngle: -0.6, rolling: false });
    const pose = rig.update(ctx(CUE_AT));
    const dy = pose.position[1] - CUE_AT[1];
    expect(dy).toBeLessThan(1.0);
  });

  it("falls back to a default cue position when the subject is missing", () => {
    const rig = createBankShotRig({ aimAngle: 0, rolling: false });
    const pose = rig.update(ctx(undefined));
    expect(Number.isFinite(pose.position[0])).toBe(true);
    expect(pose.fov).toBeGreaterThanOrEqual(35);
    expect(pose.fov).toBeLessThanOrEqual(50);
  });
});
