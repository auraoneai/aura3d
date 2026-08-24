import { describe, expect, it } from "vitest";
import { createFloorWorld, FLOOR_LAYOUTS, GUARD_FOV_DEGREES, GUARD_RANGE, THIEF_RADIUS } from "../../../apps/showcase-gallery-shift/src/floor";
import {
  ALERT_THRESHOLD,
  CAUGHT_THRESHOLD,
  CAMERA_HALF_FOV,
  DETECTION_DRAIN_PER_SECOND,
  DETECTION_SUSTAIN_SECONDS,
  GUARD_HALF_FOV,
  SUSPICIOUS_THRESHOLD,
  advanceDetection,
  brightnessAt,
  cameraFacesPoint,
  cameraYawAt,
  distanceFactor,
  guardFillPerSecond,
  cameraFillPerSecond,
  insideCone,
  lightFactor,
  lineOfSight,
  normalizeAngle,
  sampleVision,
  worldRaycast
} from "../../../apps/showcase-gallery-shift/src/vision";

/**
 * PRD definition-of-done pins for the Gallery Shift vision system (GS-13):
 * - FOV cone geometry admits targets inside 90/2 degrees and rejects outside;
 * - LOS through the public physics raycast: walls/cases occlude, open hall does not;
 * - detection fill scales with distance + light-pool brightness, alert fills 3x;
 * - the meter drains after a sustain grace when unseen;
 * - camera sweeps follow the authored deterministic window.
 */

describe("gallery shift FOV cone geometry", () => {
  it("guards use a 90 degree cone with 12 m range", () => {
    expect(GUARD_FOV_DEGREES).toBe(90);
    expect(GUARD_RANGE).toBe(12);
    expect(GUARD_HALF_FOV).toBeCloseTo(Math.PI / 4, 12);
    expect(CAMERA_HALF_FOV).toBeCloseTo(Math.PI / 6, 12);
  });

  it("admits a target dead ahead and near the cone edge, rejects outside", () => {
    // Guard at origin facing +Z (yaw 0).
    expect(insideCone(0, 0, 0, 0, 6, GUARD_HALF_FOV, GUARD_RANGE)).toBe(true);
    // 40 degrees off-axis is inside a 45-degree half-FOV.
    const x40 = Math.sin((40 * Math.PI) / 180) * 6;
    const z40 = Math.cos((40 * Math.PI) / 180) * 6;
    expect(insideCone(0, 0, 0, x40, z40, GUARD_HALF_FOV, GUARD_RANGE)).toBe(true);
    // 50 degrees off-axis is outside.
    const x50 = Math.sin((50 * Math.PI) / 180) * 6;
    const z50 = Math.cos((50 * Math.PI) / 180) * 6;
    expect(insideCone(0, 0, 0, x50, z50, GUARD_HALF_FOV, GUARD_RANGE)).toBe(false);
    // Behind the guard is always outside.
    expect(insideCone(0, 0, 0, 0, -6, GUARD_HALF_FOV, GUARD_RANGE)).toBe(false);
  });

  it("rejects targets beyond the cone range", () => {
    expect(insideCone(0, 0, 0, 0, GUARD_RANGE + 0.5, GUARD_HALF_FOV, GUARD_RANGE)).toBe(false);
    expect(insideCone(0, 0, 0, 0, GUARD_RANGE - 0.5, GUARD_HALF_FOV, GUARD_RANGE)).toBe(true);
  });

  it("normalizes wrapped angles across the +/-pi seam", () => {
    // Guard facing -Z (yaw pi) sees a target behind the yaw-0 guard.
    expect(insideCone(0, 0, Math.PI, 0, -6, GUARD_HALF_FOV, GUARD_RANGE)).toBe(true);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 12);
    // Both seam representations are equivalent half-turns.
    expect(Math.abs(Math.abs(normalizeAngle(-3 * Math.PI)) - Math.PI)).toBeLessThan(1e-9);
  });
});

