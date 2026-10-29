import { describe, expect, it } from "vitest";
import { CUES, diffRunEvents, eventCues, musicSteps, type AudioFrame, type GameSound } from "../../../examples/roadster-hours-port/audio";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { SIM_STEP, createRun, defaultCareer, stepRun, type RunEvent } from "../../../examples/roadster-hours-port/sim";

const base: AudioFrame = {
  phase: "running", countdown: 0, speed: 40, grounded: true, boosting: false, nitro: 0, nextGate: 0, cells: 0, crashes: 0,
  cleanLandings: 0, nearMisses: 0, combos: 0, vehiclesCleared: 0, throttle: true, gateMiss: false, overheated: false
};

describe("roadster-hours-port audio: frame cues", () => {
  it("emits nothing for the first frame and for an unchanged frame", () => {
    expect(diffRunEvents(null, base)).toEqual([]);
    expect(diffRunEvents(base, { ...base })).toEqual([]);
  });

  it("beeps on each countdown second", () => {
    const a: AudioFrame = { ...base, phase: "countdown", countdown: 2.1 };
    expect(diffRunEvents(a, { ...a, countdown: 1.9 })).toEqual(["beep"]);
    expect(diffRunEvents(a, { ...a, countdown: 2.05 })).toEqual([]);
  });

  it("plays boost on thrust start, miss on a missed relay and overheat once", () => {
    expect(diffRunEvents(base, { ...base, boosting: true })).toEqual(["boost"]);
    expect(diffRunEvents({ ...base, boosting: true }, { ...base, boosting: true })).toEqual([]);
    expect(diffRunEvents(base, { ...base, gateMiss: true })).toEqual(["miss"]);
    expect(diffRunEvents({ ...base, gateMiss: true }, { ...base, gateMiss: true })).toEqual([]);
    expect(diffRunEvents(base, { ...base, overheated: true })).toEqual(["overheat"]);
  });

  it("leaves counter changes to the sim events (no double cue)", () => {
    expect(diffRunEvents(base, { ...base, nextGate: 1, cells: 1, crashes: 1 })).toEqual([]);
  });
});

describe("roadster-hours-port audio: sim event cues (audit C6)", () => {
  const cue = (e: RunEvent): GameSound[] => eventCues([e]);
  it("maps every sim event type to a cue", () => {
    expect(cue({ type: "go" })).toEqual(["go"]);
    expect(cue({ type: "checkpoint", index: 0 })).toEqual(["gate"]);
    expect(cue({ type: "cell", index: 0 })).toEqual(["cell"]);
    expect(cue({ type: "recover", reason: "RECOVERED" })).toEqual(["crash"]);
    expect(cue({ type: "land", clean: true })).toEqual(["landing"]);
    expect(cue({ type: "land", clean: false })).toEqual(["landed"]);
    expect(cue({ type: "landingFlare" })).toEqual(["flare"]);
    expect(cue({ type: "closePass", clear: 1 })).toEqual(["nearmiss"]);
    expect(cue({ type: "combo", count: 2 })).toEqual(["combo"]);
    expect(cue({ type: "lineup", count: 3 })).toEqual(["clear"]);
    expect(cue({ type: "scrape" })).toEqual(["scrape"]);
    expect(cue({ type: "impact" })).toEqual(["impact"]);
    expect(cue({ type: "trick", kind: "spin" })).toEqual(["trick"]);
    expect(cue({ type: "roll" })).toEqual(["roll"]);
    expect(cue({ type: "hop", piece: "sedan" })).toEqual(["hop"]);
    expect(cue({ type: "trailer" })).toEqual(["trailer"]);
    expect(cue({ type: "nitro", level: 1 })).toEqual(["nitro"]);
    expect(cue({ type: "nitro", level: 2 })).toEqual(["perfect"]);
    expect(cue({ type: "nitro", level: 3 })).toEqual(["shockwave"]);
    expect(cue({ type: "reward", label: "ROOFLINE CUT" })).toEqual(["shortcut"]);
    expect(cue({ type: "reward", label: "DATA CELL" })).toEqual([]);
  });

  it("plays each sound at most once per frame, and the finish alone", () => {
    expect(eventCues([{ type: "impact" }, { type: "impact" }, { type: "scrape" }])).toEqual(["impact", "scrape"]);
    expect(eventCues([{ type: "checkpoint" }, { type: "reward", label: "ROUTE COMPLETE" }, { type: "finish" }])).toEqual(["finish"]);
  });

  it("every cue has a sound", () => {
    for (const s of ["landed", "scrape", "impact", "overheat", "trick", "roll", "hop", "trailer", "shortcut", "nitro", "perfect", "shockwave", "miss", "flare"] as const) {
      expect(CUES[s].layers.length).toBeGreaterThan(0);
    }
  });
});

describe("roadster-hours-port finish fanfare (audit C4)", () => {
  it("the step that completes the run yields the finish cue from the collected events", () => {
    const career = { ...defaultCareer(), unlocked: 2 };
    const run = createRun(0, career);
    const collected: RunEvent[] = [];
    let steps = 0;
    while (run.phase !== "complete" && steps < 20_000) {
      stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
      collected.push(...run.events);
      steps++;
    }
    expect(run.phase).toBe("complete");
    // The final step's events (what the page drains on the results screen) carry the fanfare.
    expect(eventCues(run.events)).toEqual(["finish"]);
    expect(collected.filter((e) => e.type === "finish")).toHaveLength(1);
  });
});

describe("roadster-hours-port music scheduler (audit C8)", () => {
  it("schedules ahead normally", () => {
    const plan = musicSteps(1.0, 0.9, 0.3);
    expect(plan.times).toEqual([1.0]);
    expect(plan.nextAt).toBeCloseTo(1.3, 9);
  });
  it("skips steps that are already late after a throttled tick instead of starting them all at once", () => {
    // A hidden tab ran the 40 ms timer once a second: 3+ steps are in the past.
    const plan = musicSteps(1.0, 2.0, 0.3);
    expect(plan.times.every((t) => t >= 2.0)).toBe(true);
    expect(plan.times.length).toBeLessThanOrEqual(1);
    expect(plan.times[0]).toBeCloseTo(2.05, 9);
  });
});
