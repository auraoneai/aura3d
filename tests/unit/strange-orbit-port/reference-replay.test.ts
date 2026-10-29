import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STEP, createRace, decodeInputScript, raceOrder, startCountdown, stepRace, type Input, type RaceEvent, type RaceState } from "../../../examples/strange-orbit-port/race";

/**
 * PRD §7.2 Phase A, simulation half. `evidence/crayon-capture/strange-orbit-reference.json`
 * is a remote capture of the ORIGINAL game (hook-frozen requestAnimationFrame,
 * `__orbit.advance(1/60, input)` once per step, six independent sessions that
 * agree exactly). Replaying its recorded input script through this port's
 * simulation must reproduce the original's lap count, checkpoint order, finish
 * time and race state, not merely land inside a tolerance.
 */

interface Reference {
  readonly setup: { mode: "cup"; difficulty: string; vehicle: "bike"; rider: number; courseId: string; laps: number; equipment: string; rivals: number; step: number };
  readonly script: { text: string; steps: number };
  readonly tolerance: { finishTimeSec: number; lapTimeSec: number };
  readonly reference: {
    outcome: string; steps: number; finishTime: number; lapTimes: number[]; bestLap: number;
    checkpoints: { step: number; t: number; lap: number; gate: number; name: string }[];
    routeEvents: { step: number; t: number; lap: number; s: number; text: string }[];
    gatesPassed: number; hits: number; respawns: number; nearMisses: number; dust: number; tricks: number; stunts: number; loops: number;
    score: number; place: number; medal: string;
    standings: { id: number; name: string; s: number; finished: boolean; finishTime: number | null; place: number; gap: string }[];
    hudFrames: { step: number; event: string }[];
    trace: { t: number; s: number; lane: number; speed: number; route: string; lap: number; phase: string; heading: number; energy: number; hits: number; respawns: number; air: boolean; loop: boolean; flight: boolean }[];
  };
}

const reference = JSON.parse(readFileSync("evidence/crayon-capture/strange-orbit-reference.json", "utf8")) as Reference;

interface Step { state: { t: number; s: number; lane: number; speed: number; heading: number; energy: number; hits: number; lap: number; route: string; phase: string; air: boolean; loop: boolean; flight: boolean; respawns: number }; events: RaceEvent[] }

function replay(): { race: RaceState; steps: Step[]; ran: number } {
  const { setup } = reference;
  const race = createRace({ rider: setup.rider, mode: setup.mode, difficulty: setup.difficulty, vehicle: setup.vehicle, courseId: setup.courseId, equipment: setup.equipment, balance: "original" });
  startCountdown(race);
  const steps: Step[] = [];
  let ran = 0;
  for (const input of decodeInputScript(reference.script.text)) {
    stepRace(race, input, STEP);
    ran++;
    steps.push({
      events: race.events.slice(),
      state: { t: race.time, s: race.s, lane: race.lane, speed: race.speed, heading: race.heading, energy: race.energy, hits: race.hits, lap: race.lap, route: race.route, phase: race.phase, air: !!race.air, loop: !!race.loop, flight: !!race.flight, respawns: race.respawns }
    });
    if (race.phase === "finished" || race.phase === "lost") break;
  }
  return { race, steps, ran };
}

const run = replay();

describe("the browser fixture is the evidence capture, unmodified", () => {
  it("tests/browser/data/strange-orbit-reference-replay.json carries the same script and result as the evidence file", () => {
    const slim = JSON.parse(readFileSync("tests/browser/data/strange-orbit-reference-replay.json", "utf8")) as { script: { text: string; steps: number }; setup: unknown; reference: Record<string, unknown> };
    expect(slim.script.text).toBe(reference.script.text);
    expect(slim.script.steps).toBe(reference.script.steps);
    expect(slim.setup).toEqual(reference.setup);
    for (const key of ["outcome", "steps", "finishTime", "lapTimes", "bestLap", "checkpoints", "routeEvents", "gatesPassed", "hits", "respawns", "nearMisses", "dust", "tricks", "stunts", "loops", "score", "place", "medal", "standings"] as const) {
      expect(slim.reference[key], key).toEqual((reference.reference as unknown as Record<string, unknown>)[key]);
    }
  });
});
const ref = reference.reference;

