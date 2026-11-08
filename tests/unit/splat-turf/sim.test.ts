import { describe, expect, it } from "vitest";
import { CONFIG, IDLE, SplatTurfSim, TRACE_COLUMNS, coverageGrade, replay, type Input } from "../../../apps/showcase-splat-turf/src/sim";
import { TurfAutopilot } from "../../../apps/showcase-splat-turf/src/autopilot";

const START: Input = { ...IDLE, start: true };
const input = (dx: number): Input => ({ ...IDLE, dx });

const running = (seed = 7): SplatTurfSim => {
  const sim = new SplatTurfSim(seed);
  for (let i = 0; i < 10; i++) sim.advance(IDLE);
  sim.advance(START);
  return sim;
};

const runUntilRow = (sim: SplatTurfSim, row: number, max = 6000): void => {
  let n = 0;
  while (sim.o.distance < row && sim.o.phase === "playing" && n < max) { sim.advance(IDLE); n++; }
};

describe("splat turf sim determinism", () => {
  it("double replay produces identical traces (integers exact, floats within 1e-9)", () => {
    const script: Input[] = [START];
    for (let i = 0; i < 900; i++) script.push(input(i % 120 < 60 ? 0.06 : -0.06));
    const a = replay(42, 20, script);
    const b = replay(42, 20, script);
    expect(a.trace.length).toBe(b.trace.length);
    expect(a.trace.length).toBe(20 + script.length);
    const floatCols = new Set(["tank", "distance", "laneOffset"].map((c) => TRACE_COLUMNS.indexOf(c as (typeof TRACE_COLUMNS)[number])));
    for (let i = 0; i < a.trace.length; i++) {
      for (let c = 0; c < TRACE_COLUMNS.length; c++) {
        if (floatCols.has(c)) expect(Math.abs(a.trace[i]![c]! - b.trace[i]![c]!)).toBeLessThan(1e-9);
        else expect(a.trace[i]![c]).toBe(b.trace[i]![c]);
      }
    }
    expect(a.sim.rngCount).toBe(b.sim.rngCount);
  });

  it("different seeds diverge but every gameplay draw is counted", () => {
    const a = replay(1, 0, [START, ...Array.from({ length: 600 }, () => IDLE)]);
    const b = replay(2, 0, [START, ...Array.from({ length: 600 }, () => IDLE)]);
    expect(a.sim.rngCount).toBeGreaterThan(0);
    expect(JSON.stringify(a.trace)).not.toBe(JSON.stringify(b.trace));
  });
});

