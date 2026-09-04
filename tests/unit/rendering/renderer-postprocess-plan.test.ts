import { describe, expect, it } from "vitest";
import {
  Renderer,
  createDepthTextureBinding,
  createRendererPostprocessPlanDiagnostics,
  type MotionBlurOptions,
  type SSAOOptions,
  type SSROptions,
  type TAAOptions
} from "../../../packages/rendering/src";

describe("renderer postprocess plan diagnostics", () => {
  it("describes the bounded reactor default stack as a fused renderer-owned LDR plan", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" },
      colorGrade: { contrast: 1.08, saturation: 1.02, vignette: 0.28, sharpening: 0.04 },
      bloom: false,
      filmGrain: false,
      fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.55 }
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      source: "Renderer.postprocessPlan",
      passCount: 3,
      passNames: ["tone-mapping", "color-grade", "fxaa"],
      targetFormat: "rgba8",
      sourceTargetFormat: "rgba8",
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      requiresDepthTexture: false,
      missingInputs: [],
      readbackPassNames: [],
      clarityWarnings: []
    });
    expect(plan.passes.map((pass) => pass.name)).toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(plan.claimBoundary).toContain("does not prove EffectComposer parity");
  });

  it("keeps native-capable passes on the explicit deterministic CPU path", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      execution: "cpu-deterministic",
      toneMapping: false,
      colorGrade: { contrast: 1.08 },
      taa: {
        history: new Uint8Array(3 * 2 * 4).fill(64),
        velocity: new Float32Array(3 * 2 * 2).fill(0.5),
        blend: 0.2
      } as TAAOptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["color-grade", "taa", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-readback",
      canFuseLdr: true,
      missingInputs: [],
      readbackPassNames: ["color-grade", "taa", "fxaa"]
    });
    expect(plan.passes.every((pass) => pass.usesReadback)).toBe(true);
    expect(plan.plannedVsActual).toMatchObject({
      requested: ["color-grade", "taa", "fxaa"],
      submitted: ["color-grade", "taa", "fxaa"],
      pixelBacked: ["color-grade", "taa", "fxaa"],
      dropped: [],
      missingInputs: []
    });
  });

  it("ranks LDR bloom before tone mapping in the native fused plan", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      bloom: { threshold: 0.72, intensity: 0.4, radius: 2 },
      toneMapping: { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" },
      colorGrade: { contrast: 1.08, saturation: 1.02 },
      fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.55 }
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["bloom", "tone-mapping", "color-grade", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      readbackPassNames: []
    });
    expect(plan.passes).toEqual([
      expect.objectContaining({ name: "bloom", usesReadback: false }),
      expect.objectContaining({ name: "tone-mapping", usesReadback: false }),
      expect.objectContaining({ name: "color-grade", usesReadback: false }),
      expect.objectContaining({ name: "fxaa", usesReadback: false })
    ]);
  });

  it("keeps HDR bloom and tone mapping on the native GPU presentation path", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      bloom: { threshold: 0.72, intensity: 0.4, radius: 2 },
      toneMapping: { exposure: 1.08, operator: "filmic" },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba16f",
      targetFormat: "rgba16f",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["bloom", "tone-mapping", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      readbackPassNames: []
    });
    expect(plan.passes.every((pass) => !pass.usesReadback)).toBe(true);
  });

  it("routes LDR outline through native fusion after color grading without readback", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      colorGrade: { contrast: 1.05 },
      outline: { color: [255, 188, 64, 255], width: 2, threshold: 0.22, opacity: 0.85 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["color-grade", "outline", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      readbackPassNames: []
    });
    expect(plan.passes).toEqual([
      expect.objectContaining({ name: "color-grade", usesReadback: false }),
      expect.objectContaining({ name: "outline", usesReadback: false }),
      expect.objectContaining({ name: "fxaa", usesReadback: false })
    ]);
  });

  it("uses a tone-mapped LDR intermediate before native HDR-source outline", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: { operator: "filmic" },
      outline: true,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba16f",
      targetFormat: "rgba16f",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["tone-mapping", "outline", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      readbackPassNames: []
    });
  });

  it("routes renderer-depth SSAO through native fusion with no readback", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      ssao: {
        radius: 2,
        intensity: 0.7,
        bias: 0.01,
        normals: new Float32Array(3 * 2 * 3).fill(0.5)
      } as SSAOOptions,
      outline: false,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      rendererDepthAvailable: true,
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["ssao", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      requiresDepthTexture: true,
      missingInputs: [],
      readbackPassNames: []
    });
    expect(plan.passes[0]).toMatchObject({
      name: "ssao",
      requiresDepth: true,
      usesRendererOwnedDepth: true,
      requiresNormals: true,
      hasNormalsInput: true,
      submitted: true,
      pixelBacked: true,
      missingInputs: [],
      usesReadback: false
    });
  });

  it("routes renderer-depth SSR after SSAO through native fusion with no readback", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      ssao: {
        radius: 2,
        intensity: 0.7,
        bias: 0.01,
        normals: new Float32Array(3 * 2 * 3).fill(0.5)
      } as SSAOOptions,
      ssr: {
        intensity: 0.6,
        maxDistance: 8,
        normals: new Float32Array(3 * 2 * 3).fill(0.5)
      } as SSROptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      rendererDepthAvailable: true,
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["ssao", "ssr", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      missingInputs: [],
      readbackPassNames: []
    });
    expect(plan.passes[1]).toMatchObject({
      name: "ssr",
      requiresDepth: true,
      usesRendererOwnedDepth: true,
      requiresNormals: true,
      hasNormalsInput: true,
      submitted: true,
      pixelBacked: true,
      missingInputs: [],
      usesReadback: false
    });
  });

  it("routes renderer-depth depth-of-field through native fusion with no readback", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      depthOfField: { focusDepth: 0.5, focusRange: 0.1, maxRadius: 3 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      rendererDepthAvailable: true,
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["depth-of-field", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      missingInputs: [],
      readbackPassNames: []
    });
    expect(plan.passes[0]).toMatchObject({
      name: "depth-of-field",
      requiresDepth: true,
      usesRendererOwnedDepth: true,
      usesReadback: false
    });
  });

  it("routes explicit velocity motion blur through native fusion with no readback", () => {
    const velocity = new Float32Array(3 * 2 * 2).fill(1);
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      motionBlur: { velocity, samples: 5, scale: 1 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["motion-blur", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      missingInputs: [],
      readbackPassNames: []
    });
    expect(plan.passes[0]).toMatchObject({
      name: "motion-blur",
      requiresVelocity: true,
      hasVelocityInput: true,
      usesReadback: false
    });
  });

  it("routes explicit TAA history through native fusion with no readback", () => {
    const history = new Uint8Array(3 * 2 * 4).fill(96);
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      taa: { history, velocity: new Float32Array(3 * 2 * 2).fill(0.25), blend: 0.25 } as TAAOptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan).toMatchObject({
      passNames: ["taa", "fxaa"],
      executionMode: "renderer-owned-fused-ldr-native",
      canFuseLdr: true,
      missingInputs: [],
      readbackPassNames: []
    });
    expect(plan.passes[0]).toMatchObject({
      name: "taa",
      requiresHistory: true,
      hasHistoryInput: true,
      requiresVelocity: true,
      hasVelocityInput: true,
      submitted: true,
      pixelBacked: true,
      missingInputs: [],
      usesReadback: false
    });
  });

  it("flags noisy bloom settings and missing depth input instead of hiding postprocess gaps", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      bloom: { threshold: 0.46, intensity: 0.22, radius: 2 },
      toneMapping: { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" },
      depthOfField: { focusDepth: 0.45, focusRange: 0.1, maxRadius: 4 }
    }, {
      sourceTargetFormat: "rgba16f",
      targetFormat: "rgba16f",
      rendererDepthAvailable: false,
      nativeLdrPostprocess: false
    });

    expect(plan.executionMode).toBe("renderer-owned-pass-chain-readback");
    expect(plan.canFuseLdr).toBe(false);
    expect(plan.passNames).toEqual(["bloom", "tone-mapping", "depth-of-field"]);
    expect(plan.missingInputs).toContain("depth-of-field:depth");
    expect(plan.clarityWarnings).toContain("bloom-noise-risk threshold=0.46 intensity=0.22 radius=2");
    expect(plan.clarityWarnings).toContain("multi-pass-readback-cost");
    expect(plan.readbackPassNames).toEqual(["bloom", "tone-mapping", "depth-of-field"]);
  });

  it("publishes the renderer plan through frame diagnostics", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 2, height: 1, clearColor: [1, 0.25, 0, 1] });

    const diagnostics = renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: { exposure: 2, gamma: 1, operator: "reinhard", outputColorSpace: "linear" }
      }
    });

    expect(diagnostics.postprocessPlan).toMatchObject({
      source: "Renderer.postprocessPlan",
      passCount: 1,
      passNames: ["tone-mapping"],
      executionMode: "renderer-owned-fused-ldr-readback",
      canFuseLdr: true,
      missingInputs: []
    });
    expect(diagnostics.postprocessPlan).toMatchObject({
      requestedPassNames: ["tone-mapping"],
      submittedPassNames: ["tone-mapping"],
      pixelBackedPassNames: ["tone-mapping"],
      plannedVsActual: {
        requested: ["tone-mapping"],
        submitted: ["tone-mapping"],
        pixelBacked: ["tone-mapping"],
        dropped: [],
        missingInputs: []
      },
      costEstimate: {
        bytesPerPixel: 4,
        frameWidth: 2,
        frameHeight: 1,
        frameBytes: 8,
        requestedPasses: 1,
        submittedPasses: 1,
        estimatedTargets: 1,
        estimatedBytes: 8,
        warns: false,
        warning: null
      }
    });
    expect(diagnostics.postprocessPlan?.passes).toEqual([
      expect.objectContaining({
        name: "tone-mapping",
        rendererOwned: true,
        publicPixelKernel: true,
        submitted: true,
        pixelBacked: true,
        missingInputs: [],
        usesReadback: true
      })
    ]);
    renderer.dispose();
  });

  it("fails closed with a named depth input for depth-of-field", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      depthOfField: { focusDepth: 0.5, focusRange: 0.1, maxRadius: 3 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      rendererDepthAvailable: false,
      nativeLdrPostprocess: true
    });

    expect(plan.missingInputs).toEqual(["depth-of-field:depth"]);
    expect(plan.requestedPassNames).toEqual(["depth-of-field", "fxaa"]);
    expect(plan.submittedPassNames).toEqual(["fxaa"]);
    expect(plan.pixelBackedPassNames).toEqual(["fxaa"]);
    expect(plan.plannedVsActual).toEqual({
      requested: ["depth-of-field", "fxaa"],
      submitted: ["fxaa"],
      pixelBacked: ["fxaa"],
      dropped: ["depth-of-field"],
      missingInputs: ["depth-of-field:depth"]
    });
    expect(plan.passes[0]).toMatchObject({
      name: "depth-of-field",
      requiresDepth: true,
      hasDepthInput: false,
      usesRendererOwnedDepth: false,
      submitted: false,
      pixelBacked: false,
      missingInputs: ["depth-of-field:depth"]
    });
  });

  it("fails closed with a named velocity input for motion blur", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      motionBlur: { samples: 5, scale: 1 } as unknown as MotionBlurOptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan.missingInputs).toEqual(["motion-blur:velocity"]);
    expect(plan.plannedVsActual).toMatchObject({
      requested: ["motion-blur", "fxaa"],
      submitted: ["fxaa"],
      pixelBacked: ["fxaa"],
      dropped: ["motion-blur"]
    });
    expect(plan.passes[0]).toMatchObject({
      name: "motion-blur",
      requiresVelocity: true,
      hasVelocityInput: false,
      submitted: false,
      pixelBacked: false,
      missingInputs: ["motion-blur:velocity"]
    });
  });

  it("requires depth plus normals for SSAO and SSR", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      ssao: { radius: 2, intensity: 0.7, bias: 0.01 },
      ssr: { intensity: 0.6, maxDistance: 8 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      rendererDepthAvailable: true,
      nativeLdrPostprocess: true
    });

    expect(plan.missingInputs).toEqual(["ssao:normals", "ssr:normals"]);
    expect(plan.plannedVsActual).toMatchObject({
      requested: ["ssao", "ssr", "fxaa"],
      submitted: ["fxaa"],
      pixelBacked: ["fxaa"],
      dropped: ["ssao", "ssr"]
    });
    expect(plan.passes[0]).toMatchObject({
      name: "ssao",
      requiresDepth: true,
      usesRendererOwnedDepth: true,
      requiresNormals: true,
      hasNormalsInput: false,
      submitted: false,
      pixelBacked: false,
      missingInputs: ["ssao:normals"]
    });
    expect(plan.passes[1]).toMatchObject({
      name: "ssr",
      requiresNormals: true,
      hasNormalsInput: false,
      submitted: false,
      pixelBacked: false,
      missingInputs: ["ssr:normals"]
    });
  });

  it("fails closed with named depth and normals inputs when SSAO has no depth source", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      ssao: { radius: 2, intensity: 0.7, bias: 0.01 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      rendererDepthAvailable: false,
      nativeLdrPostprocess: true
    });

    expect(plan.missingInputs).toEqual(["ssao:depth", "ssao:normals"]);
  });

  it("requires history plus velocity for TAA", () => {
    const historyOnly = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      taa: { history: new Uint8Array(3 * 2 * 4).fill(96), blend: 0.25 } as TAAOptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(historyOnly.missingInputs).toEqual(["taa:velocity"]);
    expect(historyOnly.plannedVsActual).toMatchObject({
      requested: ["taa", "fxaa"],
      submitted: ["fxaa"],
      pixelBacked: ["fxaa"],
      dropped: ["taa"]
    });

    const empty = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      taa: { blend: 0.25 } as unknown as TAAOptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(empty.missingInputs).toEqual(["taa:history", "taa:velocity"]);
    expect(empty.passes[0]).toMatchObject({
      name: "taa",
      requiresHistory: true,
      hasHistoryInput: false,
      requiresVelocity: true,
      hasVelocityInput: false,
      submitted: false,
      pixelBacked: false,
      missingInputs: ["taa:history", "taa:velocity"]
    });
  });

  it("submits explicit depth plus velocity plus history bindings with no missing inputs", () => {
    const depth = createDepthTextureBinding({
      label: "a2-explicit-depth",
      width: 3,
      height: 2,
      data: new Float32Array(3 * 2).fill(0.5)
    });
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: false,
      depthOfField: { depth, focusDepth: 0.5, focusRange: 0.1, maxRadius: 3 },
      motionBlur: { velocity: new Float32Array(3 * 2 * 2).fill(1), samples: 5, scale: 1 },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      nativeLdrPostprocess: true
    });

    expect(plan.missingInputs).toEqual([]);
    expect(plan.plannedVsActual).toMatchObject({
      requested: ["depth-of-field", "motion-blur", "fxaa"],
      submitted: ["depth-of-field", "motion-blur", "fxaa"],
      pixelBacked: ["depth-of-field", "motion-blur", "fxaa"],
      dropped: []
    });
  });

  it("estimates chain cost for the cinematic bloom plus SSAO plus DOF plus TAA chain", () => {
    const depth = createDepthTextureBinding({
      label: "a2-cinematic-depth",
      width: 3,
      height: 2,
      data: new Float32Array(3 * 2).fill(0.5)
    });
    const normals = new Float32Array(3 * 2 * 3).fill(0.5);
    const plan = createRendererPostprocessPlanDiagnostics({
      bloom: { threshold: 0.72, intensity: 0.4, radius: 2 },
      toneMapping: false,
      depthOfField: { depth, focusDepth: 0.5, focusRange: 0.1, maxRadius: 3 },
      ssao: { depth, radius: 2, intensity: 0.7, bias: 0.01, normals } as SSAOOptions,
      ssr: { depth, intensity: 0.6, maxDistance: 8, normals } as SSROptions,
      taa: {
        history: new Uint8Array(3 * 2 * 4).fill(96),
        velocity: new Float32Array(3 * 2 * 2).fill(0.25),
        blend: 0.25
      } as TAAOptions,
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      width: 1920,
      height: 1080,
      nativeLdrPostprocess: true
    });

    expect(plan.missingInputs).toEqual([]);
    expect(plan.costEstimate).toMatchObject({
      bytesPerPixel: 4,
      frameWidth: 1920,
      frameHeight: 1080,
      frameBytes: 1920 * 1080 * 4,
      requestedPasses: 6,
      submittedPasses: 6,
      estimatedTargets: 6,
      estimatedBytes: 6 * 1920 * 1080 * 4,
      warns: true
    });
    expect(plan.costEstimate.warning).toContain("chain-cost-risk");
    expect(plan.clarityWarnings).toContain(plan.costEstimate.warning);
    expect(plan.plannedVsActual.submitted).toEqual(plan.requestedPassNames);
    expect(plan.plannedVsActual.pixelBacked).toEqual(plan.requestedPassNames);
  });

  it("keeps small chains under the cost warning threshold", () => {
    const plan = createRendererPostprocessPlanDiagnostics({
      toneMapping: { exposure: 1.08, operator: "filmic" },
      fxaa: true
    }, {
      sourceTargetFormat: "rgba8",
      targetFormat: "rgba8",
      width: 96,
      height: 64,
      nativeLdrPostprocess: true
    });

    expect(plan.costEstimate).toMatchObject({
      frameBytes: 96 * 64 * 4,
      requestedPasses: 2,
      submittedPasses: 2,
      estimatedBytes: 2 * 96 * 64 * 4,
      warns: false,
      warning: null
    });
    expect(plan.clarityWarnings.filter((warning) => warning.startsWith("chain-cost-risk"))).toEqual([]);
  });
});
