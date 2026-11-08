import { describe, expect, it } from "vitest";
import {
  CONFIG,
  IDLE,
  PolarityOrbsSim,
  TRACE_COLUMNS,
  replay,
  type Input
} from "../../../apps/showcase-polarity-orbs/src/sim";
import { Autopilot } from "../../../apps/showcase-polarity-orbs/src/autopilot";

const START: Input = { ...IDLE, start: true };
const steer = (dx: number): Input => ({ ...IDLE, down: true, dx });
const tapFlip = (): Input => ({ ...IDLE, tap: true });

const running = (seed = 7): PolarityOrbsSim => {
  const sim = new PolarityOrbsSim(seed);
  for (let i = 0; i < 10; i++) sim.advance(IDLE);
  sim.advance(START);
  return sim;
};

describe("polarity orbs sim determinism", () => {
  it("double replay produces identical traces (integers exact, floats within 1e-9)", () => {
    const script: Input[] = [START];
    for (let i = 0; i < 900; i++) {
      const dx = i % 120 < 60 ? 6 : -6;
      const tap = i % 95 === 40;
      script.push({ start: false, down: true, up: false, dx, tap });
    }
    const a = replay(42, 20, script);
    const b = replay(42, 20, script);
    expect(a.trace.length).toBe(b.trace.length);
    expect(a.trace.length).toBe(20 + script.length);
    const floatCols = new Set(
      ["distance", "speed", "laneOffset", "ballScale", "rainbowTimer", "magnetTimer", "x2"].map((c) =>
        TRACE_COLUMNS.indexOf(c as (typeof TRACE_COLUMNS)[number])
      )
    );
    for (let i = 0; i < a.trace.length; i++) {
      for (let c = 0; c < TRACE_COLUMNS.length; c++) {
        if (floatCols.has(c)) expect(Math.abs(a.trace[i]![c]! - b.trace[i]![c]!)).toBeLessThan(1e-9);
        else expect(a.trace[i]![c]).toBe(b.trace[i]![c]);
      }
    }
    expect(a.sim.o.rngCount).toBe(b.sim.o.rngCount);
  });

  it("different seeds diverge while counting every gameplay draw", () => {
    const a = replay(1, 0, [START, ...Array.from({ length: 600 }, () => IDLE)]);
    const b = replay(2, 0, [START, ...Array.from({ length: 600 }, () => IDLE)]);
    expect(a.sim.o.rngCount).toBeGreaterThan(0);
    expect(JSON.stringify(a.trace)).not.toBe(JSON.stringify(b.trace));
  });
});