describe("splat turf mechanics", () => {
  it("paints the cell under the ball and scores 5 x painted cells x mult per row", () => {
    const sim = running();
    runUntilRow(sim, 12);
    const o = sim.o;
    expect(o.passedCells).toBeGreaterThanOrEqual(12);
    expect(o.paintedCells).toBe(o.passedCells);
    expect(o.score).toBe(5 * o.paintedCells * o.mult);
    let painted = 0;
    for (let i = 0; i < 12 * CONFIG.GRID_COLS; i++) painted += sim.grid[i]!;
    expect(painted).toBe(12);
    expect(o.coverage).toBe(1);
    expect(o.tank).toBeLessThan(CONFIG.TANK_MAX);
    expect(o.tank).toBeCloseTo(CONFIG.TANK_MAX - o.distance * CONFIG.TANK_DRAIN, 0);
  });

  it("steering clamps to the lane and C4 restart re-centres target AND drag state", () => {
    const sim = running();
    for (let i = 0; i < 200; i++) sim.advance(input(0.5));
    expect(sim.steerTarget).toBe(CONFIG.LANE_LIMIT);
    expect(sim.o.laneOffset).toBeLessThanOrEqual(CONFIG.LANE_LIMIT);
    sim.begin();
    expect(sim.steerTarget).toBe(0);
    expect(sim.o.laneOffset).toBe(0);
    sim.advance(IDLE);
    expect(sim.o.laneOffset).toBe(0); // no drag momentum survives the restart
  });

  it("solvent strip: -20 tank, wipes its lane strip, resets combo, resolves once (C16)", () => {
    const sim = running();
    const s = sim.o.strips[0]!;
    s.active = true; s.row = 5; s.col = 3; s.hit = false; // ball starts on column 3
    runUntilRow(sim, 17);
    expect(sim.o.solventHits).toBe(1);
    expect(sim.o.combo).toBe(0);
    for (let r = 5; r < 15; r++) expect(sim.grid[r * CONFIG.GRID_COLS + 3]).toBe(0);
    expect(sim.o.paintedCells).toBe(sim.o.passedCells - 10);
    const tankAfter = sim.o.tank;
    runUntilRow(sim, 20);
    expect(sim.o.solventHits).toBe(1); // no second hit while crossing the rest of the strip
    expect(sim.o.tank).toBeLessThan(tankAfter); // drain continues
  });

  it("eraser bot: -15 tank and wipes the last 15 m of trail", () => {
    const sim = running(11);
    const b = sim.o.bots[0]!;
    b.active = true; b.row = 20; b.x = 0; b.dir = 0; b.hit = false;
    sim.o.bots[1]!.active = false;
    sim.o.bots[2]!.active = false;
    runUntilRow(sim, 19);
    expect(sim.o.paintedCells).toBeGreaterThan(10);
    runUntilRow(sim, 21);
    expect(sim.o.eraserHits).toBe(1);
    expect(sim.o.combo).toBe(0);
    expect(sim.o.paintedCells).toBeLessThanOrEqual(sim.o.passedCells - 14);
    let painted = 0;
    for (let r = 6; r < 20; r++) painted += sim.grid[r * CONFIG.GRID_COLS + 3]!;
    expect(painted).toBe(0);
  });

  it("paint can: +35 tank capped at 100, counted once", () => {
    const sim = running();
    sim.o.tank = 50;
    const c = sim.o.cans[0]!;
    c.active = true; c.row = 8; c.col = 3;
    runUntilRow(sim, 10);
    expect(sim.o.cansGrabbed).toBe(1);
    expect(c.active).toBe(false);
    expect(sim.o.tank).toBeGreaterThan(80);
    expect(sim.o.tank).toBeLessThanOrEqual(CONFIG.TANK_MAX);
    sim.o.tank = 90;
    const c2 = sim.o.cans[1]!;
    c2.active = true; c2.row = 12; c2.col = 3;
    runUntilRow(sim, 14);
    expect(sim.o.tank).toBeLessThanOrEqual(CONFIG.TANK_MAX);
  });

  it("25 m stretches at full coverage build combo and mult (1 + floor(combo/2), cap 5)", () => {
    const sim = running();
    runUntilRow(sim, 26);
    expect(sim.o.stretches).toBe(1);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.mult).toBe(1);
    runUntilRow(sim, 51);
    expect(sim.o.combo).toBe(2);
    expect(sim.o.mult).toBe(2);
    expect(sim.o.speed).toBeCloseTo(CONFIG.SPEED_INIT + 2 * CONFIG.SPEED_INCREMENT, 9);
    expect(sim.o.speed).toBeLessThanOrEqual(CONFIG.MAX_SPEED);
  });

  it("milestone every 750 score adds +100 and a gold popup", () => {
    const sim = running();
    runUntilRow(sim, 160);
    expect(sim.o.milestones).toBeGreaterThanOrEqual(1);
    expect(sim.popups.some((p) => p.text === "+100")).toBe(true);
  });

  it("tank empty: bursting for 1.15 s then gameOver with the coverage grade", () => {
    const sim = running();
    runUntilRow(sim, 10);
    sim.o.tank = 0.001;
    sim.advance(IDLE);
    expect(sim.o.phase).toBe("bursting");
    for (let i = 0; i < 70; i++) sim.advance(IDLE);
    expect(sim.o.phase).toBe("gameOver");
    expect(["S", "A", "B", "C"]).toContain(sim.o.grade);
  });

  it("distance 1200: finished phase with a coverage grade", () => {
    const sim = running();
    sim.o.distance = CONFIG.RUN_LENGTH - 0.1;
    sim.advance(IDLE);
    expect(sim.o.phase).toBe("finished");
    expect(sim.o.distance).toBe(CONFIG.RUN_LENGTH);
    expect(sim.o.grade).toBe(coverageGrade(sim.o.coverage * 100));
  });

  it("coverage grades: S>=85, A>=70, B>=50, else C", () => {
    expect(coverageGrade(85)).toBe("S");
    expect(coverageGrade(84.9)).toBe("A");
    expect(coverageGrade(70)).toBe("A");
    expect(coverageGrade(69.9)).toBe("B");
    expect(coverageGrade(50)).toBe("B");
    expect(coverageGrade(49.9)).toBe("C");
  });

  it("pools never exceed their sizes; a full can pool skips spawns without stalling", () => {
    const sim = running();
    for (const c of sim.o.cans) { c.active = true; c.row = 1000; c.col = 0; }
    for (let i = 0; i < 600; i++) sim.advance(IDLE);
    expect(sim.o.cans.length).toBe(CONFIG.POOL_CANS);
    expect(sim.o.strips.length).toBe(CONFIG.POOL_STRIPS);
    expect(sim.o.bots.length).toBe(CONFIG.POOL_BOTS);
    expect(sim.o.particles.length).toBe(CONFIG.POOL_PARTICLES);
    expect(sim.o.segments.length).toBe(CONFIG.POOL_SEGMENTS);
    expect(sim.o.distance).toBeGreaterThan(0);
    const last = sim.traceRow(sim.traceLength - 1);
    expect(last[TRACE_COLUMNS.indexOf("cansActive")]!).toBeLessThanOrEqual(CONFIG.POOL_CANS);
  });

  it("popups keep the last 64 with monotonic seq across restarts", () => {
    const sim = running();
    runUntilRow(sim, 200);
    const seqBefore = sim.popups[sim.popups.length - 1]!.seq;
    expect(sim.popups.length).toBeLessThanOrEqual(64);
    sim.begin();
    runUntilRow(sim, 30);
    const fresh = sim.popups[sim.popups.length - 1]!;
    expect(fresh.seq).toBeGreaterThan(seqBefore);
    for (let i = 1; i < sim.popups.length; i++) expect(sim.popups[i]!.seq).toBeGreaterThan(sim.popups[i - 1]!.seq);
  });

  it("the autopilot steers away from hazards and scores", () => {
    const sim = new SplatTurfSim(7);
    const pilot = new TurfAutopilot();
    for (let i = 0; i < 1200; i++) sim.advance(pilot.next(sim, i));
    expect(sim.o.score).toBeGreaterThan(0);
    expect(sim.o.distance).toBeGreaterThan(200);
    expect(sim.o.phase === "playing" || sim.o.phase === "finished").toBe(true);
  });
});