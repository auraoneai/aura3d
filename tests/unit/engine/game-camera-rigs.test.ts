import { describe, expect, it } from "vitest";
import {
  createCollisionAwareOrbit,
  createFollowRig,
  createGameCameraRig,
  createPunchIn,
  createShoulderCamera,
  createTraumaShake,
  FOLLOW_DAMPING_CONTRACT,
  gameCameraRigs
} from "../../../packages/engine/src/agent-api/GameCameraRigs";

describe("shoulder camera", () => {
  it("frames over the right shoulder by default and tracks the target", () => {
    const rig = createShoulderCamera();
    const snap = rig.update(1, { position: [0, 1, 0], facing: 0 });
    expect(snap.kind).toBe("aura-game-shoulder-camera");
    // Facing -Z: eye sits behind (+Z) and right (+X) of the target.
    expect(snap.position[0]).toBeGreaterThan(0);
    expect(snap.position[2]).toBeGreaterThan(0);
    expect(snap.target[2]).toBeLessThan(0);
    expect(snap.fov).toBe(55);
  });

  it("mirrors to the left shoulder and rejects bad input by API name", () => {
    const rig = createShoulderCamera({ side: "left" });
    const snap = rig.update(1, { position: [0, 1, 0], facing: 0 });
    expect(snap.position[0]).toBeLessThan(0);
    expect(() => rig.update(Number.NaN, { position: [0, 1, 0] })).toThrow("camera.shoulder dt");
    expect(() => rig.update(0.016, { position: [0, 1, Number.NaN] })).toThrow("camera.shoulder target.position");
  });
});

describe("collision-aware orbit", () => {
  it("slides on walls instead of clipping and reports evidence", () => {
    const orbit = createCollisionAwareOrbit({ distance: 5, probeRadius: 0.3 });
    // Wall plane 2 units behind the target along +Z.
    const free = orbit.update(1, undefined);
    expect(free.clipped).toBe(false);
    expect(free.position[2]).toBeCloseTo(5 * Math.sin(1.05) * Math.cos(0.6), 5);

    const wall = orbit.update(1, () => ({ distance: 2 }));
    expect(wall.clipped).toBe(true);
    // Camera stops probeRadius short of the wall: clearance = 1.7 from target.
    expect(wall.clearance).toBeCloseTo(1.7, 5);
    const wallDist = Math.hypot(
      wall.position[0] - wall.target[0],
      wall.position[1] - wall.target[1],
      wall.position[2] - wall.target[2]
    );
    expect(wallDist).toBeLessThanOrEqual(1.71);
  });

  it("never teleports: pull-in is fast but release is gradual", () => {
    const orbit = createCollisionAwareOrbit({ distance: 5, probeRadius: 0.3 });
    orbit.update(1, undefined);
    const pinned = orbit.update(1 / 60, () => ({ distance: 2 }));
    const pinnedDist = Math.hypot(pinned.position[0], pinned.position[1] - 1, pinned.position[2]);
    expect(pinnedDist).toBeLessThan(5);
    // Wall clears: one frame must not snap all the way back out.
    const released = orbit.update(1 / 60, undefined);
    const releasedDist = Math.hypot(released.position[0], released.position[1] - 1, released.position[2]);
    expect(releasedDist - pinnedDist).toBeLessThan(1);
    expect(released.clipped).toBe(false);
  });
});

describe("trauma shake", () => {
  it("decays to zero energy and is deterministic", () => {
    const a = createTraumaShake({ decay: 1 });
    const b = createTraumaShake({ decay: 1 });
    a.addTrauma(1);
    b.addTrauma(1);
    const firstA = a.update(0.1);
    const firstB = b.update(0.1);
    expect(firstA.offset).toEqual(firstB.offset);
    expect(firstA.energy).toBeCloseTo(0.81, 5);
    a.update(1);
    expect(a.snapshot().energy).toBe(0);
    expect(a.snapshot().offset).toEqual([0, 0, 0]);
  });

  it("stacks trauma up to the 1.0 cap", () => {
    const shake = createTraumaShake();
    shake.addTrauma(0.7);
    shake.addTrauma(0.7);
    expect(shake.snapshot().trauma).toBe(1);
    expect(() => shake.addTrauma(-1)).toThrow("camera.shake trauma amount");
  });
});

describe("punch-in", () => {
  it("kicks fov/distance on hit and relaxes over its frames", () => {
    const punch = createPunchIn({ fovKick: 7, duration: 0.32 });
    expect(punch.snapshot().active).toBe(false);
    punch.punch();
    const peak = punch.update(0.03);
    expect(peak.active).toBe(true);
    expect(peak.fovOffset).toBeLessThan(0);
    expect(peak.distanceOffset).toBeLessThan(0);
    const done = punch.update(1);
    expect(done.active).toBe(false);
    expect(done.fovOffset).toBe(0);
    expect(() => punch.punch(2)).toThrow("camera.punchIn strength");
  });
});

describe("follow rig (N2 unification)", () => {
  it("eases toward target+offset and converts to input-adapter options", () => {
    const rig = createFollowRig({ offset: [0, 2, 6], damping: 12 });
    expect(FOLLOW_DAMPING_CONTRACT).toBe("offset-plus-exponential-damping-v1");
    const snap = rig.update(10, { position: [4, 0, -2] });
    expect(snap.position[0]).toBeCloseTo(4, 4);
    expect(snap.position[1]).toBeCloseTo(2, 4);
    expect(snap.position[2]).toBeCloseTo(4, 4);
    expect(snap.target).toEqual([4, 0, -2]);
    expect(rig.asInputOptions()).toEqual({ offset: { x: 0, y: 2, z: 6 }, damping: 12 });
  });
});

describe("game camera rig aggregator", () => {
  it("publishes per-frame evidence combining base, shake, and punch", () => {
    const rig = createGameCameraRig({ base: "shoulder" });
    rig.trauma.addTrauma(0.5);
    rig.punchIn.punch(1);
    const { snapshot, evidence } = rig.update(0.05, { position: [1, 1, 0], facing: 0.3 });
    expect(snapshot.kind).toBe("aura-game-camera-rig");
    expect(evidence.kind).toBe("aura-game-camera-evidence");
    expect(evidence.shakeEnergy).toBeGreaterThan(0);
    expect(evidence.trauma).toBeGreaterThan(0);
    expect(evidence.punchActive).toBe(true);
    expect(evidence.clipped).toBe(false);
    expect(evidence.position).toEqual(snapshot.position);
    expect(evidence.fov).toBe(snapshot.fov);
  });

  it("collision-orbit base reports wall clipping through the aggregator", () => {
    const rig = createGameCameraRig({ base: "collision-orbit" });
    const { evidence } = rig.update(0.5, { position: [0, 1, 0] }, () => ({ distance: 1.2 }));
    expect(evidence.clipped).toBe(true);
    expect(evidence.clearance).toBeLessThan(1.2);
  });

  it("exposes the exact root-bridge surface", () => {
    expect(Object.keys(gameCameraRigs).sort()).toEqual(
      ["collisionAwareOrbit", "followRig", "gameRig", "punchIn", "shake", "shoulder"].sort()
    );
  });
});
