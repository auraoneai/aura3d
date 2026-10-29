import { describe, expect, it } from "vitest";
import { createTrafficContacts } from "../../../apps/showcase-teleoperator/src/collision";
import { KERB_STOP_X, SHIFT_SECONDS, nextStopLineZ } from "../../../apps/showcase-teleoperator/src/rules";
import { NO_INPUT, ROAD_USER_COUNT, createSim, roadUserFootprints, type DriveInput, type Sim, type SimEvent } from "../../../apps/showcase-teleoperator/src/sim";

const DT = 1 / 60;
const make = (level: "MAN" | "L3" | "L4" | "L5" = "MAN"): Sim => createSim(createTrafficContacts(ROAD_USER_COUNT, undefined, { footprints: roadUserFootprints() }), { level });
const run = (sim: Sim, seconds: number, input: Partial<DriveInput> = {}): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) events.push(...sim.step(DT, { ...NO_INPUT, ...input }));
  return events;
};
/** Park every road user far off the avenue so a test sees only the player. */
const clearRoad = (sim: Sim): void => {
  for (const u of sim.state.users) {
    u.laneX = 80;
    u.cruise = 0;
    u.speed = 0;
  }
};

describe("grid dispatch ride state machine (C1)", () => {
  it("an idle manual car rolls past the pickup: no fare, a miss, the beacon respawns ahead", () => {
    const sim = make("MAN");
    clearRoad(sim);
    run(sim, 40);
    expect(sim.state.career.rides).toBe(0);
    expect(sim.state.shift.faresDone).toBe(0);
    expect(sim.state.shift.missed).toBeGreaterThanOrEqual(1);
    expect(sim.state.ride.state).toBe("offer");
  });

  it("stopping in the kerb lane at the beacon boards the passenger and resets comfort", () => {
    const sim = make("MAN");
    clearRoad(sim);
    const s = sim.state;
    s.ride.comfort = 40;
    s.player.x = KERB_STOP_X;
    s.player.z = s.ride.beaconZ + 1;
    s.player.speed = 0;
    run(sim, 0.1, { brake: true });
    expect(s.ride.state).toBe("boarding");
    run(sim, 2, { brake: true });
    expect(s.ride.state).toBe("ride");
    expect(s.ride.comfort).toBe(100);
  });

  it("the same stop in the wrong lane does nothing", () => {
    const sim = make("MAN");
    clearRoad(sim);
    const s = sim.state;
    s.player.x = 3.4;
    s.player.z = s.ride.beaconZ + 1;
    s.player.speed = 0;
    run(sim, 2, { brake: true });
    expect(s.ride.state).toBe("offer");
  });

  it("L5 drives a whole fare and pays by the scoring rules", () => {
    const sim = make("L5");
    clearRoad(sim);
    const events = run(sim, 60);
    const fare = events.find((e) => e.kind === "fare");
    expect(fare).toBeDefined();
    expect(sim.state.career.rides).toBeGreaterThanOrEqual(1);
    if (fare?.kind === "fare") {
      expect(fare.outcome.earnedUsd).toBeGreaterThan(fare.fare.fareUsd);
      expect(fare.outcome.stars).toBe(5);
    }
  });

  it("an L5 shift reaches the results screen with a score and a best", () => {
    const sim = make("L5");
    const saved: number[] = [];
    sim.onCareer = (c) => saved.push(c.bestShiftScore);
    const events = run(sim, SHIFT_SECONDS + 5);
    const over = events.find((e) => e.kind === "shiftOver");
    expect(sim.state.phase).toBe("results");
    expect(over).toBeDefined();
    expect(saved.length).toBe(1);
    expect(sim.state.career.bestShiftScore).toBe(sim.state.lastScore);
    sim.restart();
    expect(sim.state.phase).toBe("driving");
    expect(sim.state.shift.faresDone).toBe(0);
  });

  it("skipping a fare pays nothing (C7)", () => {
    const sim = make("MAN");
    const events = sim.skipFare();
    expect(events[0]?.kind).toBe("popup");
    expect(sim.state.shift.earnedUsd).toBe(0);
    expect(sim.state.career.rides).toBe(0);
    expect(sim.state.shift.skipped).toBe(1);
    expect(sim.state.ride.fareIndex).toBe(1);
  });
});

describe("grid dispatch signals and assists (C19)", () => {
  it("driving through a red light is penalised", () => {
    const sim = make("MAN");
    clearRoad(sim);
    const s = sim.state;
    s.time = 13.5; // red
    const line = nextStopLineZ(s.player.z);
    s.player.z = line + 0.5;
    s.player.speed = 12;
    run(sim, 0.2, { throttle: true });
    expect(s.shift.redLights).toBe(1);
  });

  it("L5 stops at a red light instead of running it", () => {
    const sim = make("L5");
    clearRoad(sim);
    const s = sim.state;
    s.ride.beaconZ = -5000;
    for (let i = 0; i < 60 * 120; i++) sim.step(DT, NO_INPUT);
    expect(s.shift.redLights).toBe(0);
  });

  it("L4 holds its lane; L5 changes lanes during a ride", () => {
    const l4 = make("L4");
    clearRoad(l4);
    l4.state.ride.beaconZ = -5000;
    let maxDev = 0;
    for (let i = 0; i < 60 * 30; i++) { l4.step(DT, NO_INPUT); maxDev = Math.max(maxDev, Math.abs(l4.state.player.x - 3.4)); }
    expect(maxDev).toBeLessThan(0.05);
    const l5 = make("L5");
    clearRoad(l5);
    l5.state.ride.state = "ride";
    l5.state.ride.beaconZ = -5000;
    let lanes = new Set<number>();
    for (let i = 0; i < 60 * 30; i++) { l5.step(DT, NO_INPUT); lanes.add(Math.round(l5.state.player.x)); }
    expect(lanes.has(7)).toBe(true);
    lanes = new Set();
  });

  it("L3 brakes for a slow car ahead while the player holds the throttle", () => {
    const sim = make("L3");
    clearRoad(sim);
    const s = sim.state;
    const car = s.users[5]!;
    car.laneX = 3.4;
    car.z = s.player.z - 14;
    car.speed = 4;
    car.cruise = 4;
    s.player.speed = 15;
    run(sim, 1, { throttle: true });
    expect(s.player.speed).toBeLessThan(10);
  });

  it("road users never overlap in a lane (C5)", () => {
    const sim = make("L5");
    for (let t = 0; t < 90; t++) {
      run(sim, 1);
      const byLane = new Map<string, typeof sim.state.users>();
      for (const u of sim.state.users) {
        const k = `${u.direction}:${Math.round(u.laneX)}`;
        byLane.set(k, [...(byLane.get(k) ?? []), u]);
      }
      for (const list of byLane.values()) {
        const sorted = [...list].sort((a, b) => a.z - b.z);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i]!.z - sorted[i - 1]!.z - (sorted[i]!.length + sorted[i - 1]!.length) / 2;
          expect(gap).toBeGreaterThan(-0.01);
        }
      }
    }
  });
});
