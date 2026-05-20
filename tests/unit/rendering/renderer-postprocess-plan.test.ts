import { describe, expect, it } from "vitest";
import {
  Renderer,
  createRendererPostprocessPlanDiagnostics
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
      executionMode: "renderer-owned-pass-chain-readback",
      canFuseLdr: false,
      missingInputs: []
    });
    expect(diagnostics.postprocessPlan?.passes).toEqual([
      expect.objectContaining({
        name: "tone-mapping",
        rendererOwned: true,
        publicPixelKernel: true,
        usesReadback: true
      })
    ]);
    renderer.dispose();
  });
});
