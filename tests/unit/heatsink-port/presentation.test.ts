import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { expandSegments, parseInputScript } from "../../../tools/crayon-capture/heatsink-lib";
import type { Input } from "../../../examples/heatsink-port/vehicle";
import { SNAP_DISTANCE, blendShown, createHeatsinkPresenter, shownOf, stepCraftArticulation, viewOf } from "../../../examples/heatsink-port/presentation";

const reference = JSON.parse(readFileSync("evidence/crayon-capture/heatsink-reference.json", "utf8")) as { script: { text: string } };
const SCRIPT = expandSegments(parseInputScript(reference.script.text));

const shown = (x: number) => ({ position: { x, y: 2, z: 0 }, s: x, theta: 0, pitch: 0, lean: 0, v: 50, bolts: [{ alive: true, x, y: 2, z: 0 }, { alive: false, x: 0, y: 0, z: 0 }] });

const racing = (): { race: Race; step: () => void } => {
  const race = new Race();
  let at = 0;
  const step = (): void => race.frame(FRAME, SCRIPT[Math.min(at++, SCRIPT.length - 1)] as Input);
  for (let i = 0; i < 700; i += 1) step();
  return { race, step };
};

describe("heatsink presentation", () => {
  it("blends the drone and live bolts and snaps a respawn", () => {
    const m = blendShown(shown(10), shown(11), 0.5);
    expect(m.position.x).toBeCloseTo(10.5, 12);
    expect(m.bolts[0]!.x).toBeCloseTo(10.5, 12);
    expect(m.bolts[1]!.alive).toBe(false);
    expect(blendShown(shown(10), shown(10 + SNAP_DISTANCE + 5), 0.5).position.x).toBe(10 + SNAP_DISTANCE + 5);
  });

  it("viewOf replaces only the presented fields and leaves the race untouched", () => {
    const { race } = racing();
    const before = JSON.stringify({ x: race.player.position.x, s: race.player.s, v: race.player.v, score: race.ops.score });
    const view = viewOf(race, { ...shownOf(race), s: race.player.s + 1, v: 99 });
    expect(view.player.s).toBeCloseTo(race.player.s + 1, 12);
    expect(view.player.v).toBe(99);
    expect(view.player.heat).toBe(race.player.heat);
    expect(view.ops.score).toBe(race.ops.score);
    expect(JSON.stringify({ x: race.player.position.x, s: race.player.s, v: race.player.v, score: race.ops.score })).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const { race, step } = racing();
    const presenter = createHeatsinkPresenter(() => race);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      stepSeconds: FRAME,
      seconds: 6,
      warmupSeconds: 1,
      step,
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(race);
        return [p.position.x, p.position.z];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented drone advances on every frame at 60, 120 and 144 Hz and is as even as the native step", () => {
    const native = gate(60, true);
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.03);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });

  it("wraps `s` modularly across `track.length -> 0` for player and bots without backward lap snaps", () => {
    const len = 7554;
    const a = {
      ...shown(0),
      trackLength: len,
      position: { x: 657, y: 5.3, z: 513 },
      s: len - 2,
      theta: Math.PI - 0.04,
      x: -7,
      yW: 5.3,
      bots: [{ position: { x: 650, y: 5.3, z: 510 }, s: len - 3, x: 4, y: 5.3, theta: -Math.PI + 0.03, pitch: 0.02, lean: -0.05, v: 90 }]
    };
    const b = {
      ...shown(0),
      trackLength: len,
      position: { x: 655, y: 5.3, z: 511 },
      s: 2,
      theta: -Math.PI + 0.04,
      x: -6.5,
      yW: 5.35,
      bots: [{ position: { x: 648, y: 5.3, z: 508 }, s: 1, x: 4.2, y: 5.32, theta: Math.PI - 0.03, pitch: 0.01, lean: -0.04, v: 92 }]
    };
    const q1 = blendShown(a, b, 0.25);
    const mid = blendShown(a, b, 0.5);
    const q3 = blendShown(a, b, 0.75);
    expect(q1.s).toBeCloseTo(len - 1, 9);
    expect(mid.s % len).toBeCloseTo(0, 9);
    expect(q3.s).toBeCloseTo(1, 9);
    expect(Math.cos(mid.theta)).toBeCloseTo(-1, 4);
    expect(mid.x).toBeCloseTo(-6.75, 9);
    expect(mid.yW).toBeCloseTo(5.325, 9);
    expect(mid.bots![0]!.s).toBeCloseTo(len - 1, 9);
    expect(q3.bots![0]!.s % len).toBeCloseTo(0, 9);
  });

  it("advances `viewOf(race, shown)` monotonically across the grid start line (`s = track.length - 25 -> 0`)", () => {
    const race = new Race();
    const presenter = createHeatsinkPresenter(() => race);
    for (let i = 0; i < 194; i++) {
      race.frame(FRAME, { throttle: 1, brake: 0, steer: 0, afterburner: false, ramjet: false, drift: false, fire: false });
      presenter.afterStep();
    }
    let crossedZero = false;
    let prevS = presenter.present({ alpha: 0 }).s;
    for (let step = 0; step < 120; step++) {
      race.frame(FRAME, { throttle: 1, brake: 0, steer: 0, afterburner: true, ramjet: false, drift: false, fire: false });
      presenter.afterStep();
      for (const alpha of [0.25, 0.5, 0.75, 1]) {
        const view = viewOf(race, presenter.present({ alpha }));
        const ds = race.track.wrapDelta(view.player.s, prevS);
        expect(ds).toBeGreaterThanOrEqual(-1e-6);
        expect(ds).toBeLessThan(5);
        if (prevS > race.track.length - 20 && view.player.s < 20) crossedZero = true;
        prevS = view.player.s;
      }
    }
    expect(crossedZero).toBe(true);
  });

  it("damps `nozzleScale` exponentially instead of snapping on boost toggle", () => {
    const state = { rotorAngle: 0, flapPitch: 0, flapRoll: 0 };
    const idle = stepCraftArticulation(state, 1 / 60, 0.5, 0, false, 0);
    const boosted = stepCraftArticulation(state, 1 / 60, 0.5, 1, false, 0);
    expect(boosted.nozzleScale).toBeGreaterThan(idle.nozzleScale);
    expect(boosted.nozzleScale).toBeLessThan(1.32);
  });
});
