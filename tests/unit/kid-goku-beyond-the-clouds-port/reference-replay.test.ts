import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOUNT_PAOZU as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { IDLE, SETTLE_FRAMES, createState, stepFrame, type StepInput } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";

/**
 * Replays the ORIGINAL's recorded input (evidence/crayon-capture/kid-goku-beyond-the-clouds-reference.json: 800 steps at 1/60 s,
 * captured on ACR with virtual time, `window.__CLOUD_RUNNER__.snapshot()` every 5 steps) through the ported simulation and compares
 * every recorded field. The original had stepped SETTLE_FRAMES idle frames before its first snapshot; the start speed pins that.
 */
interface Snap {
  step: number; s: number; lane: number; jump: number; speed: number; hearts: number; score: number; combo: number;
  balls: number[]; meat: number; falls: number; pole: number | null; finished: boolean; nimbus: { charge: number; active: boolean; call: number; time: number };
}
interface Ref {
  runShape: { startSnapshot: Snap };
  inputScript: { segments: { steps: number; input: Omit<StepInput, "brake"> }[] };
  tolerance: { s: number; lane: number; jump: number; speed: number };
  determinism: Record<string, { worst: Record<string, number>; mismatches: number }>;
  trace: Snap[];
}
const ref = JSON.parse(readFileSync("evidence/crayon-capture/kid-goku-beyond-the-clouds-reference.json", "utf8")) as Ref;
const DT = 1 / 60;

function replay(): { trace: (Snap & { step: number })[]; start: Snap } {
  const state = createState();
  for (let i = 0; i < SETTLE_FRAMES; i++) stepFrame(state, IDLE, DT, CH);
  const snap = (step: number): Snap & { step: number } => ({
    step, s: Math.round(state.s * 10) / 10, lane: state.lane, jump: state.jump, speed: state.speed, hearts: state.hearts,
    score: Math.round(state.score), combo: state.combo, balls: [...state.balls], meat: state.meat, falls: state.falls,
    pole: state.pole?.start ?? null, finished: state.finished,
    nimbus: { charge: state.nimbus.charge, active: state.nimbus.active, call: state.nimbus.call, time: state.nimbus.time }
  });
  const start = snap(0);
  const trace: (Snap & { step: number })[] = [];
  let step = 0;
  const every = (ref.trace[1]!.step - ref.trace[0]!.step) || 5;
  for (const seg of ref.inputScript.segments) {
    for (let i = 0; i < seg.steps; i++) {
      stepFrame(state, { ...seg.input, brake: false }, DT, CH);
      step++;
      if ((step - 1) % every === 0) trace.push(snap(step));
    }
  }
  return { trace, start };
}

describe("kid goku port replays the original's recorded run", () => {
  const out = replay();

  it("starts from the original's start state after the settle frames", () => {
    const s = ref.runShape.startSnapshot;
    expect(Math.abs(out.start.speed - s.speed)).toBeLessThan(1e-9);
    expect(out.start.s).toBe(s.s);
    expect(out.start.hearts).toBe(s.hearts);
  });

  it("matches every recorded trace point within the data-derived tolerance", () => {
    expect(out.trace.length).toBe(ref.trace.length);
    const worst = { s: 0, lane: 0, jump: 0, speed: 0, charge: 0 };
    ref.trace.forEach((r, i) => {
      const p = out.trace[i]!;
      expect(p.step).toBe(r.step);
      worst.s = Math.max(worst.s, Math.abs(p.s - r.s));
      worst.lane = Math.max(worst.lane, Math.abs(p.lane - r.lane));
      worst.jump = Math.max(worst.jump, Math.abs(p.jump - r.jump));
      worst.speed = Math.max(worst.speed, Math.abs(p.speed - r.speed));
      worst.charge = Math.max(worst.charge, Math.abs(p.nimbus.charge - r.nimbus.charge));
      expect(p.hearts, `hearts @${r.step}`).toBe(r.hearts);
      expect(p.combo, `combo @${r.step}`).toBe(r.combo);
      expect(p.meat, `meat @${r.step}`).toBe(r.meat);
      expect(p.falls, `falls @${r.step}`).toBe(r.falls);
      expect(p.balls, `balls @${r.step}`).toEqual(r.balls);
      expect(p.pole, `pole @${r.step}`).toBe(r.pole);
      expect(p.finished, `finished @${r.step}`).toBe(r.finished);
      expect(p.nimbus.active, `nimbus.active @${r.step}`).toBe(r.nimbus.active);
      expect(Math.abs(p.score - r.score), `score @${r.step}`).toBeLessThanOrEqual(1);
    });
    console.log(`kid-goku replay worst deltas ${JSON.stringify(worst)} over ${ref.trace.length} points`);
    expect(worst.s).toBeLessThanOrEqual(ref.tolerance.s);
    expect(worst.lane).toBeLessThanOrEqual(ref.tolerance.lane);
    expect(worst.jump).toBeLessThanOrEqual(ref.tolerance.jump);
    expect(worst.speed).toBeLessThanOrEqual(ref.tolerance.speed);
    expect(worst.charge).toBeLessThanOrEqual(1e-9);
  });

  it("the original itself repeated to float noise (the tolerance rests on that, not a guess)", () => {
    for (const name of ["openLoopReplay", "policyRepeat"]) {
      const d = ref.determinism[name]!;
      expect(Math.max(...Object.values(d.worst))).toBeLessThan(1e-9);
    }
  });

  it("the recorded run took no hit and cleared the gap: that is the verified horizon", () => {
    const last = ref.trace[ref.trace.length - 1]!;
    expect(last.hearts).toBe(3);
    expect(last.falls).toBe(0);
    expect(last.balls).toEqual([1]);
    expect(last.s).toBeGreaterThan(180);
  });
});
