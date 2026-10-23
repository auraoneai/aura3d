import { describe, expect, it } from "vitest";
import { diffRunEvents, type AudioFrame } from "../../../examples/roadster-hours-port/audio";

const base: AudioFrame = {
  phase: "running", countdown: 0, speed: 40, grounded: true, boosting: false, nitro: 0, nextGate: 0, cells: 0, crashes: 0,
  cleanLandings: 0, nearMisses: 0, combos: 0, vehiclesCleared: 0, throttle: true
};

describe("roadster-hours-port audio events", () => {
  it("emits nothing for the first frame and for an unchanged frame", () => {
    expect(diffRunEvents(null, base)).toEqual([]);
    expect(diffRunEvents(base, { ...base })).toEqual([]);
  });

  it("beeps on each countdown second and plays go when the route starts", () => {
    const a: AudioFrame = { ...base, phase: "countdown", countdown: 2.1 };
    expect(diffRunEvents(a, { ...a, countdown: 1.9 })).toEqual(["beep"]);
    expect(diffRunEvents(a, { ...a, countdown: 2.05 })).toEqual([]);
    expect(diffRunEvents({ ...a, countdown: 0.02 }, { ...base })).toEqual(["go"]);
  });

  it("maps counter increments to their sounds", () => {
    expect(diffRunEvents(base, { ...base, nextGate: 1 })).toEqual(["gate"]);
    expect(diffRunEvents(base, { ...base, cells: 1 })).toEqual(["cell"]);
    expect(diffRunEvents(base, { ...base, crashes: 1 })).toEqual(["crash"]);
    expect(diffRunEvents(base, { ...base, cleanLandings: 1 })).toEqual(["landing"]);
    expect(diffRunEvents(base, { ...base, nearMisses: 1 })).toEqual(["nearmiss"]);
    expect(diffRunEvents(base, { ...base, vehiclesCleared: 3 })).toEqual(["clear"]);
    expect(diffRunEvents(base, { ...base, boosting: true })).toEqual(["boost"]);
    expect(diffRunEvents(base, { ...base, cells: 2, crashes: 1 })).toEqual(["cell", "crash"]);
  });

  it("plays only the finish fanfare when the route completes", () => {
    expect(diffRunEvents(base, { ...base, phase: "complete", nextGate: 9, cells: 4 })).toEqual(["finish"]);
    expect(diffRunEvents({ ...base, phase: "complete" }, { ...base, phase: "complete" })).toEqual([]);
  });

  it("does not repeat the boost sound while boosting continues", () => {
    expect(diffRunEvents({ ...base, boosting: true }, { ...base, boosting: true })).toEqual([]);
  });
});
