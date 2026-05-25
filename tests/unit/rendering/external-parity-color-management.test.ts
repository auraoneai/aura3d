import { describe, expect, it } from "vitest";
import {
  V4_REQUIRED_DEBUG_VIEWS,
  MockRenderDevice,
  analyzeV4Exposure,
  convertColorSpace,
  createColorConversionSamples,
  createV4ColorManagementPolicy,
  createV4DebugViewSet,
  createV4ExposurePolicy,
  createV4HdrPipeline,
  createV4ToneMappingPolicy,
  executeV4ToneMapPass,
  srgbToLinearChannel,
  toneMapV4HdrPixels,
  validateTextureColorSpace
} from "../../../packages/rendering/src";

describe("V4 color management and HDR pipeline", () => {
  it("defines a real linear lighting and texture color-space policy", () => {
    const policy = createV4ColorManagementPolicy();

    expect(policy.lightingColorSpace).toBe("linear");
    expect(policy.outputColorSpace).toBe("srgb");
    expect(policy.texturePolicy["base-color"]).toBe("srgb");
    expect(policy.texturePolicy.emissive).toBe("srgb");
    expect(policy.texturePolicy.normal).toBe("linear");
    expect(policy.texturePolicy["metallic-roughness"]).toBe("linear");
    expect(validateTextureColorSpace("base-color", "linear", policy)).toMatchObject({
      pass: false,
      expected: "srgb",
      actual: "linear"
    });
    expect(validateTextureColorSpace("normal", "linear", policy)).toMatchObject({ pass: true });
  });

  it("round-trips sRGB and linear conversion with bounded error", () => {
    const samples = createColorConversionSamples([0, 0.18, 0.5, 1]);
    expect(samples.every((sample) => sample.roundTripError < 0.00001)).toBe(true);
    expect(srgbToLinearChannel(0.5)).toBeCloseTo(0.214041, 5);

    const linear = convertColorSpace([0.5, 0.25, 0.75, 1], "srgb", "linear");
    const srgb = convertColorSpace(linear, "linear", "srgb");
    expect(srgb[0]).toBeCloseTo(0.5, 5);
    expect(srgb[1]).toBeCloseTo(0.25, 5);
    expect(srgb[2]).toBeCloseTo(0.75, 5);
  });

  it("tone maps overbright HDR input with a V4 product policy", () => {
    const policy = createV4ToneMappingPolicy("product-catalog", {
      exposure: 1,
      whitePoint: 1,
      gamma: 1,
      operator: "reinhard",
      outputColorSpace: "srgb"
    });
    const result = toneMapV4HdrPixels(new Float32Array([4, 0.5, 0.125, 1]), 1, 1, policy);

    expect(result.inputOverbrightPixels).toBe(1);
    expect(result.maxInputValue).toBe(4);
    expect(result.calibration.outputColorSpace).toBe("srgb");
    expect(result.pixels[0]).toBeGreaterThan(result.pixels[1]!);
    expect(result.pixels[0]).toBeLessThan(255);
  });

  it("computes exposure histograms and stable auto exposure for mid-gray scenes", () => {
    const pixels = new Uint8Array([
      118, 118, 118, 255,
      128, 128, 128, 255,
      138, 138, 138, 255,
      148, 148, 148, 255
    ]);
    const analysis = analyzeV4Exposure(pixels, 2, 2, createV4ExposurePolicy({ histogramBins: 32 }));

    expect(analysis.histogram.pixelCount).toBe(4);
    expect(analysis.histogram.binCount).toBe(32);
    expect(analysis.autoExposure.exposure).toBeGreaterThan(0);
    expect(analysis.underExposed).toBe(false);
    expect(analysis.overExposed).toBe(false);
  });

  it("creates HDR render targets, tone maps to display, and records fallback policy", () => {
    const device = new MockRenderDevice();
    const pipeline = createV4HdrPipeline(device, {
      width: 2,
      height: 1,
      intent: "product-catalog",
      preferredFormat: "rgba32f"
    });

    expect(pipeline.mode).toBe("hdr");
    expect(pipeline.format).toBe("rgba32f");
    expect(pipeline.colorManagement.outputColorSpace).toBe("srgb");

    device.beginFrame(2, 1);
    device.setRenderTarget(pipeline.colorTarget);
    device.clear([3, 0.5, 0.125, 1]);
    const pass = executeV4ToneMapPass(device, pipeline);
    device.setRenderTarget(pipeline.displayTarget);
    const pixels = device.readPixels(0, 0, 1, 1);
    device.endFrame();

    expect((pass.getLastResult() as { readonly inputOverbrightPixels?: number } | null)?.inputOverbrightPixels).toBe(2);
    expect(pixels[0]).toBeGreaterThan(pixels[1]!);
    expect(pixels[0]).toBeLessThan(255);
  });

  it("creates all required debug views with deterministic fallback buffers", () => {
    const views = createV4DebugViewSet({ width: 1, height: 1 });

    expect(views.map((view) => view.view)).toEqual(V4_REQUIRED_DEBUG_VIEWS);
    expect(views).toHaveLength(9);
    expect(views.every((view) => view.source === "diagnostic-fallback")).toBe(true);
    expect(views.every((view) => view.pixels.length === 4 && view.pixels[3] === 255)).toBe(true);
  });
});
