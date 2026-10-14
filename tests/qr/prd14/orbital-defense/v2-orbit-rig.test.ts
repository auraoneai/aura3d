// tests/qr/prd14/orbital-defense/v2-orbit-rig.test.ts — T2.3 rig contract.
import { describe, expect, it } from "vitest";
import { createOrbitalRig } from "../../../../apps/showcase-orbital-defense/src/v2/scene/camera";
import { PLANET_RADIUS } from "../../../../apps/showcase-orbital-defense/src/v2/scene/world";
import type { AuraCameraRigContext } from "@aura3d/engine";

function ctx(time: number): AuraCameraRigContext {
  return {
    dt: 1 / 60,
    time,
    aspect: 16 / 9,
    previous: {
      position: [0, -8, 4.5], target: [0, 0, 0], up: [0, 1, 0], roll: 0,
      fov: 42, near: 0.05, far: 120
    },
    subject: () => undefined,
    probe: {
      sphereCast: () => ({ hit: false, distance: 0 }),
      occluders: () => []
    }
  } as AuraCameraRigContext;
}

describe("orbital-defense.orbit rig", () => {
  it("sits 30° above the orbital plane at planet-framing distance", () => {
    const rig = createOrbitalRig();
    const pose = rig.update(ctx(0));
    const expectedDistance = (PLANET_RADIUS * 2 * 1.08) / (2 * Math.tan((21 * Math.PI) / 180) * 0.7);
    const horizontal = Math.hypot(pose.position[0], pose.position[1]);
    const elevationDeg = Math.atan2(pose.position[2], horizontal) * (180 / Math.PI);
    expect(pose.fov).toBe(42);
    expect(elevationDeg).toBeGreaterThanOrEqual(25);
    expect(elevationDeg).toBeLessThanOrEqual(35);
    expect(horizontal).toBeCloseTo(expectedDistance * Math.cos(30 * Math.PI / 180), 2);
    expect(pose.target).toEqual([0, 0, 0.35]);
  });

  it("drifts 0.5°/s around the planet", () => {
    const rig = createOrbitalRig();
    const a = rig.update(ctx(0));
    const b = rig.update(ctx(10));
    const azA = Math.atan2(a.position[1], a.position[0]);
    const azB = Math.atan2(b.position[1], b.position[0]);
    let delta = azB - azA;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    expect(delta).toBeCloseTo((0.5 * 10) * Math.PI / 180, 3);
  });

  it("respects custom fraction/fov/elevation options", () => {
    const rig = createOrbitalRig({ subjectHeightFraction: 0.65, fovDeg: 35, elevationDeg: 25 });
    const pose = rig.update(ctx(0));
    const expectedDistance = (PLANET_RADIUS * 2 * 1.08) / (2 * Math.tan((35 / 2) * Math.PI / 180) * 0.65);
    expect(pose.fov).toBe(35);
    expect(Math.hypot(pose.position[0], pose.position[1], pose.position[2])).toBeCloseTo(expectedDistance, 2);
  });
});
