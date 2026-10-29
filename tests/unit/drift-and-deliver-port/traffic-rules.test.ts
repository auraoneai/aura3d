import { describe, expect, it } from "vitest";
import {
  STREET_LINES,
  buildBlocks,
  buildBuildings,
  buildPickups,
  buildTraffic,
  buildingSolids,
  clearPickups,
  stepTraffic,
  trafficLaneOffset,
  trafficOverlaps
} from "../../../examples/drift-and-deliver-port/world";

/** Audit rows C6 (traffic overlaps), C9 (lane side) and C13 (pickups inside walls). */
describe("traffic follows and yields (C6)", () => {
  it("no two traffic cars overlap over 60 s, in a lane or at a crossing (was 55% of steps)", () => {
    const cars = buildTraffic();
    expect(trafficOverlaps(cars)).toBe(0);
    let overlapping = 0;
    for (let i = 0; i < 3600; i++) {
      stepTraffic(cars, 1 / 60);
      if (trafficOverlaps(cars) > 0) overlapping++;
    }
    expect(overlapping).toBe(0);
  });

  it("stays clear and keeps moving over 20 minutes (no gridlock)", () => {
    const cars = buildTraffic();
    let overlapping = 0;
    let speed = 0;
    let stoppedLast = 0;
    for (let i = 0; i < 72_000; i++) {
      stepTraffic(cars, 1 / 60);
      if (i % 60 === 0 && trafficOverlaps(cars) > 0) overlapping++;
      for (const c of cars) speed += c.v;
    }
    stoppedLast = cars.filter((c) => c.v < 0.01).length;
    expect(overlapping).toBe(0);
    // cruise speeds are 7 to 13 m/s (mean about 10); waiting at crossings costs a little
    expect(speed / 72_000 / cars.length).toBeGreaterThan(8);
    expect(stoppedLast).toBeLessThan(cars.length / 4);
  }, 60_000);

  it("a slower car ahead holds the follower at the follow gap", () => {
    const cars = buildTraffic().slice(0, 2);
    const [a, b] = cars as [(typeof cars)[number], (typeof cars)[number]];
    Object.assign(a, { horiz: true, dir: 1, fixed: 34.2, along: 0, speed: 12, v: 12 });
    Object.assign(b, { horiz: true, dir: 1, fixed: 34.2, along: 8, speed: 6, v: 6 });
    const pair = [a, b];
    let minGap = Infinity;
    for (let i = 0; i < 600; i++) {
      stepTraffic(pair, 1 / 60);
      minGap = Math.min(minGap, b.along - a.along);
    }
    expect(minGap).toBeGreaterThanOrEqual(6 - 1e-9);
    // the faster follower never got past the slower car
    expect(b.along - a.along).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = buildTraffic();
    const b = buildTraffic();
    for (let i = 0; i < 1200; i++) { stepTraffic(a, 1 / 60); stepTraffic(b, 1 / 60); }
    expect(a.map((t) => [t.x, t.z, t.v])).toEqual(b.map((t) => [t.x, t.z, t.v]));
  });
});

describe("traffic keeps right on both street orientations (C9)", () => {
  it("moving +x the car is on the +z side; moving +z it is on the -x side (the driver's right in both)", () => {
    expect(trafficLaneOffset(true, 1)).toBeGreaterThan(0);
    expect(trafficLaneOffset(true, -1)).toBeLessThan(0);
    expect(trafficLaneOffset(false, 1)).toBeLessThan(0);
    expect(trafficLaneOffset(false, -1)).toBeGreaterThan(0);
    for (const t of buildTraffic()) {
      const line = STREET_LINES.reduce((best, l) => (Math.abs(l - t.fixed) < Math.abs(best - t.fixed) ? l : best), STREET_LINES[0]!);
      // the driver's right for heading (sin yaw, cos yaw) on the xz plane with y up is (-cos yaw, sin yaw)
      const right = [-Math.cos(t.yaw), Math.sin(t.yaw)] as const;
      const offset = t.horiz ? [0, t.fixed - line] : [t.fixed - line, 0];
      expect(offset[0]! * right[0] + offset[1]! * right[1]).toBeGreaterThan(4);
    }
  });
});

describe("pickups stand clear of the buildings (C13)", () => {
  it("before the fix two lie inside a wall; after it none is within 1 m of a solid and all stay on the map", () => {
    const solids = buildingSolids(buildBuildings(buildBlocks()));
    const inside = (p: { x: number; z: number }, m: number) => solids.some((s) => Math.abs(p.x - s.x) < s.hw + m && Math.abs(p.z - s.z) < s.hd + m);
    const raw = buildPickups();
    expect(raw.filter((p) => inside(p, 0)).length).toBe(2);
    const fixed = buildPickups();
    expect(clearPickups(fixed, solids, 1.5)).toBeGreaterThanOrEqual(2);
    expect(fixed.filter((p) => inside(p, 1)).length).toBe(0);
    for (const p of fixed) expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(480);
  });
});
