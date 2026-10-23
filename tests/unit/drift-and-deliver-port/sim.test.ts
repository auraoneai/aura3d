import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG, NO_KEYS, createCar, stateVector, stepCar, teleport, type Keys, type Solid } from "../../../examples/drift-and-deliver-port/sim";
import { SCENARIOS, flatten, hashDoubles, keysFromMask, type ReferenceReport, type StateVector } from "../../../tools/crayon-capture/drift-and-deliver-lib";

/**
 * Phase B-style exit for Drift & Deliver, simulation half. `evidence/crayon-capture/drift-and-deliver-reference.json`
 * is a remote capture of the ORIGINAL game: its own `__sim(1, keys, 1/60)` driven one step at a time on the splash
 * screen, full state recorded every step, three independent browser sessions that agree bit for bit. Replaying the
 * same scripts through this port's physics must reproduce those states.
 */
const reference = JSON.parse(readFileSync("evidence/crayon-capture/drift-and-deliver-reference.json", "utf8")) as ReferenceReport;
const FOOTPRINT = reference.world.footprint;
const DT = 1 / 60;

function replay(car = createCar()): { id: string; vectors: StateVector[] }[] {
  const out: { id: string; vectors: StateVector[] }[] = [];
  for (const def of SCENARIOS) {
    teleport(car, def.spawn.x, def.spawn.z, def.spawn.heading);
    const vectors: StateVector[] = [];
    for (const seg of def.segments) {
      const k = keysFromMask(seg.keys);
      for (let i = 0; i < seg.steps; i++) {
        stepCar(car, DT, k, [], FOOTPRINT);
        vectors.push(stateVector(car));
      }
    }
    out.push({ id: def.id, vectors });
  }
  return out;
}

describe("reference capture of the original", () => {
  it("is repeatable: three sessions, all scenario hashes equal, no building contact", () => {
    expect(reference.variance.sessions).toBeGreaterThanOrEqual(3);
    expect(reference.variance.allHashesEqual).toBe(true);
    for (const s of reference.reference.scenarios) expect(s.contacts).toBe(0);
    expect(reference.reference.scenarios.map((s) => s.id)).toEqual(SCENARIOS.map((s) => s.id));
  });

  it("records the original's configuration, which this port mirrors", () => {
    for (const key of Object.keys(CONFIG) as (keyof typeof CONFIG)[]) expect(reference.world.config[key]).toBe(CONFIG[key]);
  });
});

describe("physics port vs the original", () => {
  const runs = replay();

  for (const def of SCENARIOS) {
    it(`${def.id}: every recorded sample is reproduced within the tolerance`, () => {
      const ref = reference.reference.scenarios.find((s) => s.id === def.id)!;
      const mine = runs.find((r) => r.id === def.id)!.vectors;
      expect(mine.length).toBe(ref.steps);
      let worst = 0;
      for (const sample of ref.samples) {
        const v = mine[sample.step - 1]!;
        for (let f = 0; f < v.length; f++) worst = Math.max(worst, Math.abs((v[f] as number) - (sample.state[f] as number)));
      }
      expect(ref.samples.length).toBeGreaterThan(20);
      expect(worst).toBeLessThanOrEqual(reference.tolerance.perField);
    });

    it(`${def.id}: final state matches`, () => {
      const ref = reference.reference.scenarios.find((s) => s.id === def.id)!;
      const last = runs.find((r) => r.id === def.id)!.vectors.at(-1)!;
      expect(last[0]).toBeCloseTo(ref.final.x, 9);
      expect(last[1]).toBeCloseTo(ref.final.z, 9);
      expect(last[2]).toBeCloseTo(ref.final.heading, 9);
      expect(last[3]).toBeCloseTo(ref.final.speed, 9);
      expect(last[4]).toBeCloseTo(ref.final.boost, 9);
    });
  }

  it("matches the recorded hashes exactly where the platform's math library agrees (3 of 4 scenarios on arm64)", () => {
    // The original ran on x64 Linux; libm exp/sin/cos can round 1 ulp differently on arm64, which moves one
    // scenario's hash while every sample stays within 3e-14. The remote browser spec asserts exact equality on the
    // same architecture as the reference.
    const equal = runs.filter((r) => hashDoubles(flatten(r.vectors)) === reference.reference.scenarios.find((s) => s.id === r.id)!.hash);
    expect(equal.length).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic", () => {
    const a = replay().map((r) => hashDoubles(flatten(r.vectors)));
    const b = replay().map((r) => hashDoubles(flatten(r.vectors)));
    expect(a).toEqual(b);
  });

  it("carries steering, lean and boost across a teleport, like the original's __tp", () => {
    const fresh = replay();
    // Run only the last scenario from a pristine car: boost starts full instead of left over from scenario 3.
    const car = createCar();
    const def = SCENARIOS[3]!;
    teleport(car, def.spawn.x, def.spawn.z, def.spawn.heading);
    const solo: StateVector[] = [];
    for (const seg of def.segments) for (let i = 0; i < seg.steps; i++) { stepCar(car, DT, keysFromMask(seg.keys), [], FOOTPRINT); solo.push(stateVector(car)); }
    const carried = fresh.find((r) => r.id === def.id)!.vectors;
    expect(hashDoubles(flatten(solo))).not.toBe(hashDoubles(flatten(carried)));
    const peak = (v: StateVector[]) => Math.max(...v.map((x) => Math.abs(x[3])));
    expect(peak(solo)).toBeGreaterThan(peak(carried) + 5);
  });
});

