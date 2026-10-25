import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { expandSegments, parseInputScript } from "../../../tools/crayon-capture/heatsink-lib";
import type { Input } from "../../../examples/heatsink-port/vehicle";
import { SNAP_DISTANCE, blendShown, createHeatsinkPresenter, shownOf, viewOf } from "../../../examples/heatsink-port/presentation";

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
});
