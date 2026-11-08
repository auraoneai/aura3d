import { describe, expect, it } from "vitest";
import {
  CONFIG,
  IDLE,
  POOL,
  ShapeShiftSim,
  TRACE_COLUMNS,
  replay,
  type Input
} from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { Autopilot } from "../../../apps/showcase-shape-shift-sprint/src/autopilot";

const START: Input = { ...IDLE, start: true };
const steer = (dx: number): Input => ({ ...IDLE, dx });

const running = (seed = 7): ShapeShiftSim => {
  const sim = new ShapeShiftSim(seed);
  for (let i = 0; i < 10; i++) sim.advance(IDLE);
  sim.advance(START);
  return sim;
};

describe("shape shift sprint sim determinism", () => {
  it("double replay produces identical traces (integers exact, floats within 1e-9)", () => {
    const script: Input[] = [START];
    for (let i = 0; i < 900; i++) script.push(steer(i % 120 < 60 ? 0.08 : -0.08));
    const a = replay(42, 20, script);
    const b = replay(42, 20, script);
    expect(a.trace.length).toBe(b.trace.length);
    expect(a.trace.length).toBe(20 + script.length);
    const floatCols = new Set(
      ["distance", "speed", "laneOffset", "ballScale", "wildcardTimer", "scoreX2Timer", "squashT", "shakeTimer"].map(
        (c) => TRACE_COLUMNS.indexOf(c as (typeof TRACE_COLUMNS)[number])
      )
    );
    for (let i = 0; i < a.trace.length; i++) {
      for (let c = 0; c < TRACE_COLUMNS.length; c++) {
        if (floatCols.has(c)) expect(Math.abs(a.trace[i]![c]! - b.trace[i]![c]!)).toBeLessThan(1e-9);
        else expect(a.trace[i]![c]).toBe(b.trace[i]![c]);
      }
    }
    expect(a.sim.rng.count).toBe(b.sim.rng.count);
  });

  it("different seeds diverge while counting every gameplay draw", () => {
    const a = replay(1, 0, [START, ...Array.from({ length: 600 }, () => IDLE)]);
    const b = replay(2, 0, [START, ...Array.from({ length: 600 }, () => IDLE)]);
    expect(a.sim.rng.count).toBeGreaterThan(0);
    expect(JSON.stringify(a.trace)).not.toBe(JSON.stringify(b.trace));
  });
});

