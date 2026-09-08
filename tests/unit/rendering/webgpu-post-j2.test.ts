import { describe, expect, it } from "vitest";
import { normalizeWebGPUTemporalOptions, WEBGPU_TAA_FRAGMENT, WEBGPU_TAA_OUTPUT_FRAGMENT } from "../../../packages/rendering/src/webgpu/WebGPUTemporal";
import {
  defaultWebGPUBloomWeights,
  normalizeWebGPUColorGradeOptions,
  normalizeWebGPUBloomOptions,
  normalizeWebGPUBloomQuality,
  webgpuBloomCompositeFragment,
  webgpuBlurFragment,
  webgpuBrightExtractFragment,
  webgpuColorGradeFragment,
  webgpuFxaaFragment,
  webgpuSoftKneeWeight,
  WEBGPU_BLOOM_MAX_MIPS,
  WEBGPU_BLOOM_QUALITY_TABLE,
  WEBGPU_POST_VERTEX_WGSL
} from "../../../packages/rendering/src/webgpu/WebGPUPostShaders";

/**
 * muse3jsparity-PRD J2 — WebGPU post data plane (no adapter needed).
 * GPU execution is proven by tests/browser/webgpu-post-j2.spec.ts on real
 * hardware; these tests pin normalization, quality tiers, WGSL entry points,
 * and the CPU soft-knee oracle the browser spec cross-checks.
 */
