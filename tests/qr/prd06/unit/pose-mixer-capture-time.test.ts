// 06-PROMO: the flag-on PoseMixer path must honour `captureTime` exactly like
// the legacy `resolveAnimationSeconds` path. Before the fix it started the
// action at 0 with a 0.2 s fade-in from rest and advanced it by wall-clock dt,
// so pinned bench captures (15-animation-skinning, prd06-ik-slope) sampled a
// different pose under A3D_QR_ANIMATION (L4 run 38148470304).

import { describe, expect, it } from "vitest";
import { poseMixerCaptureTiming, resolveAnimationSeconds } from "../../../../packages/engine/src/agent-api/compiler/animation";

describe("poseMixerCaptureTiming", () => {
  it("pins loop:false captures at captureTime with no fade and a frozen clock", () => {
    const timing = poseMixerCaptureTiming({ captureTime: 1.25, loop: false }, true);
    expect(timing.startSeconds(2)).toBe(1.25);
    expect(timing.fadeSeconds).toBe(0);
    expect(timing.timeScale).toBe(0);
  });

  it("agrees with the legacy resolver for a pinned capture at any wall-clock time", () => {
    const spec = { clip: "Walk", captureTime: 1.25, loop: false } as const;
    const timing = poseMixerCaptureTiming(spec, true);
    for (const wallMs of [0, 16, 500, 4000]) {
      expect(timing.startSeconds(2)).toBeCloseTo(resolveAnimationSeconds(spec, wallMs), 9);
    }
  });

  it("clamps a pinned capture past the clip end to the clip duration", () => {
    expect(poseMixerCaptureTiming({ captureTime: 5, loop: false }, true).startSeconds(2)).toBe(2);
  });

  it("phases a looping clip by captureTime and keeps it playing", () => {
    const timing = poseMixerCaptureTiming({ captureTime: 2.5, loop: true, speed: 1.5 }, true);
    expect(timing.startSeconds(2)).toBeCloseTo(0.5, 9);
    expect(timing.timeScale).toBe(1.5);
    expect(timing.fadeSeconds).toBe(0);
  });

  it("keeps the authored crossfade when switching clips after the first", () => {
    expect(poseMixerCaptureTiming({ captureTime: 1, loop: false, crossFade: 0.3 }, false).fadeSeconds).toBe(0.3);
  });

  it("is unchanged without captureTime (startTime, default 0.2 s fade, speed)", () => {
    const timing = poseMixerCaptureTiming({ startTime: 0.4, speed: 2 }, true);
    expect(timing.startSeconds(2)).toBe(0.4);
    expect(timing.fadeSeconds).toBe(0.2);
    expect(timing.timeScale).toBe(2);
    expect(poseMixerCaptureTiming({}, true).startSeconds(2)).toBe(0);
  });
});
