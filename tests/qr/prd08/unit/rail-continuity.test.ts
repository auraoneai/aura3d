/**
 * S11 — rail continuity (closed 6-point rail):
 *  - no positional discontinuity > 1 % of rail length between the last
 *    and first frame (closed loop wraps C1-continuously), and
 *  - per-step speed variation ≤ 5 % riding `pointAt(u)` (arc-length
 *    reparameterised, constant-speed within ~2 %).
 *
 * The negative control in the spec is the CameraChoreographer's raw
 * smoothstep interpolation, which exceeds 5 % speed variation at every
 * keyframe — asserted here as the honest red/green pair: smoothstep
 * red, arc-length `pointAt` green. No widened tolerance.
 */
import { describe, expect, it } from "vitest";
import { createSpline } from "../../../../packages/engine/src/agent-api/camera/Spline.js";
import { createRailRig } from "../../../../packages/engine/src/agent-api/camera/rigs/rail.js";
import { run } from "./rigTestKit";

const RAIL: readonly [number, number, number][] = [
  [6, 0.5, 0],
  [4.2, 1.0, 4.2],
  [0, 1.5, 6],
  [-4.2, 0.8, 4.2],
  [-6, 1.2, 0],
  [-3, 0.6, -4]
];

const N = 720; // one lap, 12 s at 60 Hz

function speeds(spline: ReturnType<typeof createSpline>): number[] {
  const out: number[] = [];
  for (let i = 1; i < N; i += 1) {
    const a = spline.pointAt(i / N);
    const b = spline.pointAt((i - 1) / N);
    out.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * N);
  }
  return out;
}

describe("S11 rail continuity (closed 6-point rail)", () => {
  // samples=1024: the arc-length LUT must resolve ~4× finer than the
  // default 256 to hold the S11 ≤5 % per-step speed gate at 60 Hz
  // (measured: 14.25 % @256, 2.74 % @512, 0.61 % @1024 — LUT quantisation,
  // not curve shape). A rail rig should pick samples accordingly.
  const spline = createSpline(RAIL, { closed: true, samples: 1024 });
  const L = spline.totalLength;

  it("wraps with no positional discontinuity > 1 % of rail length", () => {
    const first = spline.pointAt(0);
    const last = spline.pointAt(1);
    const gap = Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]);
    expect(gap).toBeLessThanOrEqual(0.01 * L);
    // And across the seam: step over u=1 back into u≈0 stays sub-threshold.
    const before = spline.pointAt(0.9999);
    const after = spline.pointAt(0.0001);
    const seam = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    expect(seam).toBeLessThanOrEqual(0.01 * L);
  });

  it("arc-length pointAt keeps per-step speed variation ≤ 5 %", () => {
    const s = speeds(spline);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    expect(mean).toBeGreaterThan(0);
    for (const v of s) {
      expect(Math.abs(v - mean) / mean).toBeLessThanOrEqual(0.05);
    }
  });

  it("closed spline interpolates every control point exactly", () => {
    // Centripetal CR passes through control points; closed rail wraps so
    // pointIndex(i) hits all six.
    for (let i = 0; i < RAIL.length; i += 1) {
      const p = spline.pointAtParam(i / RAIL.length);
      const q = RAIL[i];
      expect(p[0]).toBeCloseTo(q[0], 6);
      expect(p[1]).toBeCloseTo(q[1], 6);
      expect(p[2]).toBeCloseTo(q[2], 6);
    }
  });

  it("control: raw smoothstep timing over the same waypoints exceeds 5 % speed variation", () => {
    // The spec's failing side, kept honest: the choreographer's keyframed
    // smoothstep sits at ~0 speed at every knot (>5 % dip). This documents
    // WHY the closed-spline rail exists — it must stay red, else the row's
    // done-when is meaningless.
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const KNOTS = 6;
    const legTimes = N / KNOTS;
    const vs: number[] = [];
    for (let i = 1; i < N; i += 1) {
      const sA = smooth((i / N) * KNOTS % 1);
      const sB = smooth(((i - 1) / N) * KNOTS % 1);
      vs.push(Math.abs(sA - sB) * legTimes * 10); // position units per "10 u/s" legs
    }
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const maxDip = Math.max(...vs.map((v) => Math.abs(v - mean) / mean));
    expect(maxDip).toBeGreaterThan(0.05);
  });
});

describe("S11 rigs.rail (loop) — the rig a game actually mounts", () => {
  // One 12 s lap at 60 Hz through the real rig: per-frame camera speed
  // variation ≤ 5 % and no seam discontinuity > 1 % of rail length.
  const LAP = 12;
  const frames = LAP * 60;
  const rig = createRailRig({ points: RAIL, duration: LAP, loop: "loop", lookAt: [0, 0.5, 0] });
  const poses = run(rig, frames + 1, 1 / 60, () => ({}));
  const L = createSpline(RAIL, { closed: true, samples: 1024 }).totalLength;

  it("per-frame speed variation ≤ 5 % over a full lap (including across the seam)", () => {
    const v: number[] = [];
    for (let i = 1; i < poses.length; i += 1) {
      const a = poses[i - 1]!.position;
      const b = poses[i]!.position;
      v.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 60);
    }
    const mean = v.reduce((x, y) => x + y, 0) / v.length;
    expect(mean).toBeCloseTo(L / LAP, 1);
    for (const s of v) expect(Math.abs(s - mean) / mean).toBeLessThanOrEqual(0.05);
  });

  it("lap end lands back on the lap start within 1 % of rail length", () => {
    const first = poses[0]!.position;
    const last = poses[frames]!.position;
    expect(Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2])).toBeLessThanOrEqual(0.01 * L);
  });

  it("control: an eased loop (explicit inOutSine) stalls at the seam and fails the 5 % gate", () => {
    const eased = run(createRailRig({ points: RAIL, duration: LAP, loop: "loop", lookAt: [0, 0.5, 0], ease: "inOutSine" }), frames + 1, 1 / 60, () => ({}));
    const v: number[] = [];
    for (let i = 1; i < eased.length; i += 1) {
      const a = eased[i - 1]!.position;
      const b = eased[i]!.position;
      v.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 60);
    }
    const mean = v.reduce((x, y) => x + y, 0) / v.length;
    expect(Math.max(...v.map((s) => Math.abs(s - mean) / mean))).toBeGreaterThan(0.05);
  });
});
