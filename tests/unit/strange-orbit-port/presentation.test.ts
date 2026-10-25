import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { STEP, createRace, decodeInputScript, startCountdown, stepRace, type Input, type RaceState } from "../../../examples/strange-orbit-port/race";
import { SNAP_DISTANCE, blendShown, createOrbitPresenter, shownOf, viewOf } from "../../../examples/strange-orbit-port/presentation";

const reference = JSON.parse(readFileSync("evidence/crayon-capture/strange-orbit-reference.json", "utf8")) as {
  setup: { mode: "cup"; difficulty: string; vehicle: "bike"; rider: number; courseId: string; equipment: string };
  script: { text: string };
};
const script = decodeInputScript(reference.script.text);

const fresh = (): RaceState => {
  const { setup } = reference;
  const race = createRace({ rider: setup.rider, mode: setup.mode, difficulty: setup.difficulty, vehicle: setup.vehicle, courseId: setup.courseId, equipment: setup.equipment });
  startCountdown(race);
  return race;
};
/** Steps the race with the recorded reference input; `at` is the shared step cursor. */
const drive = (race: RaceState, cursor: { at: number }): void => {
  const input: Input = script[cursor.at] ?? {};
  cursor.at += 1;
  stepRace(race, input, STEP);
};
const runUp = (race: RaceState, steps: number, cursor: { at: number }): void => {
  for (let i = 0; i < steps; i += 1) drive(race, cursor);
};

describe("strange orbit presentation", () => {
  it("blends the rider and rivals and snaps a restart", () => {
    const a = fresh();
    runUp(a, 400, { at: 0 });
    const sa = shownOf(a);
    const sb = { ...sa, s: sa.s + 0.4, lane: sa.lane + 0.2 };
    const m = blendShown(sa, sb, 0.5);
    expect(m.s).toBeCloseTo(sa.s + 0.2, 12);
    expect(m.lane).toBeCloseTo(sa.lane + 0.1, 12);
    expect(blendShown(sa, { ...sa, s: sa.s + SNAP_DISTANCE + 1 }, 0.25).s).toBe(sa.s + SNAP_DISTANCE + 1);
  });

  it("viewOf replaces only the presented fields and leaves the race untouched", () => {
    const race = fresh();
    runUp(race, 400, { at: 0 });
    const before = JSON.stringify({ s: race.s, lane: race.lane, time: race.time, energy: race.energy });
    const view = viewOf(race, { ...shownOf(race), s: race.s + 0.05 });
    expect(view.s).toBeCloseTo(race.s + 0.05, 12);
    expect(view.energy).toBe(race.energy);
    expect(view.rivals).toHaveLength(race.rivals.length);
    expect(JSON.stringify({ s: race.s, lane: race.lane, time: race.time, energy: race.energy })).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const race = fresh();
    const cursor = { at: 0 };
    runUp(race, 400, cursor);
    const presenter = createOrbitPresenter(() => race);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      stepSeconds: STEP,
      seconds: 6,
      warmupSeconds: 1,
      step: () => drive(race, cursor),
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(race);
        return [p.s, p.lane];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented pose advances on every frame at 60, 120 and 144 Hz and is as even as the native step", () => {
    const native = gate(60, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.03);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