describe("J2 webgpu post shaders", () => {
  it("rejects temporal weights that disable convergence or create invalid depth acceptance", () => {
    expect(normalizeWebGPUTemporalOptions({})).toEqual([0.9, 0.01]);
    expect(normalizeWebGPUTemporalOptions({ blend: 0, depthThreshold: 0.002 })).toEqual([0, 0.002]);
    for (const blend of [-1, 1, Infinity, NaN]) expect(() => normalizeWebGPUTemporalOptions({ blend })).toThrow(/blend/);
    for (const depthThreshold of [0, -1, 2, Infinity, NaN]) expect(() => normalizeWebGPUTemporalOptions({ depthThreshold })).toThrow(/depthThreshold/);
  });

  it("temporal binding contract reprojects and rejects history while preserving output alpha separately", () => {
    expect(WEBGPU_TAA_FRAGMENT).toContain("uv - motion.rg");
    expect(WEBGPU_TAA_FRAGMENT).toContain("abs(textureLoad(history, tap, 0).a - motion.a)");
    expect(WEBGPU_TAA_FRAGMENT).toContain("depthError <= temporal.depthThreshold");
    expect(WEBGPU_TAA_FRAGMENT).toContain("temporal.valid > 0.5 && inBounds && depthMatches");
    expect(WEBGPU_TAA_FRAGMENT).toContain("temporal.blend * 0.90");
    expect(WEBGPU_TAA_FRAGMENT).toContain("textureSampleLevel(source, linearSampler, uv +");
    expect(WEBGPU_TAA_FRAGMENT).toContain("clamp(previous.rgb, lo, hi)");
    expect(WEBGPU_TAA_FRAGMENT).toContain("motion.b");
    expect(WEBGPU_TAA_OUTPUT_FRAGMENT).toContain("vec4<f32>(accumulated.rgb, current.a)");
    expect(WEBGPU_TAA_OUTPUT_FRAGMENT).toContain("current.a");
  });
  it("quality tiers mirror the native WebGL2 tiers", () => {
    expect(WEBGPU_BLOOM_QUALITY_TABLE.performance).toEqual({ mipCount: 1, halfFloat: false });
    expect(WEBGPU_BLOOM_QUALITY_TABLE.balanced).toEqual({ mipCount: 3, halfFloat: true });
    expect(WEBGPU_BLOOM_QUALITY_TABLE.cinematic).toEqual({ mipCount: 5, halfFloat: true });
    expect(normalizeWebGPUBloomQuality(undefined).quality).toBe("balanced");
    expect(() => normalizeWebGPUBloomQuality("ultra" as never)).toThrow(/Unknown WebGPU bloom quality/);
  });

  it("bloom options fail closed on bad numbers", () => {
    expect(normalizeWebGPUBloomOptions()).toMatchObject({ threshold: 0.85, knee: 0.15, strength: 0.6, quality: "balanced", mipCount: 3, halfFloat: true });
    expect(normalizeWebGPUBloomOptions({ quality: "performance" })).toMatchObject({ mipCount: 1, halfFloat: false });
    expect(normalizeWebGPUBloomOptions({ quality: "cinematic", mipCount: 2 }).mipCount).toBe(2);
    expect(() => normalizeWebGPUBloomOptions({ threshold: Number.NaN })).toThrow(/threshold/);
    expect(() => normalizeWebGPUBloomOptions({ knee: -1 })).toThrow(/knee/);
    expect(() => normalizeWebGPUBloomOptions({ strength: -0.5 })).toThrow(/strength/);
    expect(() => normalizeWebGPUBloomOptions({ mipCount: 0 })).toThrow(/mipCount/);
    expect(() => normalizeWebGPUBloomOptions({ mipCount: WEBGPU_BLOOM_MAX_MIPS + 1 })).toThrow(/mipCount/);
    expect(() => normalizeWebGPUBloomOptions({ mipCount: 1.5 })).toThrow(/mipCount/);
  });

  it("color-grade options fail closed on bad numbers", () => {
    expect(normalizeWebGPUColorGradeOptions()).toEqual({ exposure: 0, contrast: 1, saturation: 1 });
    expect(() => normalizeWebGPUColorGradeOptions({ exposure: Number.NaN })).toThrow(/exposure/);
    expect(() => normalizeWebGPUColorGradeOptions({ contrast: -1 })).toThrow(/contrast/);
    expect(() => normalizeWebGPUColorGradeOptions({ saturation: Number.POSITIVE_INFINITY })).toThrow(/saturation/);
  });

  it("per-mip weights are energy-preserving", () => {
    for (const count of [1, 3, 5]) {
      const weights = defaultWebGPUBloomWeights(count);
      expect(weights).toHaveLength(count);
      expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
      if (count > 1) expect(weights[0]).toBeGreaterThan(weights[count - 1] ?? 0);
    }
  });

  it("soft-knee oracle matches the WGSL smoothstep gate", () => {
    expect(webgpuSoftKneeWeight(0.2, 0.85, 0.15)).toBe(0);
    expect(webgpuSoftKneeWeight(0.99, 0.85, 0.15)).toBeGreaterThan(0.99);
    expect(webgpuSoftKneeWeight(0.85, 0.85, 0.15)).toBeCloseTo(0.5, 10);
    expect(webgpuSoftKneeWeight(0.9, 0.85, 0)).toBe(1);
    expect(webgpuSoftKneeWeight(0.8, 0.85, 0)).toBe(0);
  });

  it("WGSL exposes the probe entry points with matching bindings", () => {
    expect(WEBGPU_POST_VERTEX_WGSL).toContain("fn vs_post");
    expect(WEBGPU_POST_VERTEX_WGSL).toContain("vertex_index");
    const bright = webgpuBrightExtractFragment();
    expect(bright).toContain("fn fs_bright");
    expect(bright).toContain("smoothstep");
    const blur = webgpuBlurFragment();
    expect(blur).toContain("fn fs_blur");
    expect(blur).toContain("0.2270270270");
    const composite = webgpuBloomCompositeFragment({ weights: [0.5, 0.3, 0.2], strength: 0.6 });
    expect(composite).toContain("fn fs_composite");
    expect(composite).toContain("u_mip0");
    expect(composite).toContain("u_mip2");
    const grade = webgpuColorGradeFragment();
    expect(grade).toContain("fn fs_grade");
    expect(grade).toContain("exp2");
    const fxaa = webgpuFxaaFragment();
    expect(fxaa).toContain("fn fs_fxaa");
    expect(fxaa).toContain("0.0312");
  });
});
