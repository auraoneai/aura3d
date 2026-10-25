import { describe, expect, it } from "vitest";
import {
  BASE_SPEED, ROAD_LENGTH, STAGES, START_DAYS, START_S, STEP, createRun, hash, roadGapAt, rollAt, runScript, sampleGap, stageAt, stageGap, stepRun,
  type RunInput
} from "../../../examples/saiyan-snake-way-port/sim";

const idle = (n: number): RunInput[] => Array.from({ length: n }, () => ({}));
const tap = (key: string): RunInput => ({ taps: [key] });

describe("Serpentine Sky Run sim: start state", () => {
  it("starts where the original's `kd()` puts the run (matches its `__TEST.status()` at frame 0)", () => {
    const S = createRun();
    expect(S.phase).toBe("run");
    expect(S.leg).toBe("out");
    expect(S.s).toBe(START_S);
    expect(S.speed).toBe(BASE_SPEED);
    expect(S.days).toBe(START_DAYS);
    expect(S.ki).toBe(0.35);
    expect(S.score).toBe(0);
    expect(S.ents).toHaveLength(0);
  });

  it("the original's first stepped frame (recorded in the exploratory capture): s ≈ -45.476, days ≈ 364.988", () => {
    const S = createRun();
    stepRun(S, {}, STEP);
    expect(S.s).toBeCloseTo(-45.476, 3);
    expect(S.days).toBeCloseTo(364.988, 3);
    expect(S.stage?.name).toBe("CHECK-IN");
  });
});

describe("Serpentine Sky Run sim: determinism and rules", () => {
  it("identical inputs give identical state (no randomness, no clock)", () => {
    const inputs = [...idle(200), tap("Space"), ...idle(60), tap("KeyD"), ...idle(120)];
    const a = runScript(inputs).state, b = runScript(inputs).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("jump leaves the ground and lands; slide is a timed state", () => {
    const S = createRun();
    stepRun(S, tap("Space"), STEP);
    expect(S.grounded).toBe(false);
    expect(S.vy).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) stepRun(S, {}, STEP);
    expect(S.grounded).toBe(true);
    stepRun(S, tap("KeyS"), STEP);
    expect(S.sliding).toBeGreaterThan(0.5);
  });

  it("lane changes clamp to -1..1 and start a dash", () => {
    const S = createRun();
    stepRun(S, tap("KeyD"), STEP);
    stepRun(S, tap("KeyD"), STEP);
    expect(S.laneTarget).toBe(1);
    expect(S.dashT).toBeGreaterThan(0);
    stepRun(S, tap("KeyA"), STEP);
    stepRun(S, tap("KeyA"), STEP);
    stepRun(S, tap("KeyA"), STEP);
    expect(S.laneTarget).toBe(-1);
  });

  it("Surge needs ki and the ground: Shift charges a power-up that becomes `on` and raises the rung", () => {
    const S = createRun();
    S.ki = 1;
    stepRun(S, tap("ShiftLeft"), STEP);
    expect(S.surge).toBe("power");
    for (let i = 0; i < 90; i++) stepRun(S, {}, STEP);
    expect(S.surge).toBe("on");
    expect(S.canFly).toBe(true);
    expect(S.auraRung).toBeGreaterThanOrEqual(1);
    expect(S.strain).toBeGreaterThan(0);
  });

  it("walking off the edge ends the run in `fall`", () => {
    const S = createRun();
    S.laneX = 7;
    S.laneTarget = 1;
    stepRun(S, {}, STEP);
    expect(S.phase).toBe("fall");
    expect(S.fallWhy).toBe("OVER THE EDGE");
    const before = S.s;
    stepRun(S, {}, STEP);
    expect(S.s).toBe(before);
  });

  it("running out of days ends the run", () => {
    const S = createRun();
    S.days = 0.001;
    stepRun(S, {}, STEP);
    expect(S.phase).toBe("over");
    expect(S.ended).toBe("TOO LATE");
  });
});

describe("Serpentine Sky Run sim: road and spawns", () => {
  it("has the original's eight stages in order, and `stageAt` picks the last one started", () => {
    expect(STAGES.map((s) => s.name)).toEqual(["CHECK-IN", "THE LONG ROAD", "TRAFFIC", "THE SERPENT HALL", "THE COILS", "THE BROKEN SPINE", "THE DROWSE", "THE END OF THE ROAD"]);
    expect(stageAt(-10).name).toBe("CHECK-IN");
    expect(stageAt(259.9).name).toBe("CHECK-IN");
    expect(stageAt(260).name).toBe("THE LONG ROAD");
    expect(stageAt(ROAD_LENGTH).name).toBe("THE END OF THE ROAD");
  });

  it("the hash matches the original's `_` (value in [0,1), position-only)", () => {
    for (const x of [0, 1, 7.13, 13.7, 5.1, 1234.5]) {
      const t = 43758.5453 * Math.sin(127.1 * x);
      expect(hash(x)).toBe(t - Math.floor(t));
      expect(hash(x)).toBeGreaterThanOrEqual(0);
      expect(hash(x)).toBeLessThan(1);
    }
  });

  it("roll sections carry a 7.6 m jump gap and the stage gap needs a positive chance", () => {
    const section = { from: 2220, len: 190, jump: 0.61 };
    const at = section.from + section.len * section.jump;
    expect(rollAt(at).gap).toBe(true);
    expect(rollAt(at + 3.7).gap).toBe(true);
    expect(rollAt(at + 3.9).gap).toBe(false);
    expect(stageGap(1000, 0)).toBe(false);
    let any = false;
    for (let s = 300; s < 1500; s += 0.5) if (stageGap(s, 0.14)) any = true;
    expect(any).toBe(true);
  });

  it("road gaps are looked up on the 3 m sample grid", () => {
    for (let s = 300; s < 1500; s += 3) {
      const mid = roadGapAt(s + 0.4);
      expect(mid).toBe(sampleGap(s));
    }
  });

  it("spawns entities within the lookahead window and recycles them behind the player", () => {
    const S = createRun();
    stepRun(S, {}, STEP);
    expect(S.ents.length).toBeGreaterThan(0);
    const farthest = Math.max(...S.ents.map((e) => e.s));
    expect(farthest).toBeLessThan(S.s + 960 + 60);
    const { state } = runScript(idle(900));
    for (const e of state.ents) expect(e.s + e.rel).toBeGreaterThanOrEqual(state.s - 40 - 1e-9);
  });
});
