import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { CUMULUS_RIDGE } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { Game } from "../../../examples/kid-goku-beyond-the-clouds-port/game";
import { IDLE, createState, stepFrame } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";
import { SNAP_DISTANCE, blendShown, createGoPresenter, shownOf, viewOf } from "../../../examples/kid-goku-beyond-the-clouds-port/presentation";

const STEP = 1 / 60;
const shown = (s: number, lane = 0) => ({ s, lane, laneVelocity: 0, jump: 0, speed: 14, falling: null });

describe("Cumulus Dash presentation", () => {
  it("blends position and snaps a respawn or retry", () => {
    expect(blendShown(shown(0), shown(0.4), 0.5).s).toBeCloseTo(0.2, 12);
    expect(blendShown(shown(100), shown(10), 0.25).s).toBe(10);
    expect(SNAP_DISTANCE).toBeGreaterThan(1);
  });

  it("blends the fall pose and takes null when a fall starts or ends", () => {
    const a = { ...shown(1), falling: { t: 0, y: 0, s: 1, lane: 0, jump: 0 } };
    const b = { ...shown(1), falling: { t: 0.2, y: -2, s: 1, lane: 0, jump: 0 } };
    expect(blendShown(a, b, 0.5).falling?.y).toBeCloseTo(-1, 12);
    expect(blendShown(shown(1), b, 0.5).falling?.y).toBe(-2);
  });

  it("viewOf shows the presented pose through the real game's other fields and never changes the game", () => {
    const game = new Game(CUMULUS_RIDGE, 0, 0);
    game.start(0);
    const before = game.state.s;
    const view = viewOf(game, { ...shownOf(game), s: 55, jump: 1.5 });
    expect(view.state.s).toBe(55);
    expect(view.state.jump).toBe(1.5);
    expect(view.state.hearts).toBe(game.state.hearts);
    expect(view.phase).toBe(game.phase);
    expect(game.state.s).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const state = createState(0);
    const holder = { state, falling: null } as unknown as Game;
    const presenter = createGoPresenter(() => holder);
    state.speed = CUMULUS_RIDGE.speed;
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 8,
      warmupSeconds: 2,
      step: () => {
        stepFrame(state, { ...IDLE, steer: Math.sin(state.s * 0.05) }, STEP, CUMULUS_RIDGE);
      },
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const p = interpolate ? presenter.present({ alpha }) : shownOf(holder);
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
      expect(Math.abs(report.cv - native.cv)).toBeLessThan(0.02);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
