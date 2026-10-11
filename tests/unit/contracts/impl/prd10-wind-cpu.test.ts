/**
 * PRD-10 S7 (CPU side): the `a3d_prd10_wind` CPU twin is length-preserving,
 * zero without wind and zero at the root, and bends quadratically in height.
 * The GPU-vs-CPU ≤ 1e-4 parity lives in tests/browser/qr-prd10-wind-chunk.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { windOffsetCpu } from "../../../../packages/rendering/src/world/vegetation/WindCpu";
import { a3d_prd10_wind } from "../../../../packages/rendering/src/world/vegetation/shaders/wind";

const ubo = (strength: number, time: number, gust = 0): number[] => [0.8, 0.6, strength, time, gust, 0.05, 0, 0];
const W = [1, 0, 0.3, 1] as const;

describe("prd10 wind CPU twin (S7)", () => {
  it("preserves the vertex distance from the root (≤ 1e-6)", () => {
    for (const p of [[0.2, 1, 0.1], [0, 3.5, 0], [-0.4, 2.2, 0.7]] as const) {
      const o = windOffsetCpu(ubo(1.5, 2.3, 0.7), p, [3, 0, -2], [1, 1, 0.4, 1], 4, 0.6);
      const bent = Math.hypot(p[0] + o[0], p[1] + o[1], p[2] + o[2]);
      expect(Math.abs(bent - Math.hypot(...p))).toBeLessThan(1e-6);
    }
  });

  it("is zero with no wind", () => {
    const o = windOffsetCpu(ubo(0, 5, 0), [0.1, 2, 0.1], [0, 0, 0], W, 4, 0.5);
    for (const c of o) expect(Math.abs(c)).toBeLessThan(1e-12);
  });

  it("bends more near the tip than at mid height (quadratic in height)", () => {
    // t = 0 and origin 0 → sway term sin(0) = 0; flutter off (weights.g = 0)
    const mid = windOffsetCpu(ubo(1, 0), [0, 2, 0], [0, 0, 0], W, 4, 0);
    const tip = windOffsetCpu(ubo(1, 0), [0, 4, 0], [0, 0, 0], W, 4, 0);
    const lat = (o: readonly number[]): number => Math.hypot(o[0]!, o[2]!);
    expect(lat(tip)).toBeGreaterThan(lat(mid) * 2);
  });

  it("matches the chunk's formula constants (twin drift guard)", () => {
    for (const k of ["0.37, 0.71", "0.25 * strength", "0.35 * assetHeight", "t * 7.3", "6.2831", "vec3(2.1, 1.7, 2.9)", "0.035", "flutter * 0.4", "dir * t * 0.08"]) {
      expect(a3d_prd10_wind.glsl).toContain(k);
    }
  });
});
