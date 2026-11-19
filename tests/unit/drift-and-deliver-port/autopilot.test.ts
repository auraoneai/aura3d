import { describe, expect, it } from "vitest";
import { createAutopilot, nearestLine, routeWaypoint } from "../../../examples/drift-and-deliver-port/autopilot";
import { buildFurniture, furnitureSolids } from "../../../examples/drift-and-deliver-port/city";
import { createShift, stepShift } from "../../../examples/drift-and-deliver-port/shift";
import { createCar, stepCar, teleport, type Solid } from "../../../examples/drift-and-deliver-port/sim";
import { STREET_LINES, buildBlocks, buildBuildings, buildPickups, buildTraffic, buildingSolids, clearPickups, collectPickups, stepTraffic, tickCombo, trafficContact } from "../../../examples/drift-and-deliver-port/world";

/** Owner standard (Nov 18): `?autoplay=1` drives the real sim hands-free and makes progress. */
const FOOT = { halfW: 0.9954000015020373, halfD: 2.14200003592372 };
const STEP = 1 / 60;

describe("Gridlock Courier autopilot", () => {
  it("routes along the street grid: straight on the target's street, else via one intersection", () => {
    expect(nearestLine(31)).toBe(30);
    expect(nearestLine(-89)).toBe(-90);
    // on street x = 30 heading for a drop-off on the same street
    expect(routeWaypoint({ x: 30, z: -100, heading: 0, speed: 10 }, { x: 30, z: 60 })).toEqual({ x: 30, z: 60, turn: false });
    // drop-off on vertical street x = 150: first to the next row intersection, then across
    const wp = routeWaypoint({ x: 30, z: -100, heading: 0, speed: 10 }, { x: 150, z: 60 });
    expect(wp.turn).toBe(true);
    expect(wp.x).toBe(30);
    expect(Math.abs(wp.z - -90)).toBeLessThan(1e-9);
    expect(routeWaypoint({ x: 30, z: -91, heading: 0, speed: 10 }, { x: 150, z: 60 })).toEqual({ x: 150, z: -90, turn: true });
  });

  it("plays the real sim for 120 s: drives, delivers, collects, never stuck 5 s", () => {
    const blocks = buildBlocks();
    const solids: Solid[] = [...buildingSolids(buildBuildings(blocks)), ...furnitureSolids(buildFurniture(blocks))];
    const near = (x: number, z: number) => solids.filter((s) => Math.abs(s.x - x) < 30 + s.hw && Math.abs(s.z - z) < 30 + s.hd);
    const pickups = buildPickups();
    clearPickups(pickups, solids, 1.5);
    const traffic = buildTraffic();
    const car = createCar();
    const shift = createShift(180);
    const state = { collected: 0, score: 0, combo: 0, comboTimer: 0, boost: car.boost };
    const pilot = createAutopilot();
    let delivered = 0;
    let slow = 0;
    let worstSlow = 0;
    let travelled = 0;
    for (let i = 0; i < 120 * 60; i++) {
      const keys = pilot.step(car, { job: shift.job, pickups, traffic }, STEP);
      const px = car.x, pz = car.z;
      stepCar(car, STEP, keys, i % 6 === 0 ? near(car.x, car.z) : near(car.x, car.z), FOOT);
      travelled += Math.hypot(car.x - px, car.z - pz);
      stepTraffic(traffic, STEP);
      trafficContact(traffic, car);
      state.boost = car.boost;
      collectPickups(pickups, car, state);
      tickCombo(state, STEP);
      for (const e of stepShift(shift, STEP, car, { combo: state.combo, collected: state.collected, total: pickups.length })) if (e.kind === "delivered") delivered++;
      slow = Math.abs(car.speed) < 2 ? slow + STEP : 0;
      worstSlow = Math.max(worstSlow, slow);
      if (process.env.AP_TRACE && i % 60 === 0) console.log(i / 60, car.x.toFixed(1), car.z.toFixed(1), car.heading.toFixed(2), car.speed.toFixed(1), JSON.stringify(keys), shift.job ? `${shift.job.x},${shift.job.z}` : "-", delivered);
    }
    expect(travelled).toBeGreaterThan(1500);
    expect(delivered).toBeGreaterThanOrEqual(2);
    expect(state.collected).toBeGreaterThan(0);
    expect(worstSlow).toBeLessThan(5);
  });
});

