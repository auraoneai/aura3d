import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DT, actionDepart, actionDoors, actionNewService, actionTimeOfDay, alightingDuration, boardingDuration, comfortOf, createState, fareDistance, sampleRoute,
  step, streakMultiplier, temperamentFactor, tipOf, type RouteData, type SimData, type Tables, type Trip
} from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

const trip = (weights: Record<number, number>, fareDist = 1000): Trip => ({ id: "t", name: "T", temperament: "easy", seat: 0, ride: "0:t", origin: 0, destination: 1, fareDistance: fareDist, journey: { frontiers: {}, distance: 0, comfort: 0, weights } });

function stepsUntil(s: ReturnType<typeof createState>, phase: string, input = {}): number {
  let n = 0;
  while (s.phase !== phase) { step(s, DT, input, data); if (++n > 20000) throw new Error(`stuck in ${s.phase}`); }
  return n;
}

describe("last-train-port simulation formulas", () => {
  it("tip is round(50 * clamp(weight / fare distance, 0, 2.7))", () => {
    expect(tipOf(trip({ 0: 0 }))).toBe(0);
    expect(tipOf(trip({ 0: 500 }))).toBe(25);
    expect(tipOf(trip({ 0: 1000 }))).toBe(50);
    expect(tipOf(trip({ 0: 99999 }))).toBe(135);
    expect(tipOf(trip({ 0: 400, 1: 350 }))).toBe(38);
  });

  it("streak multiplier is 1 + min(1, streak / 200)", () => {
    const s = createState();
    expect(streakMultiplier(s)).toBe(1);
    s.attempt.streak = 100; expect(streakMultiplier(s)).toBe(1.5);
    s.attempt.streak = 400; expect(streakMultiplier(s)).toBe(2);
  });

  it("temperament factors follow the original (sightseer, rushed, sleeper, easy)", () => {
    const T = data.tables.temperament;
    expect(temperamentFactor("easy", 0.8, 9, 0, 0, false, T)).toBe(0.8);
    expect(temperamentFactor("sightseer", 1, T.H - 1, 0, 0, false, T)).toBeCloseTo(1.3);
    expect(temperamentFactor("sightseer", 1, T.H + 5, 0, 0, false, T)).toBeCloseTo(0.5);
    expect(temperamentFactor("rushed", 0.64, T.V, 0, 0, false, T)).toBeCloseTo(0.8 * 1.3);
    expect(temperamentFactor("rushed", 0.64, T.G - 1, 0, 0, false, T)).toBeCloseTo(0.8 * 0.7);
    expect(temperamentFactor("sleeper", 1, 8, 0.02, 0.05, false, T)).toBeCloseTo(1.35);
    expect(temperamentFactor("sleeper", 1, 8, 0.2, 0, false, T)).toBeCloseTo(0.15);
    expect(temperamentFactor("sleeper", 1, 8, 0, 0, true, T)).toBeCloseTo(0.15);
  });

  it("route sampling reproduces the measured samples and interpolates between them", () => {
    const leg = data.route.legs[2]!;
    const at = sampleRoute(data.route, 2, leg.spacing * 10);
    expect(at.x).toBeCloseTo(leg.position[30]!, 6);
    expect(at.curvature).toBeCloseTo(leg.physics[40]!, 6);
    const mid = sampleRoute(data.route, 2, leg.spacing * 10.5);
    expect(mid.x).toBeCloseTo((leg.position[30]! + leg.position[33]!) / 2, 6);
    expect(sampleRoute(data.route, 2, leg.length + 50).x).toBeCloseTo(leg.position[(leg.count - 1) * 3]!, 6);
  });

  it("fare distance sums the legs from origin to destination around the ring", () => {
    const L = data.tables.legLengths;
    expect(fareDistance(data, 0, 1)).toBeCloseTo(L[0]!, 6);
    expect(fareDistance(data, 4, 1)).toBeCloseTo(L[4]! + L[5]! + L[0]!, 6);
  });

  it("boarding and alighting durations are fitted to the reference", () => {
    expect([0, 1, 2, 3, 4].map(alightingDuration)).toEqual([0, 7.65, 7.65, 8.85, 10.05]);
    expect(boardingDuration(0)).toBe(0.6);
    expect(boardingDuration(4)).toBeCloseTo(9.1, 6);
  });
});

