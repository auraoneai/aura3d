/**
 * X-3: byte-parity adapters — lean's `1 - exp(-rate·dt)` follow curve and
 * seeded trauma shake must be reproduced exactly (no re-tune).
 */
import { describe, expect, it } from "vitest";
import { createLeanCameraRigAdapter, createLeanGameFeelAdapter } from "@aura3d/engine/lanes";

const leanFollow = (cur: number, tgt: number, rate: number, dt: number): number =>
  cur + (tgt - cur) * (1 - Math.exp(-rate * dt));

describe("X-3 createLeanCameraRigAdapter", () => {
  it("follow matches 1 - exp(-rate·dt) per axis within float64 noise", () => {
    const rig = createLeanCameraRigAdapter({ offset: [0, 1.6, 6.4], smoothing: 6 });
    let cur: readonly [number, number, number] = rig.position;
    let focus: readonly [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 120; i += 1) {
      const dt = i % 7 === 0 ? 1 / 30 : 1 / 60; // variable dt like lean
      const expected = leanFollow(cur[0], focus[0] + 0, 6, dt);
      const got = rig.follow(focus, dt);
      expect(got[0]).toBeCloseTo(expected, 12);
      expect(Math.abs(got[1] - (cur[1] + (1.6 - cur[1]) * (1 - Math.exp(-6 * dt))))).toBeLessThan(1e-12);
      cur = got;
      focus = [focus[0] + 0.5, focus[1], focus[2] - 0.25];
    }
    expect(rig.position[0]).toBeCloseTo(cur[0], 12);
  });

  it("snap teleports to focus + offset", () => {
    const rig = createLeanCameraRigAdapter({ kind: "top-down-follow", smoothing: 4 });
    expect(rig.snap([2, 0, 3])).toEqual([2, 9, 3.001]);
  });
});

describe("X-3 createLeanGameFeelAdapter", () => {
  it("reproduces the seeded hash shake trajectory byte-identically", () => {
    const a = createLeanGameFeelAdapter({ traumaDecay: 1.6, maxShake: 0.25 });
    const b = createLeanGameFeelAdapter({ traumaDecay: 1.6, maxShake: 0.25 });
    a.addTrauma(0.7); b.addTrauma(0.7);
    for (let i = 0; i < 60; i += 1) {
      const ra = a.update(1 / 60);
      const rb = b.update(1 / 60);
      expect(ra.trauma).toBe(rb.trauma);
      expect(ra.shake).toEqual(rb.shake);
    }
    // Deterministic check against the recorded lean values (seed = tick 1).
    const c = createLeanGameFeelAdapter({ traumaDecay: 1.6, maxShake: 0.25 });
    c.addTrauma(0.7);
    const f = c.update(1 / 60);
    const px = Math.sin(12.9898) * 43758.5453;
    const py = Math.sin(78.233) * 12543.1234;
    const mag = (0.7 - 1.6 / 60) ** 2 * 0.25;
    expect(f.shake[0]).toBeCloseTo((px - Math.floor(px) - 0.5) * 2 * mag, 12);
    expect(f.shake[1]).toBeCloseTo((py - Math.floor(py) - 0.5) * 2 * mag, 12);
  });

  it("hitStop freezes output for hitStopDuration then resumes decay", () => {
    const feel = createLeanGameFeelAdapter({ hitStopDuration: 0.1, traumaDecay: 1 });
    feel.addTrauma(0.5);
    feel.hitStop();
    for (let i = 0; i < 5; i += 1) {
      const f = feel.update(1 / 60);
      expect(f.frozen).toBe(true);
      expect(f.trauma).toBe(0.5);
      expect(f.shake).toEqual([0, 0]);
    }
    let resumed = feel.update(0);
    for (let i = 0; i < 10 && resumed.frozen; i += 1) resumed = feel.update(1 / 60);
    expect(resumed.frozen).toBe(false);
    expect(feel.update(1 / 60).trauma).toBeLessThan(0.5);
  });
});
