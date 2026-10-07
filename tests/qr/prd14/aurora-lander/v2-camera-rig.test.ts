// tests/qr/prd14/aurora-lander/v2-camera-rig.test.ts — altitude rig (§6.9.12).
import { describe, expect, it } from "vitest";
import {
  auroraPoseFor,
  createAuroraRig,
  pointInRigFrame,
  type AuroraRigState
} from "../../../../apps/showcase-aurora-lander/src/v2/scene/camera";

const ctx = (dt = 1 / 60, time = 0) => ({ dt, time, aspect: 16 / 9 }) as never;

const PAD = { padX: 8, padY: 0.2, padZ: 8 };
const stateAt = (agl: number): AuroraRigState => ({
  x: PAD.padX,
  y: PAD.padY + 0.72 + agl,
  z: PAD.padZ,
  agl,
  ...PAD
});

describe("aurora-lander altitude rig", () => {
  it("reports its rig id inside the [35,50] fov band", () => {
    const rig = createAuroraRig(stateAt(60));
    expect(rig.id).toBe("aurora-lander.altitude");
    const pose = rig.update(ctx());
    expect(pose.fov).toBeGreaterThanOrEqual(35);
    expect(pose.fov).toBeLessThanOrEqual(50);
  });

  it("trails the lander against the aurora curtains while high", () => {
    const state = stateAt(70);
    const pose = auroraPoseFor(state);
    // Target is the lander itself; eye sits behind/above it.
    expect(pose.target[1]).toBeCloseTo(state.y, 1);
    expect(pose.position[2]).toBeGreaterThan(state.z + 15);
    expect(pose.position[1]).toBeGreaterThan(state.y);
  });

  it("keeps the pad inside the rig cone for the whole altitude<30 window", () => {
    const padPoint: [number, number, number] = [PAD.padX, PAD.padY, PAD.padZ];
    for (const agl of [29, 25, 20, 15, 10, 5, 1]) {
      const pose = auroraPoseFor(stateAt(agl));
      expect(pointInRigFrame(pose, padPoint), `pad off-frame at agl ${agl}`).toBe(true);
    }
  });

  it("keeps the lander inside the cone through the same approach", () => {
    for (const agl of [25, 20, 15, 10, 5, 1]) {
      const state = stateAt(agl);
      const pose = auroraPoseFor(state);
      expect(
        pointInRigFrame(pose, [state.x, state.y, state.z]),
        `lander off-frame at agl ${agl}`
      ).toBe(true);
    }
  });

  it("eases between the two framings instead of cutting", () => {
    const state = stateAt(60);
    const rig = createAuroraRig(state);
    rig.reset();
    let pose = rig.update(ctx(1 / 60));
    const firstY = pose.position[1];
    // Drop the lander 30 m between frames — the rig moves toward the approach
    // pose but never teleports in one update.
    state.y -= 30;
    state.agl = 30;
    pose = rig.update(ctx(1 / 60));
    expect(Math.abs(pose.position[1] - firstY)).toBeLessThan(15);
  });

  it("reset re-applies the pure pose for the current state", () => {
    const state = stateAt(20);
    const rig = createAuroraRig(state);
    for (let i = 0; i < 30; i++) rig.update(ctx(1 / 60));
    state.agl = 55;
    state.y += 35;
    rig.reset();
    const want = auroraPoseFor(state);
    const pose = rig.update(ctx(1 / 60));
    expect(pose.position[1]).toBeCloseTo(want.position[1] ?? 0, 0);
  });
});
