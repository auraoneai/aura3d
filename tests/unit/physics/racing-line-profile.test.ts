import { describe, expect, it } from "vitest";
import { createRacingLineProfile, type RacingLineStation } from "../../../packages/physics/src/RacingLineProfile";
import { gameGeometryContract as TURBO_DRIFT_GAME_GEOMETRY } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";

/**
 * WS-3.8's blocker, stated as a test.
 *
 * The PRD records two reverted attempts at putting the racing kit on the force model, both
 * diagnosed as "a certified route encodes a kinematic contract". These tests show the narrower
 * truth: the contract that is impossible is *constant speed*, not the route, and a grip-limited
 * profile satisfies the same certified average within a real tyre's capability.
 */

function stationsFromRoute(): { stations: RacingLineStation[]; length: number } {
  const points = TURBO_DRIFT_GAME_GEOMETRY.route.points;
  const count = points.length;
  const stations: RacingLineStation[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const previous = points[(index - 1 + count) % count];
    const here = points[index];
    const next = points[(index + 1) % count];
    // Circumradius of the three consecutive points, which is the discrete curvature of a polyline.
    const ab = Math.hypot(here.x - previous.x, here.y - previous.y);
    const bc = Math.hypot(next.x - here.x, next.y - here.y);
    const ca = Math.hypot(previous.x - next.x, previous.y - next.y);
    const area = Math.abs((here.x - previous.x) * (next.y - previous.y) - (next.x - previous.x) * (here.y - previous.y)) / 2;
    const radius = area < 1e-9 ? Number.POSITIVE_INFINITY : (ab * bc * ca) / (4 * area);
    stations.push({ distance: cursor, radius });
    cursor += bc;
  }
  return { stations, length: cursor };
}

const CERTIFIED_SPEED = TURBO_DRIFT_GAME_GEOMETRY.speedModel.gameUnitsPerSecond;
const PACE = 4;
const GAMEPLAY_SPEED = CERTIFIED_SPEED * PACE;

describe("racing line profile against the certified circuit", () => {
  const { stations, length } = stationsFromRoute();

  it("measures the same route length the route certifies", () => {
    expect(length).toBeCloseTo(TURBO_DRIFT_GAME_GEOMETRY.speedModel.routeLength, 1);
  });

  it("shows constant-speed certification is the thing that is physically impossible", () => {
    // This is the number that blocked WS-3.8 twice. It is a property of the geometry and the
    // constant-speed assumption alone -- no controller, no integrator, no sign convention.
    const tightest = stations.reduce((min, s) => Math.min(min, s.radius), Number.POSITIVE_INFINITY);
    expect(tightest).toBeLessThan(1);
    const demand = (GAMEPLAY_SPEED * GAMEPLAY_SPEED) / tightest;
    expect(demand).toBeGreaterThan(20);
    // Over 2 g in route units. A sport tyre peaks near 1.
    expect(demand / 9.81).toBeGreaterThan(2);
  });

  it("produces a drivable profile at a physically ordinary grip limit", () => {
    const lateralLimit = 4;
    const profile = createRacingLineProfile({
      stations,
      length,
      lateralLimit,
      acceleration: lateralLimit * 0.6,
      braking: lateralLimit * 0.9,
      maxSpeed: GAMEPLAY_SPEED
    });
    // The whole point: nothing in the profile asks the tyre for more than it has.
    expect(profile.peakLateralDemand).toBeLessThanOrEqual(lateralLimit + 1e-6);
    // Under half a g. The constant-speed request was over two.
    expect(profile.peakLateralDemand / 9.81).toBeLessThan(0.5);
    // It slows for corners and uses the straights, rather than holding one speed.
    expect(profile.minSpeed).toBeLessThan(GAMEPLAY_SPEED * 0.5);
    expect(profile.maxSpeed).toBeCloseTo(GAMEPLAY_SPEED, 3);
  });

  it("keeps a four-lap race inside the 30-60 second category window", () => {
    const lateralLimit = 4;
    const profile = createRacingLineProfile({
      stations,
      length,
      lateralLimit,
      acceleration: lateralLimit * 0.6,
      braking: lateralLimit * 0.9,
      maxSpeed: GAMEPLAY_SPEED
    });
    const fourLaps = profile.lapSeconds * 4;
    expect(fourLaps).toBeGreaterThanOrEqual(30);
    expect(fourLaps).toBeLessThanOrEqual(60);
  });

  it("raises corner speeds when grip rises, and lowers them when it falls", () => {
    const build = (lateralLimit: number) =>
      createRacingLineProfile({
        stations,
        length,
        lateralLimit,
        acceleration: lateralLimit * 0.6,
        braking: lateralLimit * 0.9,
        maxSpeed: GAMEPLAY_SPEED
      });
    const slippery = build(2);
    const grippy = build(10);
    expect(grippy.minSpeed).toBeGreaterThan(slippery.minSpeed);
    expect(grippy.lapSeconds).toBeLessThan(slippery.lapSeconds);
  });

  it("interpolates speed continuously between stations", () => {
    const profile = createRacingLineProfile({
      stations,
      length,
      lateralLimit: 4,
      acceleration: 2.4,
      braking: 3.6,
      maxSpeed: GAMEPLAY_SPEED
    });
    let previous = profile.speedAt(0);
    for (let distance = 0.05; distance <= length; distance += 0.05) {
      const speed = profile.speedAt(distance);
      expect(Number.isFinite(speed)).toBe(true);
      expect(speed).toBeGreaterThan(0);
      // No discontinuity larger than the acceleration over the step could produce.
      expect(Math.abs(speed - previous)).toBeLessThan(1);
      previous = speed;
    }
    // Closed loop: the profile joins up with itself.
    expect(profile.speedAt(length)).toBeCloseTo(profile.speedAt(0), 6);
  });
});

