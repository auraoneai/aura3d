import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/motionGate";
import { createFixedStepPresenter } from "../../../packages/game/src/motion/presenter";
import { PARKS, SIM_STEP, stepFlight, type Vec3 } from "../../../apps/showcase-aura-diamond-3d/src/rules";

/**
 * Motion gate for the drawn ball (tests gap "no motion-gate result exists for this game", C14): the game steps the batted ball
 * at 1/120 s with rules.ts stepFlight and draws it through a fixed-step presenter. A deep fly in Lunar Park stays in the air for
 * the whole window, so every frame should move it by a steady amount on 60, 120 and 144 Hz displays.
 */
describe("aura-diamond-3d ball motion gate", () => {
  for (const hz of [60, 120, 144]) {
    it(`a fly ball is drawn smoothly at ${hz} Hz`, () => {
      const park = PARKS.lunar;
      const ball = { pos: [0, 1, 0.3] as Vec3, vel: [4, 14, -26] as Vec3, crossedFence: false, hrCrossed: false, wallHit: false };
      const presenter = createFixedStepPresenter<{ p: Vec3 }>({
        snapshot: () => ({ p: [...ball.pos] as Vec3 }),
        blend: (a, b, t) => ({ p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t] })
      });
      let alphaSource = { alpha: 0 };
      const report = runMotionGate({
        displayHz: hz,
        seconds: 3,
        stepSeconds: SIM_STEP,
        jitterSeconds: 0.0015,
        step: (h) => {
          stepFlight(ball, park, h);
        },
        afterStep: () => presenter.afterStep(),
        drawn: (alpha) => {
          alphaSource = { alpha };
          const p = presenter.present(alphaSource).p;
          return [p[0], p[2]];
        }
      });
      expect(ball.pos[1]).toBeGreaterThan(0.5);
      expect(report.failures).toEqual([]);
      expect(report.passed).toBe(true);
    });
  }
});