describe("gallery shift LOS occlusion through the physics raycast", () => {
  it("the floor-1 world builds on the rapier backend", () => {
    const floor = createFloorWorld(FLOOR_LAYOUTS[0]!);
    expect(floor.backend()).toBe("rapier");
  });

  it("a wing wall occludes a guard on the other side", () => {
    const floor = createFloorWorld(FLOOR_LAYOUTS[0]!);
    const raycast = worldRaycast(floor.world);
    // Guard west of the wing partition (x = -5, z in [-4, 1.5]) looking east.
    const los = lineOfSight(raycast, -6.5, 1.55, 0, -3.5, 1.1, 0, [floor.thiefBodyId]);
    expect(los.occluded).toBe(true);
    expect(los.hitDistance).not.toBeNull();
  });

  it("an open-hall sightline is not occluded", () => {
    const floor = createFloorWorld(FLOOR_LAYOUTS[0]!);
    const raycast = worldRaycast(floor.world);
    // Spawn corridor to the center rotunda: no wall on the segment.
    const los = lineOfSight(raycast, 0, 1.55, 5.5, 0, 1.1, 0.5, [floor.thiefBodyId]);
    expect(los.occluded).toBe(false);
  });

  it("sampleVision counts rays only for in-cone watchers and reports occlusion", () => {
    const floor = createFloorWorld(FLOOR_LAYOUTS[0]!);
    const raycast = worldRaycast(floor.world);
    const counters = { losRayCount: 0, occlusionCount: 0 };
    // Guard east of the west wing partition facing the thief dead ahead: the
    // open rotunda between x = -4 and x = 0 has no occluder, so the thief is seen.
    const open = sampleVision(raycast, [
      { kind: "guard", id: "guard-1", x: -4, z: 0, eyeY: 1.55, yaw: Math.PI / 2, halfFov: GUARD_HALF_FOV, range: GUARD_RANGE }
    ], 0, 0, 1.1, 0.5, [floor.thiefBodyId], counters, false);
    expect(open.thiefSeen).toBe(true);
    expect(open.losRayCount).toBe(1);
    expect(open.occlusionCount).toBe(0);
    expect(open.totalFillPerSecond).toBeGreaterThan(0);

    // Same geometry but the thief is behind the wing wall: occluded, zero fill.
    const blocked = sampleVision(raycast, [
      { kind: "guard", id: "guard-1", x: -6.5, z: 0, eyeY: 1.55, yaw: Math.PI / 2, halfFov: GUARD_HALF_FOV, range: GUARD_RANGE }
    ], 2.5, 0, 1.1, 0.5, [floor.thiefBodyId], counters, false);
    // The wing wall (x = -5) sits between x = -6.5 and x = 2.5 at z = 0.
    expect(blocked.thiefSeen).toBe(false);
    expect(blocked.losRayCount).toBe(1);
    expect(blocked.occlusionCount).toBe(1);
    expect(blocked.totalFillPerSecond).toBe(0);
    expect(blocked.anyOccludedCone).toBe(true);

    // A watcher facing away never spends a ray.
    const away = sampleVision(raycast, [
      { kind: "guard", id: "guard-1", x: -6, z: 0, eyeY: 1.55, yaw: -Math.PI / 2, halfFov: GUARD_HALF_FOV, range: GUARD_RANGE }
    ], -2, 0, 1.1, 0.5, [floor.thiefBodyId], counters, false);
    expect(away.thiefSeen).toBe(false);
    expect(away.losRayCount).toBe(0);

    // Counters accumulate across samples (evidence contract).
    expect(counters.losRayCount).toBe(2);
    expect(counters.occlusionCount).toBe(1);
  });

  it("the thief's own collider is ignored for self-sightings", () => {
    const floor = createFloorWorld(FLOOR_LAYOUTS[0]!);
    const raycast = worldRaycast(floor.world);
    // From the spawn toward the center: unobstructed even though the kinematic
    // thief sphere sits exactly at the ray endpoint.
    const los = lineOfSight(raycast, 0, 1.55, 4.5, 0, 1.1, 5.5, [floor.thiefBodyId]);
    expect(los.occluded).toBe(false);
    expect(THIEF_RADIUS).toBe(0.3);
  });
});