describe("Gridlock Courier pass-through (owner QA Nov 18)", () => {
  it("the drop-off kiosk is a solid matching its 1.82 x 0.82 m footprint on both street axes, and a car cannot drive through it", async () => {
    const { kioskSolid, dropoffKioskPose } = await import("../../../examples/drift-and-deliver-port/art/proceduralModels");
    const { NO_KEYS, teleport } = await import("../../../examples/drift-and-deliver-port/sim");
    expect(kioskSolid(null)).toBeNull();
    for (const job of [{ x: 30, z: 60 }, { x: 60, z: 30 }]) {
      const k = kioskSolid(job)!;
      const pose = dropoffKioskPose(job);
      expect([k.x, k.z]).toEqual([pose.x, pose.z]);
      expect(Math.max(k.hw, k.hd) * 2).toBeCloseTo(1.82, 6);
      expect(Math.min(k.hw, k.hd) * 2).toBeCloseTo(0.82, 6);
    }
    // drive along the curb line straight at the kiosk of a job on avenue x = 30: the car stops short of it
    const k = kioskSolid({ x: 30, z: 60 })!;
    const car = createCar();
    teleport(car, k.x, k.z - 30, 0);
    for (let i = 0; i < 240; i++) stepCar(car, STEP, { ...NO_KEYS, w: true }, [k], FOOT);
    expect(car.z).toBeLessThan(k.z);
  });
});

describe("Gridlock Courier autopilot full-run QA (Nov 18)", () => {
  const blocks = buildBlocks();
  const solids: Solid[] = [...buildingSolids(buildBuildings(blocks)), ...furnitureSolids(buildFurniture(blocks))];
  const grid = new Map<string, Solid[]>();
  for (const so of solids)
    for (let gx = Math.floor((so.x - so.hw - 30) / 30); gx <= Math.floor((so.x + so.hw + 30) / 30); gx++)
      for (let gz = Math.floor((so.z - so.hd - 30) / 30); gz <= Math.floor((so.z + so.hd + 30) / 30); gz++) {
        const k = `${gx},${gz}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(so);
      }
  const near = (x: number, z: number) => grid.get(`${Math.floor(x / 30)},${Math.floor(z / 30)}`) ?? [];
  /** Seconds the autopilot needs from `from` (heading `h`) to the drop-off `to`, or Infinity past `limit`. */
  const reach = (from: { x: number; z: number }, h: number, to: { x: number; z: number }, limit = 50): number => {
    const car = createCar();
    teleport(car, from.x, from.z, h);
    const traffic = buildTraffic();
    const pilot = createAutopilot();
    for (let t = 0; t < limit; t += STEP) {
      stepCar(car, STEP, pilot.step(car, { job: to, pickups: [], traffic }, STEP), near(car.x, car.z), FOOT);
      stepTraffic(traffic, STEP);
      trafficContact(traffic, car);
      if (Math.hypot(car.x - to.x, car.z - to.z) < 6) return t;
    }
    return Infinity;
  };

  it("does not circle a block when the drop-off is level with the car (the live run lost ticket 10 that way)", () => {
    // on avenue x = -330 at z = 0, drop-off on avenue x = -90 at the same z: the old cross-street choice flipped every
    // time the car crossed z = 0
    expect(reach({ x: -330, z: 0 }, Math.PI / 2, { x: -90, z: 0 })).toBeLessThan(30);
    expect(reach({ x: 0, z: -330 }, 0, { x: 0, z: -90 })).toBeLessThan(30);
    expect(reach({ x: -330, z: 0 }, 0, { x: -90, z: 0 })).toBeLessThan(30);
  });

  it("reaches sampled drop-offs 120-260 m away from a mid-block stop within the 50 s ticket (>= 96%)", () => {
    const points: { x: number; z: number }[] = [];
    for (const line of STREET_LINES) {
      if (Math.abs(line) > 420) continue;
      for (let j = -7; j <= 7; j++) points.push({ x: line, z: j * 60 }, { x: j * 60, z: line });
    }
    let n = 0, tried = 0, failed = 0;
    for (const from of points)
      for (const to of points) {
        const d = Math.hypot(to.x - from.x, to.z - from.z);
        if (d < 120 || d > 260 || n++ % 53 !== 0) continue;
        tried++;
        const h = (STREET_LINES.includes(from.x) ? 0 : Math.PI / 2) + (n % 2 ? Math.PI : 0);
        if (!Number.isFinite(reach(from, h, to))) failed++;
      }
    expect(tried).toBeGreaterThan(400);
    expect(failed / tried).toBeLessThan(0.04);
  }, 300_000);
});
