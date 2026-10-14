import { describe, expect, it } from "vitest";

import {
  createTrafficSimulation,
  fractionOfNearestPoint,
  laneLoopRoute,
  LANE_LOOPS,
  TRAFFIC_CAR_COUNT
} from "../../../apps/showcase-courier-rush/src/traffic";
import { STREET_SEGMENTS } from "../../../apps/showcase-courier-rush/src/city";

const DT = 1 / 60;

function stepMany(
  sim: ReturnType<typeof createTrafficSimulation>,
  seconds: number,
  van: { x: number; z: number } = { x: 9999, z: 9999 }
) {
  const steps = Math.round(seconds / DT);
  for (let index = 0; index < steps; index += 1) sim.step(DT, van.x, van.z);
}

describe("courier rush traffic", () => {
  it("runs eight cars on loops whose edges are real street segments", () => {
    const sim = createTrafficSimulation({ seed: 20260821 });
    expect(sim.carCount).toBe(TRAFFIC_CAR_COUNT);
    expect(sim.cars()).toHaveLength(TRAFFIC_CAR_COUNT);

    // Every loop waypoint pair lies on (or within a lane of) a street segment.
    for (const loop of LANE_LOOPS) {
      expect(loop.points.length).toBeGreaterThanOrEqual(4);
      for (let index = 0; index < loop.points.length; index += 1) {
        const a = loop.points[index]!;
        const b = loop.points[(index + 1) % loop.points.length]!;
        // The edge must align with an axis-aligned street segment. Corners may
        // extend a lane past the shortened drivable span, so the span check
        // carries a small tolerance.
        const tolerance = 2.2;
        const aligned = STREET_SEGMENTS.some((segment) => {
          const horizontal = Math.abs(a.z - segment.az) < 0.05 && Math.abs(b.z - segment.bz) < 0.05;
          const vertical = Math.abs(a.x - segment.ax) < 0.05 && Math.abs(b.x - segment.bx) < 0.05;
          const withinX = Math.min(a.x, b.x) >= Math.min(segment.ax, segment.bx) - tolerance
            && Math.max(a.x, b.x) <= Math.max(segment.ax, segment.bx) + tolerance;
          const withinZ = Math.min(a.z, b.z) >= Math.min(segment.az, segment.bz) - tolerance
            && Math.max(a.z, b.z) <= Math.max(segment.bz, segment.bz) + tolerance;
          return (horizontal && withinX) || (vertical && withinZ);
        });
        expect(aligned, "edge " + index + " of loop " + loop.id + " is off-street").toBe(true);
      }
      // Route adapter exposes a positive finite length for the driver AI.
      const route = laneLoopRoute(loop);
      expect(Number.isFinite(route.length)).toBe(true);
      expect(route.length).toBeGreaterThan(10);
    }
  });

  it("produces identical laps for the same seed and different lanes per seed", () => {
    const runSim = () => {
      const sim = createTrafficSimulation({ seed: 777 });
      stepMany(sim, 6);
      return sim.cars().map((car) => ({ id: car.id, x: car.x, z: car.z, progress: car.progress }));
    };
    const first = runSim();
    const second = runSim();
    expect(second).toEqual(first);
    expect(first.every((car) => Number.isFinite(car.x) && Number.isFinite(car.z))).toBe(true);

    // A different seed changes line variation, so positions differ.
    const otherSeed = createTrafficSimulation({ seed: 778 });
    stepMany(otherSeed, 6);
    const other = otherSeed.cars().map((car) => ({ id: car.id, x: car.x, z: car.z, progress: car.progress }));
    const differing = other.filter((car, index) => {
      const same = first[index]!;
      return Math.hypot(car.x - same.x, car.z - same.z) > 0.0005 || Math.abs(car.progress - same.progress) > 0.0005;
    });
    expect(differing.length).toBeGreaterThan(0);
  });

  it("moves cars along their loop over time", () => {
    const sim = createTrafficSimulation({ seed: 42 });
    const before = sim.cars().map((car) => ({ id: car.id, x: car.x, z: car.z, speed: car.speed }));
    stepMany(sim, 3);
    const after = sim.cars();
    let moved = 0;
    for (let index = 0; index < after.length; index += 1) {
      const a = before[index]!;
      const b = after[index]!;
      const distance = Math.hypot(b.x - a.x, b.z - a.z);
      if (distance > 0.05) moved += 1;
      expect(b.speed).toBeGreaterThanOrEqual(0);
    }
    // With staggered starts and driver pacing, most of the fleet is rolling.
    expect(moved).toBeGreaterThanOrEqual(TRAFFIC_CAR_COUNT - 1);
  });

  it("fires courtesy stops at the authored stop windows", () => {
    const sim = createTrafficSimulation({ seed: 99 });
    // Long enough for every loop to reach its stop window at least once:
    // the outer loop is ~135 units around at roughly 6-7 units/second.
    const seenStops = new Map<string, { x: number; z: number }>();
    const steps = Math.round(60 / DT);
    for (let index = 0; index < steps; index += 1) {
      sim.step(DT, 9999, 9999);
      for (const car of sim.cars()) {
        if (car.courtesyStopped && !seenStops.has(car.id)) {
          seenStops.set(car.id, { x: car.x, z: car.z });
        }
      }
    }

    // Every loop demonstrated at least one courtesy hold inside the horizon.
    for (const loop of LANE_LOOPS) {
      const heldCar = [...seenStops.entries()].find(([id]) =>
        sim.cars().some((candidate) => candidate.id === id && candidate.loopId === loop.id)
      );
      expect(heldCar, "loop " + loop.id + " never courtesy-stopped").toBeDefined();
      const [, pose] = heldCar!;
      const distance = Math.hypot(pose.x - loop.courtesyStop.x, pose.z - loop.courtesyStop.z);
      expect(distance).toBeLessThanOrEqual(1.6);
    }
  });

  it("reset restores starting poses deterministically", () => {
    const sim = createTrafficSimulation({ seed: 555 });
    stepMany(sim, 5);
    sim.reset();
    const fresh = createTrafficSimulation({ seed: 555 });
    expect(sim.cars()).toEqual(fresh.cars());
  });

  it("maps nearest-point fractions onto the loop for authored stops", () => {
    const loop = LANE_LOOPS[0]!;
    const fraction = fractionOfNearestPoint(loop.points, loop.courtesyStop.x, loop.courtesyStop.z);
    expect(fraction).toBeGreaterThanOrEqual(0);
    expect(fraction).toBeLessThan(1);
    // The route samples back to the same neighborhood.
    const route = laneLoopRoute(loop);
    const sample = route.sample(fraction);
    expect(Math.hypot(sample.x - loop.courtesyStop.x, sample.y - loop.courtesyStop.z)).toBeLessThan(0.75);
  });
});