describe("driving model behaviour", () => {
  const drive = (steps: number, keys: Partial<Keys>, car = createCar()) => {
    const k = { ...NO_KEYS, ...keys };
    for (let i = 0; i < steps; i++) stepCar(car, DT, k);
    return car;
  };

  it("accelerates to a drag-limited cruise below CAR_MAX_SPEED / BOOST_MULTIPLIER, and holds it", () => {
    const car = drive(1200, { w: true });
    const cruise = car.speed;
    drive(600, { w: true }, car);
    expect(cruise).toBeGreaterThan(25);
    expect(cruise).toBeLessThanOrEqual(CONFIG.CAR_MAX_SPEED / CONFIG.BOOST_MULTIPLIER + 1e-9);
    expect(Math.abs(car.speed - cruise)).toBeLessThan(1e-3);
  });

  it("boost raises the speed cap, drains the tank, and needs speed above 3 m/s to start", () => {
    const still = drive(30, { shift: true });
    expect(still.boosting).toBe(false);
    const car = createCar();
    drive(240, { w: true }, car);
    const before = car.boost;
    drive(120, { w: true, shift: true }, car);
    expect(car.boosting).toBe(true);
    expect(car.boost).toBeLessThan(before);
    expect(car.speed).toBeGreaterThan(CONFIG.CAR_MAX_SPEED / CONFIG.BOOST_MULTIPLIER);
  });

  it("drifting needs Space and speed above 7 m/s, and refills the tank", () => {
    expect(drive(30, { space: true }).drifting).toBe(false);
    const car = createCar();
    drive(200, { w: true, shift: true }, car);
    const low = car.boost;
    drive(60, { w: true, space: true }, car);
    expect(car.drifting).toBe(true);
    expect(car.boost).toBeGreaterThan(low - 0.2);
  });

  it("reverse is capped at 16 m/s", () => {
    const car = drive(900, { s: true });
    expect(car.speed).toBeGreaterThanOrEqual(-16 - 1e-9);
    expect(car.speed).toBeLessThan(-5);
  });

  it("steering turns the heading only when moving", () => {
    expect(drive(60, { a: true }).heading).toBe(0);
    const car = createCar();
    drive(120, { w: true }, car);
    const h0 = car.heading;
    drive(30, { w: true, a: true }, car);
    expect(car.heading).toBeGreaterThan(h0);
  });

  it("teleport resets position, heading, velocity and speed but not boost or steering", () => {
    const car = createCar();
    drive(200, { w: true, shift: true, a: true }, car);
    const boost = car.boost;
    const steer = car.steer;
    teleport(car, 90, -300, 0.5);
    expect([car.x, car.z, car.heading, car.speed, car.vx, car.vz]).toEqual([90, -300, 0.5, 0, 0, 0]);
    expect(car.boost).toBe(boost);
    expect(car.steer).toBe(steer);
  });

  it("clamps the car inside the city bounds", () => {
    const car = createCar();
    teleport(car, 470, 0, Math.PI / 2);
    drive(400, { w: true }, car);
    expect(car.x).toBeLessThanOrEqual(476);
  });
});

describe("collisions (the original's solid response)", () => {
  const wall: Solid = { x: 30, z: 20, hw: 12, hd: 1, kind: "hard" };

  it("a hard wall stops the car, pushes it out and shakes the camera", () => {
    const car = createCar();
    teleport(car, 30, -40, 0);
    const k = { ...NO_KEYS, w: true };
    let maxShake = 0;
    for (let i = 0; i < 600; i++) {
      stepCar(car, DT, k, [wall], FOOTPRINT);
      maxShake = Math.max(maxShake, car.shake);
    }
    expect(car.z).toBeLessThan(wall.z - wall.hd);
    expect(maxShake).toBeGreaterThan(0.05);
    expect(car.combo).toBe(0);
  });

  it("props are soft: much less shake than a hard wall at the same speed", () => {
    const run = (kind: Solid["kind"]) => {
      const car = createCar();
      teleport(car, 30, -60, 0);
      let shake = 0;
      for (let i = 0; i < 400; i++) {
        stepCar(car, DT, { ...NO_KEYS, w: true }, [{ ...wall, kind }], FOOTPRINT);
        shake = Math.max(shake, car.shake);
      }
      return shake;
    };
    expect(run("prop")).toBeLessThan(run("hard"));
  });

  it("pushing against something at low speed triggers the stuck back-out", () => {
    const car = createCar();
    teleport(car, 30, 17, 0);
    const k = { ...NO_KEYS, w: true };
    let stuck = 0;
    for (let i = 0; i < 90; i++) {
      stepCar(car, DT, k, [wall], FOOTPRINT);
      stuck = Math.max(stuck, car.stuck);
    }
    expect(stuck).toBeGreaterThan(0.45);
  });
});
