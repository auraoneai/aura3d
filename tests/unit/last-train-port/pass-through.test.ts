/**
 * Lamplight Line pass-through (owner QA 2026-11-18: things that look solid must not be walked or driven through) and the
 * hands-free `?autoplay=1` loop.
 *
 * The tram runs on rails (no hazards, no colliders in the sim); what can pass through solid set pieces is the render-only
 * town walkers. Their lanes (walkers.ts WALKER_ZONES) must stay clear of the standing crowd, the freight crates, the market
 * stalls, benches, lamp posts, catenary masts, signal posts, bushes and the tram's own corridor.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULTS_SECONDS, autoplayRequested, createAutoplayDriver } from "../../../examples/last-train-port/autoplay";
import { DT, SHORT_LEGS, actionNewService, attemptScore, createState, step, type RouteData, type SimData, type Tables } from "../../../examples/last-train-port/sim";
import { WALKER_BODY_HALF, WALKER_ZONES, intersectsWalkerZone, townWalkers, walkerPose, type TownFrame } from "../../../examples/last-train-port/walkers";
import { BUSH_RADIUS, FOLK_HALF, PLATFORM_CRATES, POLE_CLEAR, STANDING_FOLK, clearOfPoles } from "../../../examples/last-train-port/world";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const TRAM_HALF = 2.98 / 2; // llTram.idol.json width
const FRAME: TownFrame = { o: [0, 0, 0], f: [0, 1], s: [1, 0] };

/** Footprints of the solid set pieces around a station (lateral, along, half lateral, half along), from world.ts. */
const SOLIDS: { name: string; lat: number; along: number; hl: number; ha: number }[] = [
  ...[PLATFORM_CRATES.along, -PLATFORM_CRATES.along].map((a) => ({ name: "crates", lat: PLATFORM_CRATES.lateral, along: a, hl: PLATFORM_CRATES.half, ha: PLATFORM_CRATES.half })),
  // market stalls with their awnings (3.6 x 2.4 m): lateral -10 / -14.2, along -34 + 12k
  ...[0, 1, 2, 3].map((k) => ({ name: "stall", lat: -10 - (k % 2) * 4.2, along: -34 + k * 12, hl: 1.8, ha: 1.2 })),
  ...[-6, 0, 6].map((a) => ({ name: "bench", lat: 6.4, along: a, hl: 0.3, ha: 1.0 })),
  ...[-9, 9].map((a) => ({ name: "lamp post", lat: 6.8, along: a, hl: 0.2, ha: 0.2 })),
  ...[-16, 20].map((a) => ({ name: "signal post", lat: -2.9, along: a, hl: 0.09, ha: 0.09 })),
  { name: "tram", lat: 0, along: 0, hl: TRAM_HALF, ha: 999 }
];

