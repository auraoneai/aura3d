/**
 * Q-1 centripetal Catmull-Rom spline (PRD-08).
 */
import { describe, expect, it } from "vitest";
import { createSpline } from "@aura3d/engine/lanes";
import type { AuraVec3 } from "@aura3d/engine";

const open: readonly AuraVec3[] = [
  [0, 0, 0],
  [2, 1, 0],
  [5, 1, 3],
  [8, 0, 3]
];

function angleDeg(a: AuraVec3, b: AuraVec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

describe("AuraCameraSpline (open)", () => {
  const spline = createSpline(open);

  it("passes through every control point (raw param s = i/segments)", () => {
    for (let i = 0; i < open.length; i += 1) {
      const p = spline.pointAtParam(i / (open.length - 1));
      expect(p[0]).toBeCloseTo(open[i][0], 4);
      expect(p[1]).toBeCloseTo(open[i][1], 4);
      expect(p[2]).toBeCloseTo(open[i][2], 4);
    }
    // Arc-length parameterisation still lands the endpoints exactly.
    expect(spline.pointAt(0)[0]).toBeCloseTo(open[0][0], 6);
    expect(spline.pointAt(1)[0]).toBeCloseTo(open[open.length - 1][0], 6);
  });

  it("is C1-continuous at interior joints (tangent angle Δ < 1°)", () => {
    // C1 compares the derivative LIMITS at each knot — check epsilon-close on
    // both sides of the raw segment boundary, not ±arc (which legitimately
    // sweeps curvature).
    const eps = 1e-5;
    const norm = (v: AuraVec3): AuraVec3 => {
      const l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    for (const s of [1 / 3, 2 / 3]) {
      const before = norm(spline.derivativeAtParam(s - eps));
      const after = norm(spline.derivativeAtParam(s + eps));
      expect(angleDeg(before, after)).toBeLessThan(1);
    }
  });

  it("parameterises by arc length within ~2 % per sixth", () => {
    // Arc length per equal-u chunk, estimated with a dense sub-sample so a
    // curved spline isn't under-measured by raw chords.
    const n = 6;
    const sub = 32;
    for (let i = 0; i < n; i += 1) {
      let arc = 0;
      let prev = spline.pointAt(i / n);
      for (let k = 1; k <= sub; k += 1) {
        const p = spline.pointAt((i + k / sub) / n);
        arc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        prev = p;
      }
      const expected = spline.totalLength / n;
      expect(Math.abs(arc - expected) / expected).toBeLessThan(0.02);
    }
  });

  it("totalLength is positive and ≥ the control-chain length", () => {
    const chain =
      Math.hypot(2, 1, 0) + Math.hypot(3, 0, 3) + Math.hypot(3, -1, 0);
    expect(spline.totalLength).toBeGreaterThanOrEqual(chain * 0.99);
  });
});

describe("AuraCameraSpline (closed)", () => {
  const ring: readonly AuraVec3[] = [
    [4, 0, 0],
    [2, 0, 2],
    [0, 0, 4],
    [-2, 0, 2],
    [-4, 0, 0],
    [-2, 0, -2],
    [0, 0, -4],
    [2, 0, -2]
  ];

  it("is continuous across the wrap", () => {
    const closed = createSpline(ring, { closed: true });
    const p0 = closed.pointAt(0);
    const p1 = closed.pointAt(1);
    expect(p0[0]).toBeCloseTo(p1[0], 6);
    const eps = 1e-5;
    const norm = (v: AuraVec3): AuraVec3 => {
      const l = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    // every knot incl. the wrap (s = 0/1)
    for (const s of [0, 0.25, 0.5, 0.75]) {
      const left = norm(closed.derivativeAtParam((s - eps + 1) % 1));
      const right = norm(closed.derivativeAtParam((s + eps) % 1));
      expect(angleDeg(left, right)).toBeLessThan(1);
    }
  });
});