describe("polarity orbs mechanics", () => {
  it("spawns 3-orb rows with ~70% mixed (>=1 of each polarity) and ~30% uniform-opposite of current polarity", () => {
    let mixedCount = 0;
    let uniformCount = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new PolarityOrbsSim(seed);
      // Test both +1 and -1 starting polarities across seeds.
      if (seed % 2 === 0) {
        sim.begin();
        sim.advance(tapFlip());
        // Respawn fresh rows under -1 polarity by clearing and re-stocking.
        for (const orb of sim.orbs) orb.active = false;
        sim.rows.length = 0;
        sim.advance(IDLE);
      } else {
        sim.begin();
      }
      expect(sim.rows.length).toBeGreaterThan(0);
      for (const row of sim.rows) {
        const rowOrbs = sim.orbs.filter((orb) => orb.active && orb.row === row.id);
        expect(rowOrbs).toHaveLength(CONFIG.ORBS_PER_ROW);
        expect(rowOrbs.map((o) => o.x)).toEqual([...CONFIG.LANES]);
        if (row.uniform) {
          uniformCount++;
          const opposite = sim.o.polarity === 1 ? -1 : 1;
          for (const orb of rowOrbs) expect(orb.polarity).toBe(opposite);
        } else {
          mixedCount++;
          expect(rowOrbs.some((o) => o.polarity === 1)).toBe(true);
          expect(rowOrbs.some((o) => o.polarity === -1)).toBe(true);
        }
      }
    }
    const total = mixedCount + uniformCount;
    expect(total).toBeGreaterThanOrEqual(200);
    const mixedRatio = mixedCount / total;
    expect(mixedRatio).toBeGreaterThan(0.55);
    expect(mixedRatio).toBeLessThan(0.85);
  });

  it("tap input flips polarity immediately with no cooldown and consumes zero gameplay RNG draws", () => {
    const sim = running(9);
    sim.advance(IDLE); // stock the horizon so no row spawns on the next two steps
    const rngBefore = sim.o.rngCount;
    expect(sim.o.polarity).toBe(1);
    expect(sim.o.flips).toBe(0);

    sim.advance(tapFlip());
    expect(sim.o.polarity).toBe(-1);
    expect(sim.o.flips).toBe(1);
    expect(sim.o.rngCount).toBe(rngBefore);

    // Immediate back-to-back flip on the very next frame (no cooldown).
    sim.advance(tapFlip());
    expect(sim.o.polarity).toBe(1);
    expect(sim.o.flips).toBe(2);
    expect(sim.o.rngCount).toBe(rngBefore);
  });

  it("matching orb collect awards +20*mult, increments combo, grows ballScale up to cap 1.6, and triggers milestone at 750", () => {
    const sim = running(11);
    for (const p of sim.powerups) p.active = false;

    const placeRowAt = (rowIndex: number, z: number, centerPolarity: 1 | -1): void => {
      const row = sim.rows[rowIndex]!;
      row.z = z;
      row.resolved = false;
      const rowOrbs = sim.orbs.filter((o) => o.active && o.row === row.id);
      for (const orb of rowOrbs) {
        orb.z = z;
        if (orb.x === 0) orb.polarity = centerPolarity;
      }
    };

    placeRowAt(0, -0.05, sim.o.polarity);
    sim.o.laneOffset = 0;
    sim.ye = 0;
    sim.advance(IDLE);
    expect(sim.o.orbsCollected).toBe(1);
    expect(sim.o.combo).toBe(1);
    expect(sim.o.mult).toBe(1);
    expect(sim.o.score).toBe(CONFIG.POINTS_ORB);
    expect(sim.o.ballScale).toBeCloseTo(CONFIG.GROW, 9);
    expect(sim.o.speed).toBeCloseTo(CONFIG.SPEED_INIT + CONFIG.SPEED_PER_COLLECT, 9);

    // Combo 3 reaches mult 2 (1 + floor(3 / 3)) and scores 20 * 2 = 40.
    sim.o.combo = 2;
    const scoreBefore = sim.o.score;
    placeRowAt(1, -0.05, sim.o.polarity);
    sim.advance(IDLE);
    expect(sim.o.combo).toBe(3);
    expect(sim.o.mult).toBe(2);
    expect(sim.o.score - scoreBefore).toBe(CONFIG.POINTS_ORB * 2);

    // Grow cap pins ballScale at 1.6 and mult caps at MAX_MULT (5).
    sim.o.ballScale = 1.59;
    sim.o.combo = 20;
    sim.o.score = CONFIG.MILESTONE - 10;
    placeRowAt(2, -0.05, sim.o.polarity);
    sim.advance(IDLE);
    expect(sim.o.ballScale).toBe(CONFIG.SCALE_CAP);
    expect(sim.o.mult).toBe(CONFIG.MAX_MULT);
    expect(sim.o.milestones).toBe(1);
    expect(sim.popups.some((p) => p.text.includes("MILESTONE"))).toBe(true);
  });

  it("wrong orb contact: shield blocks once; unshielded loses 1 life, shrinks by 0.85, resets combo, and 0 lives enters bursting -> gameOver", () => {
    const sim = running(17);
    for (const p of sim.powerups) p.active = false;
    const opposite = (sim.o.polarity === 1 ? -1 : 1) as 1 | -1;

    const placeCenterOrb = (rowIndex: number, polarity: 1 | -1): void => {
      const row = sim.rows[rowIndex]!;
      row.z = -0.05;
      row.resolved = false;
      for (const orb of sim.orbs) {
        if (orb.active && orb.row === row.id) {
          orb.z = -0.05;
          if (orb.x === 0) orb.polarity = polarity;
        }
      }
    };

    // Shield blocks wrong orb without losing a life or combo.
    sim.o.shieldActive = true;
    sim.o.combo = 4;
    sim.o.mult = 2;
    placeCenterOrb(0, opposite);
    sim.advance(IDLE);
    expect(sim.o.shieldActive).toBe(false);
    expect(sim.o.shieldBlocks).toBe(1);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
    expect(sim.o.combo).toBe(4);
    expect(sim.popups.some((p) => p.text === "BLOCKED")).toBe(true);

    // Unshielded wrong orb contact: -1 life, shrink * 0.85, combo = 0, mult = 1.
    const scaleBefore = sim.o.ballScale;
    placeCenterOrb(1, opposite);
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES - 1);
    expect(sim.o.wrongs).toBe(1);
    expect(sim.o.combo).toBe(0);
    expect(sim.o.mult).toBe(1);
    expect(sim.o.ballScale).toBeCloseTo(scaleBefore * CONFIG.SHRINK, 9);

    // Second and third wrong contacts trigger bursting -> gameOver.
    placeCenterOrb(2, opposite);
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(1);

    placeCenterOrb(3, opposite);
    sim.advance(IDLE);
    expect(sim.o.lives).toBe(0);
    expect(sim.o.phase).toBe("bursting");
    expect(sim.o.burstTimer).toBeCloseTo(CONFIG.BURST_SECONDS, 9);

    for (let i = 0; i < 80; i++) sim.advance(IDLE);
    expect(sim.o.phase).toBe("gameOver");

    // Restart from gameOver via start input.
    sim.advance(START);
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);
  });

  it("power-ups: rainbow (5s) collects both polarities, x2 (7s) doubles orb score, magnet (6s) pulls matching orbs within 3.5m", () => {
    const sim = running(23);
    for (const p of sim.powerups) p.active = false;

    // Activate rainbow, x2, and magnet powerups on the player lane.
    const pRainbow = sim.powerups[0]!;
    pRainbow.active = true;
    pRainbow.kind = "rainbow";
    pRainbow.x = 0;
    pRainbow.z = -0.05;

    const pX2 = sim.powerups[1]!;
    pX2.active = true;
    pX2.kind = "x2";
    pX2.x = 0;
    pX2.z = -0.05;

    const pMagnet = sim.powerups[2]!;
    pMagnet.active = true;
    pMagnet.kind = "magnet";
    pMagnet.x = 0;
    pMagnet.z = -0.05;

    sim.advance(IDLE);
    expect(sim.o.powerupsTaken).toBe(3);
    expect(sim.o.rainbowTimer).toBeCloseTo(CONFIG.RAINBOW_DURATION, 9);
    expect(sim.o.scoreX2Timer).toBeCloseTo(CONFIG.X2_DURATION, 9);
    expect(sim.o.magnetTimer).toBeCloseTo(CONFIG.MAGNET_DURATION, 9);

    // Place a matching orb inside 3.5m (pulled) and a matching orb outside 3.5m (not pulled) and an opposite orb inside 3.5m (not pulled).
    const nearMatch = sim.orbs[33]!;
    nearMatch.active = true;
    nearMatch.row = 999;
    nearMatch.polarity = sim.o.polarity;
    nearMatch.x = 2.3;
    nearMatch.z = -2.0; // dist = sqrt(2.3^2 + 2.0^2) = 3.048 <= 3.5

    const farMatch = sim.orbs[34]!;
    farMatch.active = true;
    farMatch.row = 999;
    farMatch.polarity = sim.o.polarity;
    farMatch.x = 2.3;
    farMatch.z = -3.2; // after step (~0.233), dist = sqrt(2.3^2 + 2.967^2) = 3.75 > 3.5

    const nearOpposite = sim.orbs[35]!;
    nearOpposite.active = true;
    nearOpposite.row = 999;
    nearOpposite.polarity = sim.o.polarity === 1 ? -1 : 1;
    nearOpposite.x = -2.3;
    nearOpposite.z = -2.0;

    sim.advance(IDLE);
    expect(nearMatch.x).toBeLessThan(2.3);
    expect(farMatch.x).toBe(2.3);
    expect(nearOpposite.x).toBe(-2.3);

    // With rainbow + x2 active, an opposite-polarity orb on lane 0 collects as a match for 20 * mult * 2 points.
    const row0 = sim.rows[0]!;
    row0.z = -0.05;
    row0.resolved = false;
    for (const orb of sim.orbs) {
      if (orb.active && orb.row === row0.id) {
        orb.z = -0.05;
        if (orb.x === 0) orb.polarity = sim.o.polarity === 1 ? -1 : 1;
      }
    }
    const prevScore = sim.o.score;
    sim.advance(IDLE);
    expect(sim.o.orbsCollected).toBe(1);
    expect(sim.o.score - prevScore).toBe(CONFIG.POINTS_ORB * sim.o.mult * 2);
  });

  it("steering clamps to the road and C4 restart re-centres steering target AND drag state", () => {
    const sim = running();
    sim.advance(steer(200));
    expect(sim.dragging).toBe(true);
    expect(sim.ye).toBe(CONFIG.LANE_LIMIT);
    for (let i = 0; i < 60; i++) sim.advance(IDLE);
    expect(sim.o.laneOffset).toBeGreaterThan(1.5);

    sim.begin();
    expect(sim.ye).toBe(0);
    expect(sim.dragging).toBe(false);
    expect(sim.o.laneOffset).toBe(0);
    // Sending dx without down after restart must not move the ball because dragging was cleared.
    sim.advance({ ...IDLE, dx: 100 });
    expect(sim.ye).toBe(0);
    expect(sim.o.laneOffset).toBe(0);
  });

  it("each row resolves once against the nearest orb (C16)", () => {
    const sim = running(15);
    for (const p of sim.powerups) p.active = false;
    const row = sim.rows[0]!;
    row.z = -0.05;
    row.resolved = false;
    const opposite = (sim.o.polarity === 1 ? -1 : 1) as 1 | -1;
    for (const orb of sim.orbs) {
      if (orb.active && orb.row === row.id) {
        orb.z = -0.05;
        orb.polarity = opposite;
      }
    }
    sim.o.laneOffset = 0;
    sim.ye = 0;
    sim.advance(IDLE);
    expect(row.resolved).toBe(true);
    expect(sim.o.rowsPassed).toBe(1);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES - 1);

    // Subsequent frames while the row and its sibling orbs are still near the player must not resolve again.
    sim.advance(IDLE);
    sim.advance(IDLE);
    expect(sim.o.rowsPassed).toBe(1);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES - 1);
  });

  it("autopilot flips on uniform-opposite rows, steers to matching orbs, scores reliably, and mistakeRows drives gameOver", () => {
    const sim = new PolarityOrbsSim(20261124);
    const pilot = new Autopilot();
    for (let i = 0; i < 900; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
    }
    expect(sim.o.phase).toBe("playing");
    expect(sim.o.orbsCollected).toBeGreaterThanOrEqual(8);
    expect(sim.o.score).toBeGreaterThan(200);
    expect(sim.o.lives).toBe(CONFIG.MAX_LIVES);

    const deadSim = new PolarityOrbsSim(20261124);
    const mistakePilot = new Autopilot({ maxDx: 14, mistakeRows: [0, 1, 2, 3, 4, 5] });
    for (let i = 0; i < 900; i++) {
      deadSim.advance(mistakePilot.next(deadSim, i));
      mistakePilot.observe(deadSim);
    }
    expect(["bursting", "gameOver"]).toContain(deadSim.o.phase);
    expect(deadSim.o.lives).toBe(0);
  });
});