describe("Lamplight Line pass-through: nothing solid stands in a walker's lane", () => {
  it("the walkers stay inside their lanes", () => {
    for (const town of [0, 3, 5]) {
      for (const w of townWalkers(town)) {
        for (const t of [0, 3.3, 7.9, 19.4, 41]) {
          const p = walkerPose(FRAME, w, t);
          const lat = p.x, along = p.z;
          expect(WALKER_ZONES.some((z) => lat - WALKER_BODY_HALF >= z.lateral[0] - 1e-9 && lat + WALKER_BODY_HALF <= z.lateral[1] + 1e-9 && along >= z.along[0] && along <= z.along[1])).toBe(true);
        }
      }
    }
  });

  it("no set piece footprint overlaps a walker lane", () => {
    for (const s of SOLIDS) expect(intersectsWalkerZone(s.lat, s.along, s.hl, s.ha), s.name).toBe(false);
  });

  it("the standing crowd waits outside the walker lanes, on the platform and clear of the tram", () => {
    const along = STANDING_FOLK.platformAlong + 1; // + the 1 m pole nudge
    for (const lat of STANDING_FOLK.platform) {
      expect(intersectsWalkerZone(lat, 0, FOLK_HALF, along + FOLK_HALF)).toBe(false);
      expect(lat - FOLK_HALF).toBeGreaterThanOrEqual(2.4 - 1e-9); // the platform's track edge
      // the platform folk never reach the crates
      expect(along + FOLK_HALF).toBeLessThan(PLATFORM_CRATES.along - PLATFORM_CRATES.half);
    }
    for (const lat of STANDING_FOLK.plaza) {
      expect(intersectsWalkerZone(lat, 0, FOLK_HALF, 30)).toBe(false);
      expect(Math.abs(lat) - FOLK_HALF).toBeGreaterThan(TRAM_HALF + 0.5);
      expect(Math.abs(lat) - FOLK_HALF).toBeGreaterThan(2.9 + 0.09); // the signal posts
    }
  });

  it("a townsperson next to a catenary mast is moved along the platform until clear", () => {
    const mast: [number, number, number] = [2.9, 4.0, 0.13];
    const [x, z] = clearOfPoles(2.95, 4.2, 0, 1, [mast]);
    expect(Math.hypot(x - mast[0], z - mast[1])).toBeGreaterThanOrEqual(mast[2] + FOLK_HALF + POLE_CLEAR);
    expect(Math.abs(z - 4.2)).toBeLessThanOrEqual(1);
    expect(clearOfPoles(2.95, 9, 0, 1, [mast])).toEqual([2.95, 9]);
  });

  it("world.ts drops bushes whose crown reaches a walker lane and places the crowd with the pole nudge", () => {
    const src = readFileSync("examples/last-train-port/world.ts", "utf8");
    expect(src).toContain("if (!intersectsWalkerZone(lateral, along, BUSH_RADIUS * bs))");
    expect(src).toContain("clearOfPoles(fxp0, fzp0, fx, fz, townPoles)");
    expect(BUSH_RADIUS).toBeGreaterThan(1);
  });
});

describe("Lamplight Line ?autoplay=1 (hands-free loop)", () => {
  it("?autoplay=1 and the older ?autopilot=1 both turn it on, and the title is skipped", () => {
    expect(autoplayRequested("?autoplay=1")).toBe(true);
    expect(autoplayRequested("?autopilot=1")).toBe(true);
    expect(autoplayRequested("?band=D")).toBe(false);
    const main = readFileSync("examples/last-train-port/main.ts", "utf8");
    expect(main).toContain("let autopilot = autoplayRequested(location.search);");
    expect(main).toMatch(/let titleMode = [^;]*!autopilot/);
    expect(main).toContain('if (code === "KeyP") autopilot = !autopilot;');
    for (const page of ["examples/last-train-port/index.html", "apps/showcase-last-train-port/index.html"]) expect(readFileSync(page, "utf8")).toContain("<kbd>P</kbd> autoplay");
  });

  it("runs services on its own: makes progress, never stalls 5 s, shows the results ~3 s and starts a new service", () => {
    const sim = createState();
    actionNewService(sim, { force: true, goal: SHORT_LEGS });
    const driver = createAutoplayDriver({ kRoll: 6, kVel: 1.2, deadband: 0.15, pace: "brisk", brakeDecel: 4, brakeMargin: 6 });
    const firstId = sim.attempt.id;
    let restarts = 0, still = 0, maxStill = 0, completeSteps = 0, bestScore = 0;
    let last = `${sim.phase}|${sim.leg}|${sim.distance.toFixed(2)}`;
    for (let i = 0; i < 60 * 60 * 12 && restarts < 2; i++) {
      const { input, restarted } = driver.step(sim, data);
      if (restarted) { restarts++; expect(completeSteps * DT).toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_SECONDS - 0.05); completeSteps = 0; }
      step(sim, DT, input, data);
      if (sim.attempt.status === "complete") completeSteps++;
      bestScore = Math.max(bestScore, attemptScore(sim.attempt));
      const key = `${sim.phase}|${sim.leg}|${sim.distance.toFixed(2)}|${sim.phaseTime > 0 ? Math.floor(sim.phaseTime * 2) : 0}`;
      if (sim.attempt.status === "active" && key === last) { still++; maxStill = Math.max(maxStill, still); } else still = 0;
      last = key;
    }
    expect(restarts).toBe(2);
    expect(sim.attempt.id).toBeGreaterThanOrEqual(firstId + 2);
    expect(bestScore).toBeGreaterThan(0);
    expect(maxStill * DT).toBeLessThan(5);
  });
});
