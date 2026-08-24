import { describe, expect, it } from "vitest";
import {
  SIGN_HANG,
  SIGN_SPRING,
  createHangingNeonSigns,
  isSpringJointSignSettled,
  signMinimumLaneDistanceX,
  stepSpringJointSign
} from "../../../apps/aura-clash-showcase/src/playable/arena/SpringJointSigns";

const FRAME_DT = 1 / 60;

describe("AC-A5 spring-joint hanging signs", () => {
  it("settles deterministically to the same rest state from mirrored displacements", () => {
    const settle = (angle: number): { angle: number; angularVelocity: number } => {
      let state = { angle, angularVelocity: 0 };
      for (let index = 0; index < 900; index += 1) {
        state = stepSpringJointSign(state, 0, FRAME_DT);
      }
      return state;
    };
    const positive = settle(0.3);
    const negative = settle(-0.3);
    expect(isSpringJointSignSettled(positive)).toBe(true);
    expect(isSpringJointSignSettled(negative)).toBe(true);
    expect(Math.abs(positive.angle)).toBeLessThan(SIGN_SPRING.settleEpsilon);
    // Symmetric starts converge to the same (rest) state — no drift, no bias.
    expect(Math.abs(positive.angle - negative.angle)).toBeLessThan(SIGN_SPRING.settleEpsilon);
  });

  it("reproduces identical trajectories for identical inputs", () => {
    const run = (): number[] => {
      let state = { angle: 0.2, angularVelocity: 0.4 };
      const trace: number[] = [];
      for (let index = 0; index < 120; index += 1) {
        state = stepSpringJointSign(state, index === 10 ? 0.5 : 0, FRAME_DT);
        trace.push(Number(state.angle.toFixed(8)));
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it("clamps deflection so a slam can never fling a sign into the combat lane", () => {
    // Fighters clamp at |x| <= 2.85; the closest sign surface must stay past that with margin.
    const laneClampX = 2.85;
    const minimum = signMinimumLaneDistanceX();
    expect(minimum).toBeGreaterThan(laneClampX);
    // Even a pathological impulse is hard-clamped by maxAbsAngle.
    let state = { angle: 0, angularVelocity: 0 };
    for (let index = 0; index < 30; index += 1) {
      state = stepSpringJointSign(state, 500, FRAME_DT);
      expect(Math.abs(state.angle)).toBeLessThanOrEqual(SIGN_SPRING.maxAbsAngle + 1e-9);
    }
    // The geometry constants used by the excursion math stay coherent.
    expect(SIGN_HANG.pivotX).toBeGreaterThan(minimum);
  });

  it("disables spring motion under reduced motion but keeps rendering", () => {
    const signs = createHangingNeonSigns();
    for (let index = 0; index < 20; index += 1) {
      signs.step({ dt: FRAME_DT, slamImpulse: 1.2, reducedMotion: true });
    }
    const states = signs.states();
    expect(states.every(isSpringJointSignSettled)).toBe(true);
    // Signs remain visible set dressing; reduced motion freezes them, it does not remove them.
    const items = signs.collect({ reducedMotion: true });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(String(item.label)).toContain("hanging-sign-");
    }
  });

  it("reacts to a slam impulse and then settles again without one", () => {
    const signs = createHangingNeonSigns();
    signs.step({ dt: FRAME_DT, slamImpulse: 1.1, reducedMotion: false });
    const excited = signs.states().some((state) => Math.abs(state.angularVelocity) > 0 || state.angle !== 0);
    expect(excited, "a slam must move the springs").toBe(true);
    for (let index = 0; index < 900; index += 1) {
      signs.step({ dt: FRAME_DT, slamImpulse: 0, reducedMotion: false });
    }
    expect(signs.states().every(isSpringJointSignSettled)).toBe(true);
  });
});
