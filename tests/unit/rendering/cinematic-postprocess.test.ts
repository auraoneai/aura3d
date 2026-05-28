import { describe, expect, it } from "vitest";
import {
  createCinematicDepthCompositionPlan,
  createCinematicPostProcessStack,
  createDomOverlayEvidenceFlag,
  createEmissivePracticalLightSystem,
  createFogVolumeSystem,
  createRainParticleSystem,
  createWetReflectionApproximation,
  validateRendererOwnedCinematicEvidence
} from "../../../packages/rendering/src";

describe("cinematic postprocess and VFX scaffolding", () => {
  it("builds a bounded renderer-owned postprocess stack", () => {
    const stack = createCinematicPostProcessStack({ colorGradePreset: "neon-noir", fogOrHaze: true, glow: true });

    expect(stack.rendererOptions).toMatchObject({
      targetFormat: "rgba16f",
      bloom: { threshold: expect.any(Number), intensity: expect.any(Number) },
      toneMapping: { operator: "filmic" },
      fxaa: true
    });
    expect(stack.rendererOwnedEvidence.map((flag) => flag.feature)).toEqual(expect.arrayContaining(["postprocess"]));
    expect(stack.rendererOwnedEvidence.every((flag) => flag.rendererOwned && !flag.domOverlay)).toBe(true);
  });

  it("creates rain and fog as renderer-owned VFX, not DOM overlays", () => {
    const rain = createRainParticleSystem({ particleCount: 64, seed: 2 });
    const fog = createFogVolumeSystem({ id: "fog-test" });
    const wet = createWetReflectionApproximation();
    const practical = createEmissivePracticalLightSystem([
      { id: "neon-sign", sourceObjectId: "sign", color: [0, 0.8, 1], intensity: 2, radiusMeters: 1.2 }
    ]);

    expect(rain.particleCount).toBe(64);
    expect(rain.renderItem.geometry.topology).toBe("points");
    expect(rain.rendererOwnedEvidence).toMatchObject({ feature: "vfx", rendererOwned: true, domOverlay: false });
    expect(fog.rendererOwnedEvidence).toMatchObject({ feature: "vfx", rendererOwned: true, domOverlay: false });
    expect(wet).toMatchObject({ planarReflection: false, rendererOwnedEvidence: { feature: "material", rendererOwned: true } });
    expect(practical.lights[0]).toMatchObject({ role: "practical", type: "point", intensity: 2 });
  });

  it("rejects DOM-only public cinematic evidence", () => {
    const validation = validateRendererOwnedCinematicEvidence([
      createDomOverlayEvidenceFlag({ id: "overlay-rain", feature: "vfx", label: "CSS rain" })
    ], ["vfx"]);

    expect(validation).toMatchObject({
      ok: false,
      code: "AURA_CINEMATIC_DOM_OVERLAY_EVIDENCE_REJECTED",
      missingRendererOwnedFeatures: ["vfx"],
      overlayOnlyFeatures: ["vfx"]
    });
  });

  it("tracks depth-aware composition and camera-sorted fallback explicitly", () => {
    expect(createCinematicDepthCompositionPlan({ depthTextureAvailable: true })).toMatchObject({
      mode: "depth-aware",
      depthTextureRequired: true
    });
    expect(createCinematicDepthCompositionPlan({ depthTextureAvailable: false })).toMatchObject({
      mode: "camera-sorted",
      fallback: "camera-sorted-transparent-cards"
    });
  });
});