describe("replaying the original's recorded input script (Strange Orbit, 7 laps, bike, racer)", () => {
  it("the script is the recorded 17,214-step cup race", () => {
    expect(reference.setup.step).toBeCloseTo(STEP, 15);
    expect(decodeInputScript(reference.script.text)).toHaveLength(reference.script.steps);
    expect(reference.script.steps).toBe(ref.steps);
    expect(ref.outcome).toBe("finished");
  });

  it("finishes on the same step with the same finish time, bit for bit", () => {
    expect(run.race.phase).toBe("finished");
    expect(run.ran).toBe(ref.steps);
    expect(run.race.time).toBe(ref.finishTime);
    expect(Math.abs(run.race.time - ref.finishTime)).toBeLessThan(reference.tolerance.finishTimeSec);
    expect(run.race.end?.time).toBe(ref.finishTime);
  });

  it("every lap time matches (the capture rounds to 1e-6)", () => {
    expect(run.race.lapTimes).toHaveLength(ref.lapTimes.length);
    run.race.lapTimes.forEach((lap, i) => expect(lap).toBeCloseTo(ref.lapTimes[i]!, 5));
    expect(run.race.bestLap).toBeCloseTo(ref.bestLap, 5);
  });

  it("all 35 checkpoints are collected in the same order on the same steps", () => {
    const mine: { step: number; gate: number; lap: number }[] = [];
    run.steps.forEach((s, i) => s.events.forEach((ev) => {
      if (ev.type === "gate") mine.push({ step: i + 1, gate: ev.gate!, lap: s.state.lap });
    }));
    expect(mine).toHaveLength(35);
    expect(mine.map((c) => c.gate)).toEqual(ref.checkpoints.map((c) => c.gate));
    expect(mine.map((c) => c.step)).toEqual(ref.checkpoints.map((c) => c.step));
    expect(mine.map((c) => c.lap)).toEqual(ref.checkpoints.map((c) => c.lap));
    expect(run.race.gatesPassed).toBe(ref.gatesPassed);
  });

  it("route announcements fire on the same steps with the same text", () => {
    const mine: { step: number; text: string }[] = [];
    run.steps.forEach((s, i) => s.events.forEach((ev) => {
      if (ev.type === "route") mine.push({ step: i + 1, text: ev.text! });
    }));
    expect(mine).toEqual(ref.routeEvents.map((r) => ({ step: r.step, text: r.text })));
  });

  it("go and every lap announcement land on the captured HUD frames' steps", () => {
    const go: number[] = [];
    const laps: number[] = [];
    run.steps.forEach((s, i) => s.events.forEach((ev) => {
      if (ev.type === "go") go.push(i + 1);
      if (ev.type === "lap") laps.push(i + 1);
    }));
    expect(go).toEqual(ref.hudFrames.filter((f) => f.event === "go").map((f) => f.step));
    expect(laps).toEqual(ref.hudFrames.filter((f) => f.event === "lap").map((f) => f.step));
  });

  it("race counters, score, place and medal are identical", () => {
    const r = run.race;
    expect([r.hits, r.respawns, r.nearMisses, r.dust, r.tricks, r.stunts, r.loops]).toEqual([ref.hits, ref.respawns, ref.nearMisses, ref.dust, ref.tricks, ref.stunts, ref.loops]);
    expect(r.score).toBe(ref.score);
    expect(r.place).toBe(ref.place);
    expect(r.end?.medal).toBe(ref.medal);
  });

  it("the final standings match, including each rival's finish time and final distance", () => {
    const mine = raceOrder(run.race);
    expect(mine).toHaveLength(ref.standings.length);
    mine.forEach((entry, i) => {
      const want = ref.standings[i]!;
      expect([entry.id, entry.name, entry.place, entry.gap, entry.finished]).toEqual([want.id, want.name, want.place, want.gap, want.finished]);
      if (want.finishTime === null) expect(entry.finishTime).toBe(Infinity);
      else expect(entry.finishTime).toBe(want.finishTime);
      // Finished riders sit exactly on the line. A rider still racing accumulates ~17k steps of
      // Math.sin/cos/atan2; Chrome 147 (which recorded the reference) and Node's V8 can differ in
      // the last bit of those, which shows up as <1e-6 m here and nowhere in any discrete result.
      if (want.finished) expect(entry.s).toBe(want.s);
      else expect(Math.abs(entry.s - want.s)).toBeLessThan(1e-5);
    });
  });

  it("the 1 Hz state trace agrees sample for sample (rounded the way the capture rounds)", () => {
    let compared = 0;
    let lastIdx = 0;
    for (const sample of ref.trace) {
      if (sample.phase !== "racing") continue;
      let idx = -1;
      for (let i = lastIdx; i < run.steps.length; i++) {
        const st = run.steps[i]!.state;
        if (st.phase === "racing" && Math.abs(st.t - sample.t) < 0.0051) { idx = i; break; }
      }
      expect(idx, `no step near t=${sample.t}`).toBeGreaterThanOrEqual(0);
      lastIdx = idx;
      const st = run.steps[idx]!.state;
      expect(st.route).toBe(sample.route);
      expect(st.lap).toBe(sample.lap);
      expect(st.hits).toBe(sample.hits);
      expect(st.respawns).toBe(sample.respawns);
      expect([st.air, st.loop, st.flight]).toEqual([sample.air, sample.loop, sample.flight]);
      expect(Math.abs(st.s - sample.s)).toBeLessThan(0.0051 + st.speed * 0.0051);
      expect(Math.abs(st.lane - sample.lane)).toBeLessThan(0.02);
      expect(Math.abs(st.speed - sample.speed)).toBeLessThan(0.2);
      expect(Math.abs(st.heading - sample.heading)).toBeLessThan(0.002);
      expect(Math.abs(st.energy - sample.energy)).toBeLessThan(0.6);
      compared++;
    }
    expect(compared).toBeGreaterThan(200);
  });
});
