import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { DT, actionDepart, actionDoors, createState, step, type RouteData, type SimData, type Tables } from "../../../examples/last-train-port/sim";
import { BACKWARD_SNAP, blendShown, createTramPresenter, shownOf, viewOf } from "../../../examples/last-train-port/presentation";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

const shown = (distance: number, leg = 0) => ({ leg, distance, speed: 10, roll: 0 });

describe("last train presentation", () => {
  it("blends the tram pose and snaps a new leg or a restart", () => {
    expect(blendShown(shown(10), shown(10.2), 0.5).distance).toBeCloseTo(10.1, 12);
    expect(blendShown(shown(120), shown(0, 1), 0.5).distance).toBe(0);
    expect(blendShown(shown(120), shown(0), 0.5).distance).toBe(0);
    expect(BACKWARD_SNAP).toBeGreaterThan(0);
  });

  it("viewOf replaces only the presented fields and leaves the sim untouched", () => {
    const sim = createState();
    const before = JSON.stringify(sim);
    const view = viewOf(sim, { ...shownOf(sim), distance: 42, roll: 0.1 });
    expect(view.distance).toBe(42);
    expect(view.roll).toBe(0.1);
    expect(view.phase).toBe(sim.phase);
    expect(JSON.stringify(sim)).toBe(before);
  });

  const drive = () => {
    const sim = createState();
    step(sim, DT, {}, data);
    if (sim.phase === "docked") actionDoors(sim);
    for (let i = 0; i < 4000 && sim.phase !== "ready"; i += 1) step(sim, DT, {}, data);
    actionDepart(sim);
    for (let i = 0; i < 600; i += 1) step(sim, DT, { accelerate: true }, data);
    return sim;
  };
  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const sim = drive();
    const presenter = createTramPresenter(() => sim);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      stepSeconds: DT,
      seconds: 6,
      warmupSeconds: 1,
      step: () => step(sim, DT, { accelerate: true }, data),
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(sim);
        return [p.distance, p.roll];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented tram advances on every frame at 60, 120 and 144 Hz and is as even as the native step", () => {
    const native = gate(60, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.03);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