describe("racing line profile as a general primitive", () => {
  it("returns the straight-line ceiling on a path with no curvature", () => {
    const stations: RacingLineStation[] = [
      { distance: 0, radius: Number.POSITIVE_INFINITY },
      { distance: 10, radius: Number.POSITIVE_INFINITY },
      { distance: 20, radius: Number.POSITIVE_INFINITY }
    ];
    const profile = createRacingLineProfile({
      stations, length: 30, lateralLimit: 8, acceleration: 5, braking: 8, maxSpeed: 12, closed: true
    });
    expect(profile.minSpeed).toBeCloseTo(12, 6);
    expect(profile.peakLateralDemand).toBe(0);
  });

  it("brakes before the corner rather than at it", () => {
    // A long straight into one tight corner. The station before the corner must already be slow.
    const stations: RacingLineStation[] = [
      { distance: 0, radius: Number.POSITIVE_INFINITY },
      { distance: 20, radius: Number.POSITIVE_INFINITY },
      { distance: 30, radius: 2 },
      { distance: 40, radius: Number.POSITIVE_INFINITY }
    ];
    const profile = createRacingLineProfile({
      stations, length: 60, lateralLimit: 8, acceleration: 4, braking: 4, maxSpeed: 30, closed: true
    });
    const cornerSpeed = Math.sqrt(8 * 2);
    expect(profile.speeds[2]).toBeCloseTo(cornerSpeed, 3);
    // Approaching station must be slower than the ceiling, i.e. braking has begun early.
    expect(profile.speeds[1]).toBeLessThan(30);
    // And it must be reachable by braking at 4 u/s^2 over the 10 units to the corner.
    expect(profile.speeds[1]).toBeLessThanOrEqual(Math.sqrt(cornerSpeed * cornerSpeed + 2 * 4 * 10) + 1e-6);
  });

  it("rejects a path too short to profile", () => {
    expect(() => createRacingLineProfile({
      stations: [{ distance: 0, radius: 1 }], length: 1, lateralLimit: 1, acceleration: 1, braking: 1, maxSpeed: 1
    })).toThrow(/at least 2 stations/);
  });
});
