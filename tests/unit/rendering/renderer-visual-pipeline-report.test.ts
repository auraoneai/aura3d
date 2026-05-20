import { describe, expect, it } from "vitest";
import {
  MockRenderDevice,
  createRendererVisualPipelineReport,
  evaluateRendererCanvasBacking,
  evaluateRendererCaptureQuality,
  evaluateRendererFrameCadence,
  evaluateRendererScreenshotConsistency,
  type RenderDeviceCapability
} from "../../../packages/rendering/src";

describe("renderer visual pipeline report", () => {
  it("reports the executable HDR tone-mapped renderer path with DPR and screenshot evidence", () => {
    const device = new MockRenderDevice();
    Object.assign(device.info, {
      capabilities: [
        ...(device.info.capabilities ?? []),
        "hdr-render-targets",
        "canvas-surface"
      ] satisfies RenderDeviceCapability[]
    });

    const report = createRendererVisualPipelineReport({
      device,
      width: 1440,
      height: 920,
      postprocess: {
        targetFormat: "rgba16f",
        bloom: { threshold: 0.8, intensity: 0.25 },
        toneMapping: { operator: "aces", exposure: 1.25, outputColorSpace: "srgb" },
        colorGrade: { contrast: 1.05, saturation: 0.96 },
        fxaa: true
      },
      canvas: {
        cssWidth: 720,
        cssHeight: 460,
        devicePixelRatio: 2,
        actualWidth: 1440,
        actualHeight: 920
      },
      screenshot: {
        width: 1440,
        height: 920,
        byteLength: 1440 * 920 * 4
      },
      capture: {
        label: "hero",
        cssWidth: 720,
        cssHeight: 460,
        backingWidth: 1440,
        backingHeight: 920,
        screenshotWidth: 1440,
        screenshotHeight: 920,
        devicePixelRatio: 2,
        minimumEffectiveDpr: 2
      },
      frameCadence: {
        targetFrameMs: 16.667,
        renderMs: 7.5,
        loopMs: 11.25,
        frameIntervalMs: 16.4,
        readbackMs: 1.2,
        screenshotCaptureOverheadMs: 0,
        sampleCount: 12
      }
    });

    expect(report.status).toBe("supported");
    expect(report.color.lightingColorSpace).toBe("linear");
    expect(report.color.outputColorSpace).toBe("srgb");
    expect(report.color.unsupportedOutputColorSpaces).toEqual(["display-p3", "rec2020"]);
    expect(report.postprocess.enabled).toBe(true);
    expect(report.postprocess.passNames).toEqual(["bloom", "tone-mapping", "color-grade", "fxaa"]);
    expect(report.postprocess.targetFormat).toBe("rgba16f");
    expect(report.postprocess.sourceTargetFormat).toBe("rgba16f");
    expect(report.postprocess.executionMode).toBe("renderer-owned-pass-chain-readback");
    expect(report.postprocess.nativePresentation).toBe(false);
    expect(report.postprocess.usesReadback).toBe(true);
    expect(report.postprocess.readbackPassNames).toEqual(["bloom", "tone-mapping", "color-grade", "fxaa"]);
    expect(report.postprocess.rendererOwnedPassNames).toEqual(["bloom", "tone-mapping", "color-grade", "fxaa"]);
    expect(report.postprocess.missingInputs).toEqual([]);
    expect(report.postprocess.plan?.claimBoundary).toContain("does not prove EffectComposer parity");
    expect(report.postprocess.forwardOutputColorSpace).toBe("linear");
    expect(report.postprocess.presentationColorSpace).toBe("srgb");
    expect(report.hdrTarget).toMatchObject({
      requested: true,
      supportedByBackend: true,
      capabilityAdvertised: true,
      targetFormat: "rgba16f"
    });
    expect(report.toneMapping).toMatchObject({
      enabled: true,
      operator: "aces",
      exposure: 1.25,
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    });
    expect(report.toneMapping.availablePresets).toEqual(["natural", "cinematic", "vibrant", "realistic", "stylized"]);
    expect(report.toneMapping.calibration?.monotonic).toBe(true);
    expect(report.canvas).toMatchObject({
      status: "supported",
      expectedWidth: 1440,
      expectedHeight: 920,
      backingStoreMatchesDisplay: true,
      effectiveDevicePixelRatio: 2
    });
    expect(report.screenshot).toMatchObject({
      status: "supported",
      pixelFormat: "rgba8",
      colorSpace: "srgb",
      readbackMatchesBackingStore: true,
      colorProfileEmbedded: false
    });
    expect(report.capture).toMatchObject({
      status: "supported",
      label: "hero",
      effectiveBackingDprX: 2,
      effectiveBackingDprY: 2,
      effectiveCaptureDprX: 2,
      effectiveCaptureDprY: 2,
      captureToBackingScaleX: 1,
      captureToBackingScaleY: 1,
      fullCanvasPixelMatch: true,
      captureDownsamplesCanvas: false,
      captureUpscalesCanvas: false,
      meetsMinimumEffectiveDpr: true
    });
    expect(report.frameCadence).toMatchObject({
      status: "supported",
      stableForCapture: true,
      renderBudgetRatio: 0.45,
      loopBudgetRatio: 0.675
    });
    expect(report.unsupportedCapabilities["hdr-display-swapchain"]).toContain("not exposed");
    expect(report.screenshot?.warnings.join(" ")).toContain("PNG/ICC");
  });

  it("flags unsupported HDR requests and DPR backing mismatches without pretending to fall through", () => {
    const device = new MockRenderDevice();
    const report = createRendererVisualPipelineReport({
      device,
      width: 800,
      height: 600,
      postprocess: {
        targetFormat: "rgba16f",
        toneMapping: false,
        bloom: true
      },
      canvas: {
        cssWidth: 800,
        cssHeight: 600,
        devicePixelRatio: 2,
        actualWidth: 800,
        actualHeight: 600
      }
    });

    expect(report.status).toBe("unsupported");
    expect(report.hdrTarget.status).toBe("unsupported");
    expect(report.hdrTarget.supportedByBackend).toBe(false);
    expect(report.hdrTarget.fallbackFormat).toBe("rgba8");
    expect(report.toneMapping.status).toBe("unsupported");
    expect(report.toneMapping.enabled).toBe(false);
    expect(report.postprocess.status).toBe("unsupported");
    expect(report.canvas).toMatchObject({
      status: "partial",
      expectedWidth: 1600,
      expectedHeight: 1200,
      backingStoreMatchesDisplay: false,
      effectiveDevicePixelRatio: 1
    });
    expect(report.warnings.join(" ")).toContain("does not advertise hdr-render-targets");
    expect(report.warnings.join(" ")).toContain("requires tone mapping");
    expect(report.warnings.join(" ")).toContain("does not match CSS");
  });

  it("reports direct LDR presentation separately from the linear postprocess path", () => {
    const device = new MockRenderDevice();
    const report = createRendererVisualPipelineReport({
      device,
      width: 320,
      height: 180,
      postprocess: false
    });

    expect(report.status).toBe("supported");
    expect(report.postprocess.enabled).toBe(false);
    expect(report.postprocess.passNames).toEqual([]);
    expect(report.postprocess.targetFormat).toBe("rgba8");
    expect(report.postprocess.executionMode).toBe("none");
    expect(report.postprocess.usesReadback).toBe(false);
    expect(report.postprocess.forwardOutputColorSpace).toBe("srgb");
    expect(report.toneMapping.enabled).toBe(false);
    expect(report.hdrTarget.requested).toBe(false);
  });

  it("surfaces postprocess execution gaps in the visual pipeline report", () => {
    const device = new MockRenderDevice();
    Object.assign(device.info, {
      capabilities: ["postprocess-presentation"] satisfies RenderDeviceCapability[]
    });

    const report = createRendererVisualPipelineReport({
      device,
      width: 640,
      height: 360,
      postprocess: {
        bloom: { threshold: 0.42, intensity: 0.7, radius: 4 },
        ssao: { radius: 0.5, intensity: 0.6 },
        motionBlur: { velocity: undefined as unknown as Float32Array }
      }
    });

    expect(report.status).toBe("partial");
    expect(report.postprocess).toMatchObject({
      status: "partial",
      executionMode: "renderer-owned-pass-chain-readback",
      nativePresentation: false,
      usesReadback: true,
      missingInputs: ["motion-blur:velocity", "ssao:depth"],
      readbackPassNames: ["bloom", "tone-mapping", "motion-blur", "ssao"],
      clarityWarnings: [
        "bloom-noise-risk threshold=0.42 intensity=0.7 radius=4",
        "multi-pass-readback-cost"
      ]
    });
    expect(report.warnings.join(" ")).toContain("ssao:depth");
    expect(report.warnings.join(" ")).toContain("motion-blur:velocity");
    expect(report.postprocess.clarityWarnings.join(" ")).toContain("bloom-noise-risk");
  });

  it("evaluates DPR and screenshot readback consistency as standalone evidence", () => {
    expect(evaluateRendererCanvasBacking({
      cssWidth: 512,
      cssHeight: 384,
      devicePixelRatio: 1.5,
      actualWidth: 768,
      actualHeight: 576
    })).toMatchObject({
      status: "supported",
      expectedWidth: 768,
      expectedHeight: 576,
      effectiveDevicePixelRatio: 1.5
    });

    const screenshot = evaluateRendererScreenshotConsistency({
      width: 768,
      height: 576,
      byteLength: 12,
      expectedWidth: 768,
      expectedHeight: 576
    });

    expect(screenshot.status).toBe("partial");
    expect(screenshot.expectedByteLength).toBe(768 * 576 * 4);
    expect(screenshot.readbackMatchesBackingStore).toBe(false);
    expect(screenshot.warnings.join(" ")).toContain("byte length");
  });

  it("makes effective capture DPR measurable when large backing resolution still captures at a lower scale", () => {
    const galleryLike = evaluateRendererCaptureQuality({
      label: "gallery-hero",
      cssWidth: 1440,
      cssHeight: 920,
      backingWidth: 1800,
      backingHeight: 1150,
      screenshotWidth: 1800,
      screenshotHeight: 1150,
      devicePixelRatio: 1.25,
      minimumEffectiveDpr: 1.5
    });

    expect(galleryLike).toMatchObject({
      status: "partial",
      effectiveBackingDprX: 1.25,
      effectiveBackingDprY: 1.25,
      effectiveCaptureDprX: 1.25,
      effectiveCaptureDprY: 1.25,
      captureToBackingScaleX: 1,
      captureToBackingScaleY: 1,
      fullCanvasPixelMatch: true,
      captureDownsamplesCanvas: false,
      captureUpscalesCanvas: false,
      meetsMinimumEffectiveDpr: false
    });
    expect(galleryLike.warnings.join(" ")).toContain("below the requested minimum 1.5");

    const browserDownsampled = evaluateRendererCaptureQuality({
      cssWidth: 1280,
      cssHeight: 720,
      backingWidth: 2560,
      backingHeight: 1440,
      screenshotWidth: 1280,
      screenshotHeight: 720,
      minimumEffectiveDpr: 2
    });

    expect(browserDownsampled).toMatchObject({
      status: "partial",
      effectiveBackingDprX: 2,
      effectiveCaptureDprX: 1,
      captureToBackingScaleX: 0.5,
      captureToBackingScaleY: 0.5,
      captureDownsamplesCanvas: true,
      captureUpscalesCanvas: false
    });
    expect(browserDownsampled.warnings.join(" ")).toContain("downsampling renderer detail");
  });

  it("flags frame cadence and capture stalls that can make high-resolution screenshots look unstable", () => {
    expect(evaluateRendererFrameCadence({
      targetFrameMs: 16.667,
      renderMs: 6,
      loopMs: 10,
      frameIntervalMs: 16.4,
      readbackMs: 1.5,
      screenshotCaptureOverheadMs: 0,
      sampleCount: 8
    })).toMatchObject({
      status: "supported",
      stableForCapture: true,
      renderBudgetRatio: 0.36,
      loopBudgetRatio: 0.6
    });

    const stalled = evaluateRendererFrameCadence({
      targetFrameMs: 16.667,
      renderMs: 23,
      loopMs: 41,
      frameIntervalMs: 58,
      readbackMs: 12,
      screenshotCaptureOverheadMs: 92,
      sampleCount: 4
    });

    expect(stalled).toMatchObject({
      status: "partial",
      stableForCapture: false,
      renderBudgetRatio: 1.38,
      loopBudgetRatio: 2.46,
      readbackBudgetRatio: 0.72
    });
    expect(stalled.frameIntervalBudgetRatio).toBeCloseTo(3.48, 2);
    expect(stalled.captureOverheadFrames).toBeCloseTo(5.52, 2);
    expect(stalled.warnings.join(" ")).toContain("exceeds the");
    expect(stalled.warnings.join(" ")).toContain("stall artifacts");
  });
});
