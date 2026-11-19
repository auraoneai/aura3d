/**
 * Splat pass-through (owner QA 2026-11-18: things that look solid must not be rolled through) and the hands-free
 * `?autoplay=1` loop.
 *
 * The ball's corridor is the steering clamp plus its largest radius. The milestone finish arch's feet used to stand in the
 * outer lanes (the ball rolled through them); the arch is now stretched across the road so they clear the corridor. The
 * paint gates are the sim's own pass-through targets (resolved by its 1.2 m hit window), recorded below as they are.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULTS_SECONDS, AutoplayLoop, autoplayRequested } from "../../../examples/splat-rush-port/autoplay";
import { IdolPool } from "../../../examples/splat-rush-port/idol";
import {
  BALL_MAX_RADIUS, CURTAIN_HALF, GANTRY_BAR_BOTTOM, GANTRY_LANE_HALF, GANTRY_POST_RADIUS, GANTRY_POST_X, SIM_LANE, SIM_PASS_WINDOW, SIM_STEER_CLAMP,
  gantryCurtainMesh, gantryGateMeshes, gantryShadowMesh, gantrySide
} from "../../../examples/splat-rush-port/gateGantry";
import { CONFIG, SplatRushSim } from "../../../examples/splat-rush-port/sim";
import { BALL_CORRIDOR_HALF, BUNTING_LATERAL, FINISH_ARCH_INNER, FINISH_ARCH_LATERAL, FINISH_ARCH_SCALE, SWEEPER_LATERAL } from "../../../examples/splat-rush-port/world";

describe("Splat pass-through: nothing solid stands in the ball's corridor", () => {
  it("the corridor is the steering clamp plus the largest ball radius", () => {
    expect(BALL_CORRIDOR_HALF).toBeCloseTo(CONFIG.LANE_HALF_WIDTH + CONFIG.BALL_RADIUS * 1.6, 6);
  });

  it("finish arch feet, sweeper mascots and bunting poles stand outside it", () => {
    expect(FINISH_ARCH_INNER * FINISH_ARCH_SCALE * FINISH_ARCH_LATERAL).toBeGreaterThanOrEqual(BALL_CORRIDOR_HALF + 0.2);
    const sweeperSpin = Math.hypot(1.83, 1.016) / 2; // splatSweeperBot footprint, spinning
    expect(SWEEPER_LATERAL - sweeperSpin).toBeGreaterThanOrEqual(BALL_CORRIDOR_HALF + 0.2);
    expect(BUNTING_LATERAL - 0.1).toBeGreaterThanOrEqual(BALL_CORRIDOR_HALF + 0.2);
    const world = readFileSync("examples/splat-rush-port/world.ts", "utf8");
    expect(world).toContain("finishArches.place(as.slot, x, 0, r, yaw, FINISH_ARCH_SCALE, FINISH_ARCH_LATERAL);");
    expect(world).toContain("SWEEPER_LATERAL * Math.cos(yaw)");
    expect(world).toContain("BUNTING_LATERAL * Math.cos(yaw)");
  });

  it("the pooled Idol instances stretch only across the road (local x) when `lateral` is set", () => {
    const pool = new IdolPool(1);
    let got: Float32Array | null = null;
    pool.place(0, 1, 0, -3, 0, 2, 1.5);
    pool.flush({ setInstanceMatrices: (m: Float32Array) => { got = m; } } as never, true);
    const m = got as unknown as Float32Array;
    expect(m[0]).toBeCloseTo(3, 6); // x: scale 2 x lateral 1.5
    expect(m[5]).toBeCloseTo(2, 6); // y
    expect(m[10]).toBeCloseTo(2, 6); // z
  });

  it("pickups are collected where they are drawn (1.5 m reach ~ a 2 m pickup + the ball)", () => {
    const sim = readFileSync("examples/splat-rush-port/sim.ts", "utf8");
    expect(sim).toContain("Math.abs(ge.x - p.x) < 1.5");
    expect(Math.abs(2.1 / 2 + CONFIG.BALL_RADIUS - 1.5)).toBeLessThanOrEqual(0.15);
  });
});

describe("Splat paint gates: the ball never rolls through a post (row gantry)", () => {
  const LANES = [-SIM_LANE, 0, SIM_LANE];

  it("the sim constants the gantry is built against are the sim's", () => {
    expect(SIM_STEER_CLAMP).toBe(CONFIG.LANE_HALF_WIDTH);
    expect(BALL_MAX_RADIUS).toBeCloseTo(CONFIG.BALL_RADIUS * 1.6, 9);
    const sim = readFileSync("examples/splat-rush-port/sim.ts", "utf8");
    expect(sim).toContain("const lanes = [-2.3, 0, 2.3];");
    expect(sim).toContain("if (off < 1.2) {");
    expect(sim).toContain("o.ballScale = Math.min(1.6,");
  });

  for (const carnival of [true, false]) {
    it(`${carnival ? "carnival" : "original"} look: no solid part of any gate stands where the ball can be`, () => {
      const v = gantryGateMeshes(carnival);
      expect(v.left.positions.length).toBe(v.right.positions.length);
      expect(v.center.positions.length).toBe(v.right.positions.length);
      // every reachable ball: centre anywhere in the steering clamp (the row's pass windows cover it all), any scale
      const solids: [number, number][] = [];
      for (const laneX of LANES) {
        const m = v.of(gantrySide(laneX));
        for (let i = 0; i < m.positions.length; i += 3) {
          const lx = m.positions[i]!, y = m.positions[i + 1]!;
          // below the bar and outside the gate's own lane = post / collar / bar run (the drips hang inside the lane)
          if (y < GANTRY_BAR_BOTTOM - 1e-6 && Math.abs(lx) > GANTRY_LANE_HALF) solids.push([laneX + lx, y]);
          // nothing hangs below the bar inside a lane except the soft paint drips (carnival only)
          if (!carnival && Math.abs(lx) <= GANTRY_LANE_HALF) expect(y).toBeGreaterThanOrEqual(GANTRY_BAR_BOTTOM - 1e-6);
        }
      }
      expect(solids.length).toBeGreaterThan(0); // the two outer posts
      const hits: string[] = [];
      for (let b = -SIM_STEER_CLAMP; b <= SIM_STEER_CLAMP + 1e-9; b += 0.05) {
        for (const r of [0.55 * 0.4, 0.55, BALL_MAX_RADIUS]) {
          for (const [x, y] of solids) if (Math.abs(x - b) < r && y < 2 * r && hits.length < 5) hits.push(`ball ${b.toFixed(2)} r${r} post vertex ${x.toFixed(2)},${y.toFixed(2)}`);
        }
      }
      expect(hits).toEqual([]);
      // only the outer gates carry a post, outside the corridor, and the largest ball rolls under the bar
      for (const [x] of solids) expect(Math.abs(x)).toBeGreaterThanOrEqual(SIM_STEER_CLAMP + BALL_MAX_RADIUS);
      expect(GANTRY_POST_X - GANTRY_POST_RADIUS).toBeGreaterThanOrEqual(SIM_STEER_CLAMP + BALL_MAX_RADIUS + 0.1);
      expect(GANTRY_BAR_BOTTOM).toBeGreaterThanOrEqual(2 * BALL_MAX_RADIUS + 0.1);
    }, 60_000);
  }

  it("a hit (or a match) always meets the gate's face; neighbouring gates do not overlap", () => {
    // the sim resolves the ball against the nearest gate within 1.2 m; the smallest ball still reaches into its curtain
    expect(SIM_PASS_WINDOW - 0.55 * 0.4).toBeLessThan(CURTAIN_HALF);
    const c = gantryCurtainMesh();
    const xs = c.positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(CURTAIN_HALF, 9);
    expect(2 * CURTAIN_HALF).toBeLessThanOrEqual(SIM_LANE);
    expect(Math.max(...c.positions.filter((_, i) => i % 3 === 1))).toBeLessThan(GANTRY_BAR_BOTTOM);
    // bar segments meet at the lane boundary (one beam), within a 2 cm cap overlap
    expect(GANTRY_LANE_HALF).toBeLessThanOrEqual(SIM_LANE / 2 + 0.02);
    // an outer post never stands in the middle gate's lane
    expect(GANTRY_POST_X - GANTRY_POST_RADIUS).toBeGreaterThan(SIM_LANE / 2 + SIM_LANE);
  });

  it("gate shadows follow the gantry: one post strip on the outer gates, none on the middle gate", () => {
    const xsOf = (side: -1 | 0 | 1) => gantryShadowMesh(1.7, 0.7, side).positions.filter((_, i) => i % 3 === 0);
    for (const side of [-1, 0, 1] as const) expect(gantryShadowMesh(1.7, 0.7, side).positions.length / 3).toBe(12);
    expect(Math.max(...xsOf(1))).toBeGreaterThan(GANTRY_POST_X - SIM_LANE);
    expect(Math.min(...xsOf(-1))).toBeLessThan(-(GANTRY_POST_X - SIM_LANE));
    expect(Math.max(...xsOf(0).map(Math.abs))).toBeLessThanOrEqual(GANTRY_LANE_HALF + 0.7 * 1.7 * 1.12 + 1e-6);
  });

  it("world.ts places each gate's variant by its lane", () => {
    const world = readFileSync("examples/splat-rush-port/world.ts", "utf8");
    expect(world).toContain("gates.place(slot, x, 0, r, 0, 1, 1, 1, gantry.of(side));");
    expect(world).toContain("gantry.of(gantrySide(g.laneX))");
    expect(world).toContain("gateShadowOf(side)");
  });
});

describe("Splat ?autoplay=1 (hands-free loop)", () => {
  it("?autoplay=1 and the older ?autopilot=1 both turn it on; O toggles it and the hint says so", () => {
    expect(autoplayRequested("?autoplay=1")).toBe(true);
    expect(autoplayRequested("?autopilot=1")).toBe(true);
    expect(autoplayRequested("?seed=3")).toBe(false);
    const main = readFileSync("examples/splat-rush-port/main.ts", "utf8");
    expect(main).toContain("const AUTOPLAY = config.autoplay || config.autopilot;");
    expect(main).toContain('if (e.code === "KeyO" && !config.manual && !e.repeat)');
    for (const page of ["examples/splat-rush-port/index.html", "apps/showcase-splat-rush-port/index.html"]) expect(readFileSync(page, "utf8")).toContain("O autoplay");
  });

  it("plays from the splash: scores, keeps rolling, never stalls 5 s", () => {
    const sim = new SplatRushSim(20261023);
    const loop = new AutoplayLoop(() => sim.begin());
    let still = 0, maxStill = 0, lastD = -1;
    for (let i = 0; i < 60 * 40; i++) {
      sim.advance(loop.next(sim));
      loop.observe(sim);
      if (sim.o.phase === "playing" && sim.o.distance === lastD) still++; else still = 0;
      maxStill = Math.max(maxStill, still);
      lastD = sim.o.distance;
    }
    expect(sim.o.distance).toBeGreaterThan(100);
    expect(sim.o.score).toBeGreaterThan(0);
    expect(sim.o.combo + sim.o.lives).toBeGreaterThan(0);
    expect(maxStill / 60).toBeLessThan(5);
  });

  it("after a game over it shows the results ~3 s, then starts the next run on its own", () => {
    const sim = new SplatRushSim(7);
    let restarts = 0;
    // aim at the wrong gate every row so the run ends quickly
    const loop = new AutoplayLoop(() => { restarts++; sim.begin(); }, { maxDx: 14, mistakeRows: Array.from({ length: 400 }, (_, k) => k), aimOffset: 0 });
    let overSteps = 0, sawOver = false;
    for (let i = 0; i < 60 * 120 && restarts < 2; i++) {
      sim.advance(loop.next(sim));
      loop.observe(sim);
      if (sim.o.phase === "gameOver") { sawOver = true; overSteps++; }
      else if (overSteps > 0) { expect(overSteps / 60).toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_SECONDS - 0.05); overSteps = 0; }
    }
    expect(sawOver).toBe(true);
    expect(restarts).toBe(2);
    expect(loop.runCount).toBe(3);
    // the new run is played: it rolls again
    const d0 = sim.o.distance;
    for (let i = 0; i < 120; i++) { sim.advance(loop.next(sim)); loop.observe(sim); }
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.distance).toBeGreaterThan(d0);
  });
});