describe("shape shift sprint mechanics", () => {
  it("every spawned wall row contains all three shaped holes in shuffled lanes", () => {
    const sim = running(19);
    expect(sim.rows.length).toBeGreaterThan(0);
    for (const row of sim.rows) {
      expect(row.holes.map((h) => h.laneX)).toEqual([...CONFIG.LANES]);
      expect([...row.holes.map((h) => h.shapeIndex)].sort()).toEqual([0, 1, 2]);
    }
  });

  it("steering clamps to the road and C4 restart re-centres target AND drag state", () => {
    const sim = running();
    sim.advance({ ...IDLE, down: true, dx: 20 });
    expect(sim.dragging).toBe(true);
    expect(sim.ye).toBe(CONFIG.LANE_HALF_WIDTH);
    for (let i = 0; i < 60; i++) sim.advance(IDLE);
    expect(sim.o.laneOffset).toBeGreaterThan(1.5);
    sim.begin();
    expect(sim.ye).toBe(0);
    expect(sim.dragging).toBe(false);
    expect(sim.o.laneOffset).toBe(0);
    sim.advance(IDLE);
    expect(sim.o.laneOffset).toBe(0);
  });

  it("matches, perfects, combo multiplier, x2, and milestone bonuses follow §3.2", () => {
    const sim = running(11);
    sim.tokens = [];
    // Place a row right in front of the player with the matching shape on the centre lane.
    const row0 = sim.rows[0]!;
    row0.z = -0.1;
    row0.holes = [
      { laneX: -2.3, shapeIndex: (sim.o.shapeIndex + 1) % 3 },
      { laneX: 0, shapeIndex: sim.o.shapeIndex },
      { laneX: 2.3, shapeIndex: (sim.o.shapeIndex + 2) % 3 }
    ];
    sim.o.laneOffset = 0;
    sim.ye = 0;
    sim.advance(IDLE);
    expect(row0.resolved).toBe(true);
    expect(sim.o.matches).toBe(1);
    expect(sim.o.perfects).toBe(1);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.score).toBe(CONFIG.POINTS_PERFECT);
    expect(sim.o.ballScale).toBeCloseTo(CONFIG.PERFECT_GROW, 9);

    // Non-perfect match (offset 0.8 within HIT_WINDOW 1.2 but outside PERFECT_WINDOW 0.55) with x2 active.
    sim.o.combo = 2; // next match reaches combo 3 -> multiplier 2
    sim.o.scoreX2Timer = 3;
    const row1 = sim.rows[1]!;
    row1.z = -0.1;
    row1.holes = [
      { laneX: -2.3, shapeIndex: (sim.o.shapeIndex + 1) % 3 },
      { laneX: 0, shapeIndex: sim.o.shapeIndex },
      { laneX: 2.3, shapeIndex: (sim.o.shapeIndex + 2) % 3 }
    ];
    sim.o.laneOffset = 0.8;
    sim.ye = 0.8;
    const prevScore = sim.o.score;
    sim.advance(IDLE);
    expect(sim.o.combo).toBe(3);
    expect(sim.o.multiplier).toBe(2);
    expect(sim.o.score - prevScore).toBe(CONFIG.POINTS_GATE * 1 * 2);

    // Milestone at 750 adds +100 bonus and a popup.
    sim.o.score = CONFIG.MILESTONE - 10;
    const row2 = sim.rows[2]!;
    row2.z = -0.1;
    row2.holes = [
      { laneX: -2.3, shapeIndex: (sim.o.shapeIndex + 1) % 3 },
      { laneX: 0, shapeIndex: sim.o.shapeIndex },
      { laneX: 2.3, shapeIndex: (sim.o.shapeIndex + 2) % 3 }
    ];
    sim.o.laneOffset = 0;
    sim.ye = 0;
    sim.advance(IDLE);
    expect(sim.o.milestone).toBe(1);
    expect(sim.popups.some((p) => p.text.startsWith("MILESTONE"))).toBe(true);
  });

  it("each row resolves once against the nearest hole (C16)", () => {
    const sim = running(15);
    sim.tokens = [];
    const row = sim.rows[0]!;
    row.z = -0.1;
    row.holes = [
      { laneX: -2.3, shapeIndex: sim.o.shapeIndex },
      { laneX: 0, shapeIndex: (sim.o.shapeIndex + 1) % 3 },
      { laneX: 2.3, shapeIndex: (sim.o.shapeIndex + 2) % 3 }
    ];
    sim.o.laneOffset = 0;
    sim.ye = 0;
    sim.advance(IDLE);
    expect(row.resolved).toBe(true);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES - 1);
    // Subsequent steps while the row is still in range must not resolve it a second time.
    sim.advance(IDLE);
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES - 1);
  });

  it("tokens: morph swaps to a different shape without mutating existing wall holes; wildcard, shield, and x2 apply", () => {
    const sim = running(23);
    const snapshotHoles = sim.rows.map((r) => r.holes.map((h) => h.shapeIndex));
    const initialShape = sim.o.shapeIndex;
    sim.tokens = [
      { z: -0.05, laneX: 0, baseY: 0.9, y: 0.9, type: "morph", taken: false },
      { z: -0.05, laneX: 0, baseY: 0.9, y: 0.9, type: "wildcard", taken: false },
      { z: -0.05, laneX: 0, baseY: 0.9, y: 0.9, type: "shield", taken: false },
      { z: -0.05, laneX: 0, baseY: 0.9, y: 0.9, type: "x2", taken: false }
    ];
    sim.advance(IDLE);
    expect(sim.o.shapeIndex).not.toBe(initialShape);
    expect(sim.o.morphs).toBe(1);
    expect(sim.o.wildcardTimer).toBeGreaterThan(0);
    expect(sim.o.shieldActive).toBe(true);
    expect(sim.o.scoreX2Timer).toBeGreaterThan(0);
    // Existing walls keep their holes, and each row still has one hole matching the new shape.
    expect(sim.rows.slice(0, snapshotHoles.length).map((r) => r.holes.map((h) => h.shapeIndex))).toEqual(snapshotHoles);
    for (const r of sim.rows) {
      expect(r.holes.some((h) => h.shapeIndex === sim.o.shapeIndex)).toBe(true);
    }

    // Wildcard allows a non-matching hole to count as a match.
    const row0 = sim.rows[0]!;
    row0.z = -0.1;
    row0.holes = [
      { laneX: -2.3, shapeIndex: sim.o.shapeIndex },
      { laneX: 0, shapeIndex: (sim.o.shapeIndex + 1) % 3 },
      { laneX: 2.3, shapeIndex: (sim.o.shapeIndex + 2) % 3 }
    ];
    sim.advance(IDLE);
    expect(sim.o.matches).toBe(1);

    // When wildcard expires, shield blocks a mismatch without losing a life.
    sim.o.wildcardTimer = 0;
    const row1 = sim.rows[1]!;
    row1.z = -0.1;
    row1.holes = [
      { laneX: -2.3, shapeIndex: sim.o.shapeIndex },
      { laneX: 0, shapeIndex: (sim.o.shapeIndex + 1) % 3 },
      { laneX: 2.3, shapeIndex: (sim.o.shapeIndex + 2) % 3 }
    ];
    sim.advance(IDLE);
    expect(sim.o.shieldActive).toBe(false);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
    expect(sim.popups.some((p) => p.text === "BLOCKED")).toBe(true);
  });

  it("mismatch loses lives, enters bursting at 0 lives, and transitions to gameOver then restarts cleanly", () => {
    const sim = running(31);
    const pilot = new Autopilot({ maxDx: 14, mistakeRows: [0, 1, 2, 3, 4] });
    let sawBursting = false;
    for (let i = 1; i < 900 && sim.o.phase !== "gameOver"; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
      if (sim.o.phase === "bursting") sawBursting = true;
    }
    expect(sawBursting).toBe(true);
    expect(sim.o.phase).toBe("gameOver");
    expect(sim.player.visible).toBe(false);

    sim.advance(START);
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
    expect(sim.player.visible).toBe(true);
  });

  it("pools never exceed their caps and pool exhaustion skips spawns without consuming extra RNG draws", () => {
    const sim = running(5);
    for (const p of sim.particles) {
      p.visible = true;
      p.life = 10;
    }
    const rngBefore = sim.rng.count;
    // Trigger a morph burst while all particles are already visible: burst must skip all draws.
    sim.tokens = [{ z: -0.05, laneX: 0, baseY: 0.9, y: 0.9, type: "morph", taken: false }];
    sim.rows = Array.from({ length: POOL.rows }, (_, i) => ({
      z: -20 - i * 15,
      row: i,
      holes: [
        { laneX: -2.3, shapeIndex: 0 },
        { laneX: 0, shapeIndex: 1 },
        { laneX: 2.3, shapeIndex: 2 }
      ],
      resolved: false,
      matchedLane: -1,
      matchedShape: -1
    }));
    sim.advance(IDLE);
    // Only the 1 morph delta draw occurred; particle burst skipped its 6*16 draws and full rows pool skipped row draws.
    expect(sim.rng.count - rngBefore).toBe(1);
    expect(sim.segments.length).toBeLessThanOrEqual(POOL.segments);
    expect(sim.rows.length).toBeLessThanOrEqual(POOL.rows);
    expect(sim.tokens.length).toBeLessThanOrEqual(POOL.tokens);
    expect(sim.particles.length).toBe(POOL.particles);
  });

  it("autopilot steers to the matching hole and scores reliably", () => {
    const sim = new ShapeShiftSim(20261101);
    const pilot = new Autopilot();
    for (let i = 0; i < 900; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.matches).toBeGreaterThanOrEqual(8);
    expect(sim.o.score).toBeGreaterThan(400);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
  });
});
