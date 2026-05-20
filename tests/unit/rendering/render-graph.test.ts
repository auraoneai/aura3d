import { describe, expect, it } from "vitest";
import {
  BloomPass,
  FXAAPass,
  MockRenderDevice,
  RenderGraph,
  ToneMappingPass,
  applyToneMappingPreset,
  bloomFloatPixels,
  bloomPixels,
  chromaticAberrationPixels,
  colorGradePixels,
  computeAutoExposureFromHistogram,
  computeExposureHistogramFromPixels,
  createDepthTextureBinding,
  depthOfFieldPixels,
  filmGrainPixels,
  fxaaPixels,
  motionBlurPixels,
  outlinePixels,
  ssaoPixels,
  ssrPixels,
  taaPixels,
  toneMapFloatPixels,
  toneMapPixels,
  toneMappingPresets,
  resolveToneMappingPreset,
  type RenderPass,
  type RenderPassContext,
  type RenderTarget
} from "../../../packages/rendering/src";

describe("RenderGraph", () => {
  it("orders passes by declared resource dependencies", () => {
    const graph = new RenderGraph();
    const order: string[] = [];
    graph.addPass(pass("lighting", ["gbuffer"], ["color"], order));
    graph.addPass(pass("geometry", [], ["gbuffer"], order));

    graph.execute({ device: new MockRenderDevice(), width: 1, height: 1 });

    expect(order).toEqual(["geometry", "lighting"]);
  });

  it("reports deterministic frame resource lifetimes in compile plans", () => {
    const graph = new RenderGraph();
    const order: string[] = [];
    graph.addPass(pass("post", ["lit"], ["present"], order));
    graph.addPass(pass("lighting", ["gbuffer"], ["lit"], order));
    graph.addPass(pass("geometry", [], ["gbuffer"], order));

    const plan = graph.compilePlan();

    expect(plan.passes.map((renderPass) => renderPass.name)).toEqual(["geometry", "lighting", "post"]);
    expect(plan.resources).toEqual([
      { name: "gbuffer", writer: "geometry", readers: ["lighting"], firstPassIndex: 0, lastPassIndex: 1 },
      { name: "lit", writer: "lighting", readers: ["post"], firstPassIndex: 1, lastPassIndex: 2 },
      { name: "present", writer: "post", readers: [], firstPassIndex: 2, lastPassIndex: 2 }
    ]);
  });

  it("rejects missing producers", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("lighting", ["gbuffer"], ["color"], []));

    expect(() => graph.compile()).toThrow(/no pass writes/);
  });

  it("rejects duplicate writers", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("a", [], ["color"], []));
    graph.addPass(pass("b", [], ["color"], []));

    expect(() => graph.compile()).toThrow(/written by both/);
  });

  it("rejects undeclared read-write hazards and malformed resource declarations", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("in-place-color", ["color"], ["color"], []));

    expect(() => graph.compile()).toThrow(/reads and writes color/);

    const duplicateReads = new RenderGraph();
    duplicateReads.addPass(pass("duplicate-read", ["color", "color"], [], []));
    expect(() => duplicateReads.compile()).toThrow(/duplicate reads resource: color/);

    const emptyWrites = new RenderGraph();
    emptyWrites.addPass(pass("empty-write", [], [""], []));
    expect(() => emptyWrites.compile()).toThrow(/writes an empty frame resource/);
  });

  it("allows explicitly declared in-place render graph hazards", () => {
    const graph = new RenderGraph();
    const order: string[] = [];
    graph.addPass(pass("particles", ["color"], ["color"], order, ["color"]));

    graph.execute({ device: new MockRenderDevice(), width: 1, height: 1 });

    expect(order).toEqual(["particles"]);
  });

  it("rejects empty in-place hazard allowances", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("forward", [], ["color"], [], [""]));

    expect(() => graph.compile()).toThrow(/empty in-place hazard resource/);
  });

  it("tone maps source render target pixels into a post-process output target", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 2, height: 1, label: "hdr-color" });
    const output = device.createRenderTarget({ width: 2, height: 1, label: "ldr-color" });
    device.beginFrame(2, 1);
    device.setRenderTarget(source);
    device.clear([1, 0.25, 0, 1]);

    const pass = new ToneMappingPass({ source, target: output, exposure: 2, gamma: 1, operator: "reinhard" });
    pass.execute({ device, width: 2, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([170, 85, 0, 255]);
    expect(Array.from(pass.getLastResult()?.pixels.slice(0, 4) ?? [])).toEqual([170, 85, 0, 255]);
    device.endFrame();
  });

  it("presents tone-mapped post-process pixels to the device backbuffer when no output target is supplied", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 1, height: 1, label: "hdr-backbuffer-source" });
    device.beginFrame(1, 1);
    device.setRenderTarget(source);
    device.clear([1, 0.25, 0, 1]);

    const pass = new ToneMappingPass({ source, exposure: 2, gamma: 1, operator: "reinhard" });
    pass.execute({ device, width: 1, height: 1 });

    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([170, 85, 0, 255]);
    expect(device.captureState().get("frameActive")).toBe(true);
    device.endFrame();
  });

  it("tone maps float HDR render targets through the ToneMappingPass", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 2, height: 1, label: "float-hdr-source", format: "rgba32f" });
    const output = device.createRenderTarget({ width: 2, height: 1, label: "float-ldr-output" });
    device.beginFrame(2, 1);
    device.setRenderTarget(source);
    device.clear([2.5, 0.5, 0.125, 1]);

    const pass = new ToneMappingPass({ source, target: output, exposure: 1, gamma: 1, operator: "reinhard" });
    pass.execute({ device, width: 2, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([182, 85, 28, 255]);
    expect((pass.getLastResult() as { readonly inputOverbrightPixels?: number } | null)?.inputOverbrightPixels).toBe(2);
    device.endFrame();
  });

  it("validates tone mapping dimensions and options", () => {
    expect(() => toneMapPixels(new Uint8Array(3), 1, 1)).toThrow(/RGBA/);
    expect(() => toneMapPixels(new Uint8Array(4), 1, 1, { exposure: -1 })).toThrow(/exposure/);
    expect(() => toneMapPixels(new Uint8Array(4), 1, 1, { whitePoint: 0 })).toThrow(/whitePoint/);
    expect(() => new ToneMappingPass({ source: new MockRenderDevice().createRenderTarget({ width: 1, height: 1 }), gamma: 0 })).toThrow(/gamma/);
  });

  it("keeps linear tone-map output linear instead of applying a display gamma curve", () => {
    const pixels = new Uint8Array([128, 128, 128, 255]);

    const linear = toneMapPixels(pixels, 1, 1, {
      exposure: 1,
      gamma: 2.2,
      operator: "linear",
      inputColorSpace: "linear",
      outputColorSpace: "linear"
    });
    const srgb = toneMapPixels(pixels, 1, 1, {
      exposure: 1,
      gamma: 2.2,
      operator: "linear",
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    });

    expect(Array.from(linear.pixels)).toEqual([128, 128, 128, 255]);
    expect(srgb.pixels[0]).toBeGreaterThan(linear.pixels[0]!);
    expect(srgb.pixels[1]).toBeGreaterThan(linear.pixels[1]!);
    expect(srgb.pixels[2]).toBeGreaterThan(linear.pixels[2]!);
  });

  it("supports ACES, filmic, Uncharted2, AgX, and neutral tone mapping operators", () => {
    const pixels = new Uint8Array([220, 140, 80, 255]);
    const aces = toneMapPixels(pixels, 1, 1, { exposure: 1.4, gamma: 1, operator: "aces" });
    const filmic = toneMapPixels(pixels, 1, 1, { exposure: 1.4, gamma: 1, operator: "filmic" });
    const uncharted2 = toneMapPixels(pixels, 1, 1, { exposure: 1.4, gamma: 1, operator: "uncharted2" });
    const agx = toneMapPixels(pixels, 1, 1, { exposure: 1.4, gamma: 1, operator: "agx" });
    const neutral = toneMapPixels(pixels, 1, 1, { exposure: 1.4, gamma: 1, operator: "neutral" });

    expect(aces.calibration.operator).toBe("aces");
    expect(filmic.calibration.operator).toBe("filmic");
    expect(uncharted2.calibration.operator).toBe("uncharted2");
    expect(agx.calibration.operator).toBe("agx");
    expect(neutral.calibration.operator).toBe("neutral");
    expect(Array.from(aces.pixels.slice(0, 3))).not.toEqual(Array.from(filmic.pixels.slice(0, 3)));
    expect(new Set([aces, filmic, uncharted2, agx, neutral].map((result) => Array.from(result.pixels.slice(0, 3)).join(",")))).toHaveLength(5);
    expect(filmic.calibration.monotonic).toBe(true);
    expect(uncharted2.calibration.monotonic).toBe(true);
    expect(agx.calibration.monotonic).toBe(true);
    expect(neutral.calibration.monotonic).toBe(true);
  });

  it("keeps filmic tone mapping from lifting near-black renderer clear colors", () => {
    const pixels = new Uint8Array([3, 4, 6, 255]);
    const result = toneMapPixels(pixels, 1, 1, {
      exposure: 1.15,
      operator: "filmic",
      inputColorSpace: "linear",
      outputColorSpace: "srgb"
    });

    expect(result.pixels[0]).toBeLessThanOrEqual(34);
    expect(result.pixels[1]).toBeLessThanOrEqual(39);
    expect(result.pixels[2]).toBeLessThanOrEqual(48);
    expect(result.calibration.monotonic).toBe(true);
  });

  it("resolves old-branch tone mapping presets with histogram-backed auto exposure", () => {
    const pixels = new Uint8Array([
      8, 10, 12, 255, 220, 190, 120, 255,
      22, 28, 34, 255, 255, 240, 210, 255
    ]);

    const cinematic = resolveToneMappingPreset("cinematic");
    const histogram = computeExposureHistogramFromPixels(pixels, 2, 2, { binCount: 16, inputColorSpace: "srgb" });
    const autoExposure = computeAutoExposureFromHistogram(histogram, {
      previousExposure: 1,
      adaptationSpeed: cinematic.adaptationSpeed,
      minExposure: cinematic.minExposure,
      maxExposure: cinematic.maxExposure
    });
    const result = applyToneMappingPreset(pixels, 2, 2, "cinematic", {
      previousExposure: 1,
      deltaTimeSeconds: 1 / 30,
      inputColorSpace: "srgb",
      outputColorSpace: "srgb"
    });

    expect(toneMappingPresets.vibrant.toneMapping.operator).toBe("uncharted2");
    expect(cinematic.toneMapping.operator).toBe("aces");
    expect(cinematic.colorGrade.contrast).toBe(1.1);
    expect(histogram.pixelCount).toBe(4);
    expect(histogram.bins.reduce((sum, count) => sum + count, 0)).toBe(4);
    expect(autoExposure.exposure).toBeGreaterThan(0);
    expect(result.preset).toBe("cinematic");
    expect(result.autoExposure?.averageLuminance).toBeGreaterThan(0);
    expect(result.toneMapped.calibration.operator).toBe("aces");
    expect(result.colorGraded.changedPixels).toBeGreaterThan(0);
    expect(Array.from(result.pixels)).not.toEqual(Array.from(pixels));
    expect(() => computeExposureHistogramFromPixels(pixels, 2, 2, { binCount: 3 })).toThrow(/binCount/);
    expect(() => computeAutoExposureFromHistogram({ ...histogram, bins: [], binCount: 16 })).toThrow(/histogram/);
  });

  it("tone maps overbright float HDR pixels into LDR output", () => {
    const pixels = new Float32Array([
      2.5, 0.5, 0.125, 1,
      0.25, 1.75, 2.25, 1
    ]);

    const result = toneMapFloatPixels(pixels, 2, 1, { exposure: 1, gamma: 1, operator: "reinhard" });

    expect(result.inputOverbrightPixels).toBe(2);
    expect(result.maxInputValue).toBe(2.5);
    expect(result.calibration.inputColorSpace).toBe("linear");
    expect(Array.from(result.pixels.slice(0, 4))).toEqual([182, 85, 28, 255]);
    expect(result.pixels[5]).toBeGreaterThan(150);
    expect(() => toneMapFloatPixels(new Float32Array([Number.NaN, 0, 0, 1]), 1, 1)).toThrow(/non-finite/);
  });

  it("color grades contrast, temperature, tint, saturation, vibrance, vignette, and sharpening", () => {
    const pixels = new Uint8Array([
      24, 36, 48, 255, 60, 80, 120, 255, 28, 42, 56, 255,
      72, 80, 88, 255, 110, 118, 124, 255, 82, 90, 108, 255,
      18, 30, 44, 255, 52, 62, 78, 255, 22, 28, 36, 255
    ]);

    const result = colorGradePixels(pixels, 3, 3, {
      contrast: 1.35,
      temperature: 0.4,
      tint: 0.25,
      saturation: 1.25,
      vibrance: 0.35,
      vignette: 0.45,
      sharpening: 0.8
    });

    expect(result.changedPixels).toBeGreaterThan(0);
    expect(result.vignetteDarkenedPixels).toBeGreaterThan(0);
    expect(result.sharpenedPixels).toBeGreaterThan(0);
    expect(result.settings.contrast).toBe(1.35);
    expect(() => colorGradePixels(pixels, 3, 3, { vignette: 2 })).toThrow(/vignette/);
  });

  it("applies deterministic chromatic aberration, film grain, depth of field, outline, motion blur, SSAO, SSR, and TAA pixels", () => {
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      40, 60, 80, 255, 120, 140, 160, 255, 200, 220, 240, 255,
      255, 240, 40, 255, 40, 220, 255, 255, 180, 60, 220, 255
    ]);
    const depth = createDepthTextureBinding({
      label: "dof-depth",
      width: 3,
      height: 3,
      data: new Float32Array([
        0.1, 0.48, 0.92,
        0.12, 0.5, 0.9,
        0.08, 0.52, 0.88
      ])
    });
    const velocity = new Float32Array([
      0, 0, 1, 0, 0, 0,
      0, 0, 1, 0, 0, 0,
      0, 0, 1, 0, 0, 0
    ]);

    const aberration = chromaticAberrationPixels(pixels, 3, 3, { strength: 1.2 });
    const grain = filmGrainPixels(pixels, 3, 3, { intensity: 0.18, seed: 42, monochrome: false });
    const grainRepeat = filmGrainPixels(pixels, 3, 3, { intensity: 0.18, seed: 42, monochrome: false });
    const dof = depthOfFieldPixels(pixels, 3, 3, { depth, focusDepth: 0.5, focusRange: 0.08, maxRadius: 1 });
    const outline = outlinePixels(pixels, 3, 3, { color: [255, 200, 40, 255], width: 1, threshold: 0.2, opacity: 0.9 });
    const motion = motionBlurPixels(pixels, 3, 3, { velocity, samples: 3, scale: 1 });
    const ssao = ssaoPixels(pixels, 3, 3, { depth, radius: 1, intensity: 0.8, bias: 0.01 });
    const ssr = ssrPixels(pixels, 3, 3, { depth, intensity: 0.75, maxDistance: 2 });
    const history = new Uint8Array(pixels.map((value, index) => index % 4 === 3 ? 255 : Math.max(0, value - 24)));
    const taa = taaPixels(pixels, 3, 3, { history, blend: 0.25 });

    expect(aberration.changedPixels).toBeGreaterThan(0);
    expect(aberration.maxChannelOffsetPixels).toBeGreaterThan(0);
    expect(grain.changedPixels).toBeGreaterThan(0);
    expect(Array.from(grain.pixels)).toEqual(Array.from(grainRepeat.pixels));
    expect(dof.blurredPixels).toBeGreaterThan(0);
    expect(dof.focusDepth).toBe(0.5);
    expect(outline.method).toBe("sobel-luma");
    expect(outline.outlinedPixels).toBeGreaterThan(0);
    expect(outline.changedPixels).toBeGreaterThan(0);
    expect(outline.maxGradient).toBeGreaterThan(0);
    expect(motion.blurredPixels).toBe(3);
    expect(motion.maxVelocityPixels).toBe(1);
    expect(ssao.occludedPixels).toBeGreaterThan(0);
    expect(ssao.averageOcclusion).toBeGreaterThan(0);
    expect(ssr.reflectedPixels).toBeGreaterThan(0);
    expect(ssr.maxReflectionBoost).toBeGreaterThan(0);
    expect(taa.blendedPixels).toBeGreaterThan(0);
    expect(taa.blend).toBe(0.25);
    expect(() => chromaticAberrationPixels(pixels, 3, 3, { strength: 3 })).toThrow(/strength/);
    expect(() => filmGrainPixels(pixels, 3, 3, { intensity: 2 })).toThrow(/intensity/);
    expect(() => depthOfFieldPixels(pixels, 3, 3, { depth, focusRange: 0 })).toThrow(/focusRange/);
    expect(() => outlinePixels(pixels, 3, 3, { width: 0 })).toThrow(/width/);
    expect(() => motionBlurPixels(pixels, 3, 3, { velocity: new Float32Array(2) })).toThrow(/velocity/);
    expect(() => ssaoPixels(pixels, 3, 3, { depth, radius: 9 })).toThrow(/radius/);
    expect(() => ssrPixels(pixels, 3, 3, { depth, maxDistance: 0 })).toThrow(/maxDistance/);
    expect(() => taaPixels(pixels, 3, 3, { history: new Uint8Array(4) })).toThrow(/history/);
  });

  it("blooms bright source pixels into neighboring post-process output pixels", () => {
    const pixels = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    const result = bloomPixels(pixels, 3, 1, { threshold: 0.9, intensity: 1, radius: 1 });

    expect(result.pipeline).toEqual(["bright-extract", "horizontal-blur", "vertical-blur", "composite"]);
    expect(Array.from(result.brightPixels)).toEqual([
      0, 0, 0, 0,
      255, 255, 255, 255,
      0, 0, 0, 0
    ]);
    expect(Array.from(result.horizontalBlurPixels)).toEqual([
      85, 85, 85, 85,
      85, 85, 85, 85,
      85, 85, 85, 85
    ]);
    expect(Array.from(result.verticalBlurPixels)).toEqual([
      85, 85, 85, 85,
      85, 85, 85, 85,
      85, 85, 85, 85
    ]);
    expect(Array.from(result.pixels)).toEqual([
      85, 85, 85, 255,
      255, 255, 255, 255,
      85, 85, 85, 255
    ]);
  });

  it("runs bloom as a render graph pass with deterministic readback", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 1, label: "lit-color" }) as RenderTarget & { colorPixels: Uint8Array };
    const output = device.createRenderTarget({ width: 3, height: 1, label: "bloom-color" });
    source.colorPixels.set([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    device.beginFrame(3, 1);
    const pass = new BloomPass({ source, target: output, threshold: 0.9, intensity: 1, radius: 1 });
    pass.execute({ device, width: 3, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 3, 1))).toEqual([
      85, 85, 85, 255,
      255, 255, 255, 255,
      85, 85, 85, 255
    ]);
    expect(Array.from(pass.getLastResult()?.pixels.slice(0, 4) ?? [])).toEqual([85, 85, 85, 255]);
    expect(pass.getLastResult()?.pipeline).toEqual(["bright-extract", "horizontal-blur", "vertical-blur", "composite"]);
    expect(pass.getLastResult()?.changedPixels).toBe(2);
    expect(pass.getLastResult()?.maxChannelDelta).toBe(85);
    device.endFrame();
  });

  it("reports when LDR bloom detects bright pixels but cannot visibly change saturated output", () => {
    const pixels = new Uint8Array([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);

    const result = bloomPixels(pixels, 3, 1, { threshold: 0.9, intensity: 1, radius: 1 });

    expect(result.brightPixelCount).toBe(3);
    expect(result.changedPixels).toBe(0);
    expect(result.maxChannelDelta).toBe(0);
    expect(Array.from(result.pixels)).toEqual(Array.from(pixels));
  });

  it("reports HDR bloom changes before tone mapping clamps to displayable output", () => {
    const pixels = new Float32Array([
      0, 0, 0, 1,
      4, 2, 1, 1,
      0, 0, 0, 1
    ]);

    const result = bloomFloatPixels(pixels, 3, 1, { threshold: 0.9, intensity: 0.5, radius: 1 });

    expect(result.brightPixelCount).toBe(1);
    expect(result.pipeline).toEqual(["bright-extract", "horizontal-blur", "vertical-blur", "composite"]);
    expect(Array.from(result.horizontalBlurPixels.slice(0, 4))).toEqual([
      1.3333333730697632,
      0.6666666865348816,
      0.3333333432674408,
      0.3333333432674408
    ]);
    expect(Array.from(result.verticalBlurPixels.slice(0, 4))).toEqual(Array.from(result.horizontalBlurPixels.slice(0, 4)));
    expect(result.changedPixels).toBe(3);
    expect(result.maxChannelDelta).toBeGreaterThan(0);
    expect(result.maxInputValue).toBe(4);
  });

  it("validates bloom dimensions and options", () => {
    expect(() => bloomPixels(new Uint8Array(3), 1, 1)).toThrow(/RGBA/);
    expect(() => bloomPixels(new Uint8Array(4), 1, 1, { threshold: 2 })).toThrow(/threshold/);
    expect(() => bloomPixels(new Uint8Array(4), 1, 1, { intensity: -1 })).toThrow(/intensity/);
    expect(() => bloomPixels(new Uint8Array(4), 1, 1, { radius: 1.5 })).toThrow(/radius/);
  });

  it("smooths high-contrast post-process edges with deterministic FXAA pixels", () => {
    const pixels = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    const result = fxaaPixels(pixels, 3, 1, { edgeThreshold: 0.1, subpixelBlend: 1 });

    expect(Array.from(result.edgeMask)).toEqual([255, 255, 255]);
    expect(Array.from(result.pixels)).toEqual([
      64, 64, 64, 255,
      128, 128, 128, 255,
      64, 64, 64, 255
    ]);
  });

  it("runs FXAA as a render graph pass with deterministic readback", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 1, label: "aliased-color" }) as RenderTarget & { colorPixels: Uint8Array };
    const output = device.createRenderTarget({ width: 3, height: 1, label: "fxaa-color" });
    source.colorPixels.set([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    device.beginFrame(3, 1);
    const pass = new FXAAPass({ source, target: output, edgeThreshold: 0.1, subpixelBlend: 1 });
    pass.execute({ device, width: 3, height: 1 });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 3, 1))).toEqual([
      64, 64, 64, 255,
      128, 128, 128, 255,
      64, 64, 64, 255
    ]);
    expect(Array.from(pass.getLastResult()?.edgeMask ?? [])).toEqual([255, 255, 255]);
    device.endFrame();
  });

  it("validates FXAA dimensions and options", () => {
    expect(() => fxaaPixels(new Uint8Array(3), 1, 1)).toThrow(/RGBA/);
    expect(() => fxaaPixels(new Uint8Array(4), 1, 1, { edgeThreshold: -0.1 })).toThrow(/edgeThreshold/);
    expect(() => fxaaPixels(new Uint8Array(4), 1, 1, { subpixelBlend: 1.1 })).toThrow(/subpixelBlend/);
  });
});

function pass(name: string, reads: readonly string[], writes: readonly string[], order: string[], allowReadWriteHazards: readonly string[] = []): RenderPass {
  return {
    name,
    reads,
    writes,
    allowReadWriteHazards,
    execute(_context: RenderPassContext): void {
      order.push(name);
    }
  };
}
