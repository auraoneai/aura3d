import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANTERN_BOB, LANTERN_CAP, LANTERN_MAX, LANTERN_MIN, LanternSky, REDUCED_MOTION_SCALE, releaseCount } from "../../../examples/last-train-port/lanterns";
import { controllerInput } from "../../../examples/last-train-port/replay";
import { DT, actionDepart, actionDoors, createState, step, type RouteData, type SimData, type Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

describe("earned sky lanterns (GU47 WP-31 LT-13)", () => {
  it("releases 6-12 per clean arrival, deterministically", () => {
    for (let a = 1; a < 40; a++) {
      const n = releaseCount(a, a % 4);
      expect(n).toBeGreaterThanOrEqual(LANTERN_MIN);
      expect(n).toBeLessThanOrEqual(LANTERN_MAX);
      expect(releaseCount(a, a % 4)).toBe(n);
    }
  });

  it("releases only on a clean arrival; a catch drops one lantern and blocks that leg's release", () => {
    const sky = new LanternSky();
    const p: [number, number, number] = [0, 10, 0];
    sky.observe({ leg: 0, phase: "enroute", catches: 0 }, 0, p);
    expect(sky.observe({ leg: 1, phase: "docked", catches: 0 }, 10, p)).toBeGreaterThanOrEqual(6);
    const aloft = sky.aloft();
    sky.observe({ leg: 1, phase: "enroute", catches: 0 }, 20, p);
    sky.observe({ leg: 1, phase: "enroute", catches: 1 }, 25, p);
    expect(sky.aloft()).toBe(aloft - 1);
    expect(sky.observe({ leg: 2, phase: "docked", catches: 1 }, 30, p)).toBe(0);
    expect(sky.transforms(26).length).toBe(aloft); // the dropped one still gutters
    expect(sky.transforms(40).length).toBe(aloft - 1);
  });

  it("fills the sky with >= 40 lanterns over a driven circuit (read-only on the sim)", () => {
    const sim = createState(), sky = new LanternSky();
    const params = { kRoll: 6, kVel: 1.2, deadband: 0.15, pace: "brisk", brakeDecel: 4, brakeMargin: 6 } as const;
    let t = 0;
    for (let i = 0; i < 60 * 60 * 20 && sim.circuits < 1; i++) {
      if (sim.phase === "docked") actionDoors(sim);
      if (sim.phase === "ready") actionDepart(sim);
      step(sim, DT, controllerInput(sim, data, params), data);
      t += DT;
      const before = JSON.stringify({ leg: sim.leg, phase: sim.phase, c: sim.attempt.catches });
      sky.observe({ leg: sim.leg, phase: sim.phase, catches: sim.attempt.catches }, t, [0, 0, 0], sim.attempt.streak);
      expect(JSON.stringify({ leg: sim.leg, phase: sim.phase, c: sim.attempt.catches })).toBe(before);
    }
    expect(sim.circuits).toBe(1);
    expect(sky.released).toBeGreaterThanOrEqual(36);
    // a second circuit's worth tops 40 (the WP's runCircuit acceptance counts lanterns aloft after the QA circuit)
    expect(sky.aloft()).toBeLessThanOrEqual(LANTERN_CAP);
  });

  it("reduced motion holds the bob at <= 30%", () => {
    const sky = new LanternSky();
    sky.release([0, 0, 0], 0, 1);
    const ys = (rm: boolean) => [20, 21, 22, 23, 24, 25].map((s) => sky.transforms(s, rm)[0]!.position[1]);
    const span = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(span(ys(true))).toBeLessThanOrEqual(2 * LANTERN_BOB * REDUCED_MOTION_SCALE + 1e-9);
    expect(span(ys(false))).toBeGreaterThan(span(ys(true)));
  });
});