describe("gallery shift detection scaling", () => {
  it("distance falloff decays with distance and floors at 0.08", () => {
    expect(distanceFactor(2, GUARD_RANGE)).toBeGreaterThan(distanceFactor(8, GUARD_RANGE));
    expect(distanceFactor(2, GUARD_RANGE)).toBeLessThanOrEqual(1);
    expect(distanceFactor(GUARD_RANGE + 4, GUARD_RANGE)).toBeCloseTo(0.08, 12);
  });

  it("light pools brighten the fill, dark floor keeps a 0.55 factor", () => {
    expect(lightFactor(0)).toBeCloseTo(0.55, 12);
    expect(lightFactor(1)).toBeCloseTo(1, 12);
    expect(guardFillPerSecond(4, 1, false)).toBeGreaterThan(guardFillPerSecond(4, 0, false));
    const pools = FLOOR_LAYOUTS[0]!.lightPools;
    expect(brightnessAt(pools, 0, 0)).toBeCloseTo(0.95, 12);
    expect(brightnessAt(pools, 0, 6.9)).toBe(0);
  });

  it("alert state fills the meter 3x faster, cameras fill slower than guards", () => {
    const calm = guardFillPerSecond(4, 0.8, false);
    const alert = guardFillPerSecond(4, 0.8, true);
    expect(alert).toBeCloseTo(calm * 3, 12);
    expect(cameraFillPerSecond(4, 0.8)).toBeLessThan(calm);
  });

  it("thresholds match the PRD contract", () => {
    expect(SUSPICIOUS_THRESHOLD).toBe(0.35);
    expect(ALERT_THRESHOLD).toBe(0.7);
    expect(CAUGHT_THRESHOLD).toBe(1);
  });
});

describe("gallery shift detection meter fill and drain", () => {
  it("fills at the summed observer rate", () => {
    let state = { value: 0, secondsSinceSeen: 5 };
    for (let index = 0; index < 60; index += 1) {
      state = advanceDetection(state, 0.5, 1 / 60);
    }
    expect(state.value).toBeCloseTo(0.5, 6);
    expect(state.secondsSinceSeen).toBe(0);
  });

  it("holds through the sustain grace, then drains linearly and clamps at zero", () => {
    let state = { value: 0.6, secondsSinceSeen: 0 };
    // Unseen inside the grace window: value frozen.
    for (let index = 0; index < 30; index += 1) {
      state = advanceDetection(state, 0, 1 / 60);
    }
    expect(state.value).toBeCloseTo(0.6, 12);
    expect(state.secondsSinceSeen).toBeCloseTo(0.5, 12);
    expect(state.secondsSinceSeen).toBeLessThan(DETECTION_SUSTAIN_SECONDS);
    // Past the grace: drains at DETECTION_DRAIN_PER_SECOND.
    let drained = state;
    for (let index = 0; index < 60; index += 1) {
      drained = advanceDetection(drained, 0, 1 / 60);
    }
    const expected = Math.max(0, 0.6 - (drained.secondsSinceSeen - DETECTION_SUSTAIN_SECONDS) * DETECTION_DRAIN_PER_SECOND);
    expect(drained.value).toBeCloseTo(expected, 6);
    // Long unseen: clamped at zero.
    let empty = drained;
    for (let index = 0; index < 600; index += 1) {
      empty = advanceDetection(empty, 0, 1 / 60);
    }
    expect(empty.value).toBe(0);
  });

  it("full meter in about a second of close bright exposure", () => {
    // ~0.4 fill/second close and bright: caught near 2.5 s of continuous sight.
    let state = { value: 0, secondsSinceSeen: 0 };
    const fill = guardFillPerSecond(2, 0.95, false);
    let frames = 0;
    while (state.value < 1 && frames < 600) {
      state = advanceDetection(state, fill, 1 / 60);
      frames += 1;
    }
    expect(state.value).toBe(1);
    expect(frames / 60).toBeLessThan(4);
  });
});

describe("gallery shift camera sweeps", () => {
  const camera = FLOOR_LAYOUTS[1]!.cameras[0]!;

  it("sweeps deterministically around the center yaw", () => {
    expect(cameraYawAt(camera, 0)).toBeCloseTo(camera.centerYaw, 12);
    expect(cameraYawAt(camera, camera.periodSeconds)).toBeCloseTo(camera.centerYaw, 12);
    const quarter = cameraYawAt(camera, camera.periodSeconds / 4);
    expect(Math.abs(quarter - camera.centerYaw)).toBeCloseTo(camera.amplitudeRad, 9);
  });

  it("the sweep window admits the hall center and excludes behind the camera", () => {
    // camera-1 sits at (-4.6, -2.6) facing +x/+z: the hall center enters its cone.
    expect(cameraFacesPoint(camera, 0, 0, 0)).toBe(true);
    // A point well behind (further -x/-z) never enters the 60-degree cone.
    expect(cameraFacesPoint(camera, 0, -9.5, -6)).toBe(false);
  });

  it("identical inputs give identical sweep yaws (determinism)", () => {
    const a = [0, 1.375, 2.75, 4.125, 5.5].map((t) => cameraYawAt(camera, t));
    const b = [0, 1.375, 2.75, 4.125, 5.5].map((t) => cameraYawAt(camera, t));
    expect(a).toEqual(b);
  });
});
