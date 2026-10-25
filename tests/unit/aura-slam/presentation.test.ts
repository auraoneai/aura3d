import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { RESTART_DROP, SNAP_DISTANCE, blendShown, createMatchPresenter, shownOf, viewOf } from "../../../examples/aura-slam/shell/presentation";
import { playedEngine } from "./ui-original";

const STEP = 1 / 60;

describe("aura slam presentation", () => {
  it("blends the ball and athletes, takes angles by the short arc and snaps a point reset", () => {
    const engine = playedEngine(90);
    const a = shownOf(engine.state);
    const b = { ...a, time: a.time + STEP, ball: { ...a.ball, x: a.ball.x + 0.02 }, player: { ...a.player, x: a.player.x + 0.01, facing: a.player.facing + 0.1 } };
    const m = blendShown(a, b, 0.5);
    expect(m.ball.x).toBeCloseTo(a.ball.x + 0.01, 12);
    expect(m.player.x).toBeCloseTo(a.player.x + 0.005, 12);
    expect(blendShown(a, { ...b, ball: { ...b.ball, y: b.ball.y + SNAP_DISTANCE + 1 } }, 0.5).ball.y).toBe(b.ball.y + SNAP_DISTANCE + 1);
    const wrap = blendShown({ ...a, player: { ...a.player, facing: Math.PI - 0.1 } }, { ...b, player: { ...a.player, facing: -Math.PI + 0.1 } }, 0.5);
    expect(Math.abs(Math.abs(wrap.player.facing) - Math.PI)).toBeLessThan(1e-9);
  });

  it("a timer that restarts (a new swing) shows the new value instead of blending through the old one", () => {
    const engine = playedEngine(90);
    const a = shownOf(engine.state);
    const old = { ...a, player: { ...a.player, swingAge: 0.4 } };
    const fresh = { ...a, player: { ...a.player, swingAge: 0 } };
    expect(0.4 - 0).toBeGreaterThan(RESTART_DROP);
    expect(blendShown(old, fresh, 0.5).player.swingAge).toBe(0);
  });

  it("viewOf replaces only the presented fields and never changes the engine state", () => {
    const engine = playedEngine(90);
    const before = JSON.stringify(engine.state);
    const shown = shownOf(engine.state);
    const view = viewOf(engine.state, { ...shown, time: shown.time + 0.01, ball: { ...shown.ball, x: shown.ball.x + 0.5 } });
    expect(view.ball.x).toBeCloseTo(shown.ball.x + 0.5, 12);
    expect(view.ball.active).toBe(engine.state.ball.active);
    expect(view.player.controller).toBe(engine.state.player.controller);
    expect(view.score).toBe(engine.state.score);
    expect(JSON.stringify(engine.state)).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const engine = playedEngine(2);
    let n = 0;
    const presenter = createMatchPresenter(() => engine.state);
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 3,
      warmupSeconds: 0.5,
      step: () => {
        if (n % 120 === 40) engine.requestSwing("player", engine.state.time, false);
        n += 1;
        engine.step(STEP);
      },
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const s = interpolate ? presenter.present({ alpha }) : shownOf(engine.state);
        return [s.player.x, s.player.y, s.ai.x, s.ai.y, s.time];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented clock, ball and athletes advance on every frame at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
