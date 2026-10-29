import { afterEach, describe, expect, it } from "vitest";

import {
  parseQualityRendererOptions,
  resetRendererOptionDeprecationsForTests
} from "../../../../packages/engine/src/agent-api/app/rendererOptions";
import { AuraQuality } from "../../../../packages/rendering/src/quality/QualityController";

/** PRD-11 Wave B RendererOptions: quality/adaptive/targetFrameRate/batching + URL overrides. */

afterEach(() => {
  resetRendererOptionDeprecationsForTests();
});

describe("parseQualityRendererOptions", () => {
  it("defaults: auto tier, adaptive on, batching auto, no warnings", () => {
    expect(parseQualityRendererOptions(undefined, null)).toEqual({
      requested: "auto",
      requestedSource: "options",
      overrides: undefined,
      adaptive: true,
      adaptiveSource: "options",
      targetFrameRate: undefined,
      batching: "auto",
      warnings: []
    });
  });

  it("parses a tier string and the { tier, overrides } form", () => {
    expect(parseQualityRendererOptions({ quality: "low" }, null).requested).toBe("low");
    const parsed = parseQualityRendererOptions({ quality: { tier: "ultra", overrides: { shadowMapSize: 1024 } }, adaptive: false, targetFrameRate: 30, batching: true }, null);
    expect(parsed).toMatchObject({ requested: "ultra", overrides: { shadowMapSize: 1024 }, adaptive: false, targetFrameRate: 30, batching: true });
  });

  it("rejects invalid values instead of silently running auto", () => {
    expect(() => parseQualityRendererOptions({ quality: "hgih" }, null)).toThrow(/QUALITY_OPTION_INVALID:renderer.quality=hgih/);
    expect(() => parseQualityRendererOptions({ adaptive: "yes" }, null)).toThrow(/renderer.adaptive/);
    expect(() => parseQualityRendererOptions({ targetFrameRate: 0 }, null)).toThrow(/targetFrameRate/);
    expect(() => parseQualityRendererOptions({ batching: "on" }, null)).toThrow(/batching/);
  });

  it("ignores invalid URL values with a warning, and throws on them in strict mode (audit RP-04)", () => {
    const adaptive = parseQualityRendererOptions(undefined, "?aura3d-adaptive=off");
    expect(adaptive.warnings.some((w) => /QUALITY_URL_IGNORED: \?aura3d-adaptive=off/.test(w))).toBe(true);
    const quality = parseQualityRendererOptions({ quality: "low" }, "?aura3d-quality=max");
    expect(quality.requested).toBe("low");
    expect(quality.warnings.some((w) => /QUALITY_URL_IGNORED: \?aura3d-quality=max/.test(w))).toBe(true);
    expect(() => parseQualityRendererOptions(undefined, "?aura3d-adaptive=off", {}, { strict: true })).toThrow(/aura3d-adaptive/);
    expect(() => parseQualityRendererOptions(undefined, "?aura3d-quality=max", {}, { strict: true })).toThrow(/aura3d-quality/);
  });

  it("URL overrides win over options and are reported as source url", () => {
    const parsed = parseQualityRendererOptions({ quality: "ultra", adaptive: true }, "?aura3d-quality=low&aura3d-adaptive=0");
    expect(parsed).toMatchObject({ requested: "low", requestedSource: "url", adaptive: false, adaptiveSource: "url" });
    expect(parseQualityRendererOptions({ quality: "low" }, "?aura3d-quality=auto")).toMatchObject({ requested: "auto", requestedSource: "url" });
  });

  it("qualityProfile and performanceQuality warn once each", () => {
    const first = parseQualityRendererOptions({ qualityProfile: "production" }, null, { performanceQuality: "balanced" });
    expect(first.warnings).toHaveLength(2);
    expect(first.warnings[0]).toMatch(/qualityProfile is deprecated/);
    expect(first.warnings[1]).toMatch(/performanceQuality is deprecated/);
    const second = parseQualityRendererOptions({ qualityProfile: "production" }, null, { performanceQuality: "balanced" });
    expect(second.warnings).toEqual([]);
  });
});

describe("AuraQuality decision source", () => {
  it("a URL-chosen tier reports source url and skips device detection", () => {
    const controller = new AuraQuality("low", undefined, { requestedSource: "url" });
    expect(controller.decision).toMatchObject({ tier: "low", source: "url" });
    controller.attachProbe({
      backend: "webgl2", rendererString: "x", unmaskedRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)", unmaskedVendor: null,
      maxTextureSize: 16384, maxSamples: 4, floatColorBuffer: true, halfFloatColorBuffer: true, timerQuery: false,
      parallelShaderCompile: true, multiDraw: true, devicePixelRatio: 1, screen: [1920, 1080],
      hardwareConcurrency: null, deviceMemoryGB: null, mobile: false
    });
    expect(controller.decision).toMatchObject({ tier: "low", source: "url" });
  });

  it("an options tier stays source explicit", () => {
    expect(new AuraQuality("medium").decision.source).toBe("explicit");
  });
});
