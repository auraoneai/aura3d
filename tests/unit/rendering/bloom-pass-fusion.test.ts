import { describe, expect, it } from "vitest";
import { BLOOM_FUSED_BLUR_TAP_BUDGET, BLOOM_FUSED_MAX_MIPS } from "../../../packages/rendering/src/webgl2/LegacyPost";
import { resolveBloomPyramidPlan } from "../../../packages/rendering/src/postprocess/NativeBloomPyramid";

/**
 * The fused bloom passes (quality auto / cinematic) rest on two facts, checked here on the CPU with the same arithmetic
 * the shaders use:
 *   1. a single 2-D Gaussian pass with the product of the two normalised 1-D kernels equals the horizontal pass followed
 *      by the vertical pass (per-axis edge clamp included);
 *   2. which pyramid mips take the single-pass route at the benchmark resolution (640x360, radii 6/10/14/18/22).
 * The pixel-level proof (mean abs diff, max diff, draw counts) is the remote spec tests/browser/frame-cost-pbr-viewer.spec.ts.
 */
function kernel(radius: number): { weights: number[]; sum: number } {
  const sigma = Math.max(radius / 3, 0.5);
  const coefficient = 0.39894 / sigma;
  const weights = [coefficient];
  let sum = coefficient;
  for (let offset = 1; offset <= radius; offset += 1) {
    const weight = coefficient * Math.exp(-0.5 * offset * offset / (sigma * sigma));
    weights.push(weight);
    sum += 2 * weight;
  }
  return { weights, sum };
}

function fetch(image: Float64Array, w: number, h: number, x: number, y: number): number {
  return image[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
}

function separable(image: Float64Array, w: number, h: number, radius: number): Float64Array {
  const { weights, sum } = kernel(radius);
  const horizontal = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = fetch(image, w, h, x, y) * weights[0]!;
      for (let o = 1; o <= radius; o += 1) acc += (fetch(image, w, h, x + o, y) + fetch(image, w, h, x - o, y)) * weights[o]!;
      horizontal[y * w + x] = acc / sum;
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = fetch(horizontal, w, h, x, y) * weights[0]!;
      for (let o = 1; o <= radius; o += 1) acc += (fetch(horizontal, w, h, x, y + o) + fetch(horizontal, w, h, x, y - o)) * weights[o]!;
      out[y * w + x] = acc / sum;
    }
  }
  return out;
}

function twoDimensional(image: Float64Array, w: number, h: number, radius: number): Float64Array {
  const { weights, sum } = kernel(radius);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) acc += fetch(image, w, h, x + dx, y + dy) * (weights[Math.abs(dx)]! * weights[Math.abs(dy)]!);
      }
      out[y * w + x] = acc / (sum * sum);
    }
  }
  return out;
}

describe("bloom pass fusion", () => {
  it("a single 2-D Gaussian pass equals the separable pair, edges included", () => {
    let seed = 5;
    const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (const [w, h, radius] of [[20, 12, 22], [40, 23, 18], [17, 9, 14], [8, 8, 6]] as const) {
      const image = new Float64Array(w * h).map(() => next() * 4);
      const a = separable(image, w, h, radius);
      const b = twoDimensional(image, w, h, radius);
      let worst = 0;
      for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
      expect(worst).toBeLessThan(1e-12);
    }
  });

  it("at 640x360 the four smallest mips blur in one pass and mip 0 stays separable", () => {
    const plan = resolveBloomPyramidPlan(640, 360, "cinematic", true);
    expect(plan.mipCount).toBeLessThanOrEqual(BLOOM_FUSED_MAX_MIPS);
    const radii = [6, 10, 14, 18, 22];
    const single = plan.mips.map((mip, level) => (2 * radii[level]! + 1) ** 2 * mip.width * mip.height <= BLOOM_FUSED_BLUR_TAP_BUDGET);
    expect(single).toEqual([false, true, true, true, true]);
  });
});
