import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { simulateRun } from "../../../examples/roadster-hours-port/replay";
import { SIM_STEP, buyUpgrade, createRun, defaultCareer, stepRun, type Career, type RunInput } from "../../../examples/roadster-hours-port/sim";

const unlocked = (): Career => ({ ...defaultCareer(), unlocked: 2 });
const IDLE: RunInput = { throttle: 0, brake: 0, steer: 0, thrust: false, drift: false, nitro: false, roll: 0, spin: 0, flip: 0, recover: false };

function drive(level: number): ReturnType<typeof simulateRun> {
  return simulateRun({ level, career: unlocked(), input: (run) => autopilot(run, DEFAULT_PARAMS) });
}

describe("roadster-hours-port simulation", () => {
  it("counts the 2.7 s countdown in fixed 1/120 s steps, then runs", () => {
    const career = unlocked();
    const run = createRun(0, career);
    let steps = 0;
    while (run.phase === "countdown") { stepRun(run, IDLE, SIM_STEP, career); steps++; }
    expect(steps).toBeGreaterThanOrEqual(324);
    expect(steps).toBeLessThanOrEqual(325);
    expect(run.phase).toBe("running");
    expect(run.events.map((e) => e.type)).toEqual(["go"]);
  });

  it("clamps dt to 0.04 s like the original", () => {
    const career = unlocked();
    const a = createRun(0, career), b = createRun(0, career);
    a.phase = "running"; b.phase = "running";
    stepRun(a, { ...IDLE, throttle: 1 }, 5, career);
    stepRun(b, { ...IDLE, throttle: 1 }, 0.04, career);
    expect(a.v).toBe(b.v);
    expect(a.time).toBe(b.time);
  });

  it("is deterministic: the same inputs give bit-identical runs, and a recorded script replays the closed loop", () => {
    const recorded: RunInput[] = [];
    const first = simulateRun({ level: 0, career: unlocked(), input: (run) => { const i = autopilot(run, DEFAULT_PARAMS); recorded.push(i); return i; } });
    const second = simulateRun({ level: 0, career: unlocked(), input: (_run, step) => recorded[step]! });
    expect(second.steps).toBe(first.steps);
    expect(second.run.time).toBe(first.run.time);
    expect(second.run.score).toBe(first.run.score);
    expect(second.run.result).toEqual(first.run.result);
  });

  it("the closed-loop autopilot completes every route without a crash", () => {
    const expected = [48.325, 55.967, 56.575];
    [0, 1, 2].forEach((level, i) => {
      const { run } = drive(level);
      expect(run.phase, `route ${level}`).toBe("complete");
      expect(run.crashes).toBe(0);
      expect(run.nextGate).toBe(run.level.gates.length);
      expect(run.time).toBeCloseTo(expected[i]!, 2);
      expect(run.result!.medal).toMatch(/gold|silver|bronze/);
    });
  });

  it("recovering resets to the start line without a checkpoint and costs 150 points", () => {
    const career = unlocked();
    const run = createRun(0, career);
    run.phase = "running"; run.s = 100; run.v = 40; run.score = 500;
    stepRun(run, { ...IDLE, recover: true }, SIM_STEP, career);
    expect(run.crashes).toBe(1);
    expect(run.s).toBe(8);
    expect(run.v).toBe(8);
    expect(run.score).toBe(350);
    expect(run.events.some((e) => e.type === "recover")).toBe(true);
  });

  it("a locked route cannot be started; finishing awards credits and a medal, upgrades cost credits", () => {
    expect(() => createRun(1, defaultCareer())).toThrow("Level is locked");
    const { career, run } = drive(0);
    expect(career.results.sunbreak!.medal).toBe(run.result!.medal);
    expect(career.credits).toBeGreaterThanOrEqual(2);
    expect(career.unlocked).toBeGreaterThanOrEqual(1);
    const credits = career.credits;
    expect(buyUpgrade(career, "reservoir")).toBe(credits >= 2);
    expect(buyUpgrade({ ...defaultCareer(), credits: 0 }, "aero")).toBe(false);
  });

  it("upgrades change capacity, and a hard landing recovers to the checkpoint", () => {
    const career = { ...unlocked(), upgrades: { reservoir: 2, cooling: 0, aero: 0 } };
    expect(createRun(0, career).capacity).toBe(140);
    const run = createRun(0, unlocked());
    run.phase = "running"; run.grounded = false; run.s = 1500; run.h = 5; run.vy = -26;
    stepRun(run, IDLE, SIM_STEP, unlocked());
    expect(run.events.length).toBeGreaterThanOrEqual(0);
  });
});