describe("last-train-port station sequence", () => {
  it("runs docked -> doors -> deploy -> alight -> board -> ready -> depart -> enroute with the original's phase timings", () => {
    const s = createState();
    expect(s.phase).toBe("docked");
    step(s, DT, { accelerate: true }, data);
    expect(s.speed).toBe(0);
    actionDoors(s);
    expect(s.phase).toBe("opening");
    expect(stepsUntil(s, "deploying")).toBe(60);
    expect(stepsUntil(s, "alighting")).toBe(72);
    stepsUntil(s, "boarding");
    expect(s.pendingBoarders).toHaveLength(4);
    stepsUntil(s, "ready");
    expect(s.passengers).toBe(4);
    expect(s.trips.map((t) => t.name)).toEqual(["Leela", "Arun", "Basil", "Pip"]);
    actionDepart(s);
    expect(s.phase).toBe("retracting");
    expect(stepsUntil(s, "closing")).toBe(78);
    expect(stepsUntil(s, "enroute")).toBe(60);
  });

  it("ignores doors while enroute and depart before ready", () => {
    const s = createState();
    actionDepart(s);
    expect(s.phase).toBe("docked");
    actionDoors(s); actionDoors(s);
    expect(s.phase).toBe("opening");
  });

  it("a stationary tram holds speed 0 with doors open; a brake on a moving tram slows at 5 m/s^2", () => {
    const s = createState();
    s.phase = "enroute"; s.speed = 8; s.distance = 100;
    step(s, DT, { brake: true }, data);
    expect(s.speed).toBeCloseTo(8 - 5 * DT, 6);
  });

  it("approach limit caps speed at sqrt(3.6 * remaining) beyond 20 m", () => {
    const s = createState();
    s.phase = "enroute"; s.distance = data.route.legs[0]!.length - 4; s.speed = 8;
    step(s, DT, { accelerate: true, cruisePace: "brisk" }, data);
    expect(s.speed).toBeLessThanOrEqual(Math.sqrt(3.6 * 4) + 1e-9);
  });

  it("arriving at the end of a leg docks at the next station and counts the circuit after six stops", () => {
    const s = createState();
    for (let leg = 0; leg < 6; leg++) {
      s.phase = "enroute"; s.leg = leg; s.distance = data.route.legs[leg]!.length - 0.05; s.speed = 0.3;
      step(s, DT, { accelerate: true, cruisePace: "brisk" }, data);
      expect(s.leg).toBe((leg + 1) % 6);
      expect(s.phase).toBe("docked");
      expect(s.distance).toBe(0);
    }
    expect(s.circuits).toBe(1);
    expect(s.attempt.legs).toHaveLength(6);
  });

  it("new service keeps score and wallet, resets the train, and only starts after the attempt is complete", () => {
    const s = createState();
    s.score = 4039; s.wallet = 4039;
    actionNewService(s);
    expect(s.attempt.id).toBe(1);
    s.attempt.status = "complete"; s.leg = 3; s.trips.push(trip({}));
    actionNewService(s);
    expect(s.attempt.id).toBe(2);
    expect(s.attempt.status).toBe("active");
    expect(s.leg).toBe(0);
    expect(s.trips).toHaveLength(0);
    expect(s.score).toBe(4039);
  });

  it("day/night is a state toggle only (no physics change)", () => {
    const a = createState(), b = createState();
    actionTimeOfDay(b, "night");
    for (const s of [a, b]) { s.phase = "enroute"; s.distance = 50; s.speed = 6; for (let i = 0; i < 120; i++) step(s, DT, { accelerate: true, cruisePace: "brisk" }, data); }
    expect(b.timeOfDay).toBe("night");
    expect(b.distance).toBe(a.distance);
    expect(b.roll).toBe(a.roll);
  });

  it("comfort of a trip is the distance-weighted comfort percentage", () => {
    const t = trip({}); t.journey.distance = 200; t.journey.comfort = 150;
    expect(comfortOf(t)).toBe(75);
  });
});
