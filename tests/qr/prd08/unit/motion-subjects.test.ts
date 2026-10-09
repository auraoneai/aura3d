/**
 * `motion-subjects.test.ts` — S9 subject scripts: determinism + coverage.
 * Pure-math module shared by both engines' capture paths (C-30), so the
 * pinned behavior is: identical inputs -> identical frames, sane ranges,
 * and each driver's distinguishing extra is present.
 */
import { describe, expect, it } from "vitest";
import {
  subjectFrame,
  MOTION_RAIL_POINTS,
  type MotionDriver
} from "../../../../benchmarks/quality-rebuild/motion/subject-scripts";

const DRIVERS: MotionDriver[] = ["chase", "impact", "flight", "collision", "rail", "pacing"];

describe("S9 motion subject scripts", () => {
  it("every driver produces a deterministic, finite frame", () => {
    for (const d of DRIVERS) {
      const a = subjectFrame(d, 1.234);
      const b = subjectFrame(d, 1.234);
      expect(a.subject).toEqual(b.subject);
      for (const v of a.subject) expect(Number.isFinite(v)).toBe(true);
      for (const v of a.velocity) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("chase mover is fast (>5 u/s on straights) and pacing spans 12 u/s", () => {
    const c = subjectFrame("chase", 0.5);
    expect(Math.hypot(c.velocity[0], c.velocity[1], c.velocity[2])).toBeGreaterThan(5);
    const p0 = subjectFrame("pacing", 0.1).subject[0];
    const p1 = subjectFrame("pacing", 0.6).subject[0];
    expect(Math.abs(p1 - p0) / 0.5).toBeCloseTo(12, 0); // 12 u/s shuttle
  });

  it("impact script fires exactly the 0.6–0.7 s hit window", () => {
    expect(subjectFrame("impact", 0.5).extras?.hit).toBe(false);
    expect(subjectFrame("impact", 0.65).extras?.hit).toBe(true);
    expect(subjectFrame("impact", 0.8).extras?.hit).toBe(false);
  });

  it("collision script emits the wall column pattern", () => {
    const c = subjectFrame("collision", 1);
    expect((c.extras?.colliders as number[]).length).toBe(21); // 7 columns × xyz
  });

  it("rail uses the S11 control polygon (same 6 points)", () => {
    expect(MOTION_RAIL_POINTS).toHaveLength(6);
  });
});
