import { describe, expect, it } from "vitest";
import { InputState, runInput } from "../../../examples/roadster-hours-port/input";
import { SIM_STEP, createRun, defaultCareer, stepRun } from "../../../examples/roadster-hours-port/sim";

const career = () => ({ ...defaultCareer(), unlocked: 2 });

describe("Saltwind Highway pause and restart (audit tests gap)", () => {
  it("a paused run does not advance, and resumes where it stopped", () => {
    const c = career();
    const run = createRun(0, c);
    for (let i = 0; i < 400; i++) stepRun(run, { throttle: 1 }, SIM_STEP, c);
    const at = { s: run.s, time: run.time };
    run.beforePause = run.phase; run.phase = "paused";
    const input = new InputState();
    input.keydown("KeyR");
    for (let i = 0; i < 120; i++) { stepRun(run, runInput(run, input), SIM_STEP, c); input.endStep(); }
    expect(run.s).toBe(at.s);
    expect(run.time).toBe(at.time);
    expect(run.crashes).toBe(0);
    run.phase = run.beforePause!;
    stepRun(run, { throttle: 1 }, SIM_STEP, c);
    expect(run.s).toBeGreaterThan(at.s);
  });
  it("restart gives a fresh run on the same route with the career kept", () => {
    const c = career();
    c.results.sunbreak = { time: 50, score: 1, medal: "bronze", cells: 0 };
    const run = createRun(0, c);
    for (let i = 0; i < 600; i++) stepRun(run, { throttle: 1 }, SIM_STEP, c);
    const again = createRun(0, c);
    expect(again.phase).toBe("countdown");
    expect(again.time).toBe(0);
    expect(again.score).toBe(0);
    expect(c.results.sunbreak!.time).toBe(50);
  });
});
