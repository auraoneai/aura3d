import { describe, expect, it } from "vitest";
import {
  createExternalParityEnvironmentLighting,
  createExternalParityDirectionalShadowEvidence,
  createExternalParityFlagshipRenderPresetEvidence,
  createExternalParityGeneratedHdrEnvironmentMapSource,
  createExternalParityRenderPresetEvidence,
  externalParityActiveFeature,
  externalParityBlockedFeature
} from "../../../packages/rendering/src";

describe("ExternalParity render preset evidence", () => {
  it("summarizes active and blocked renderer features for screenshot reports", () => {
    const evidence = createExternalParityRenderPresetEvidence({
      exampleId: "material-showroom",
      screenshotPath: "tests/reports/external-parity-example-screenshots/material-showroom.png",
      exposure: 1.25,
      whitePoint: 1,
      features: [
        externalParityActiveFeature("bounded-pbr", "Browser material pixels passed."),
        externalParityActiveFeature("environment-reflections", "Metallic material changed under environment lighting."),
        externalParityBlockedFeature("hdr", "HDR render targets are not implemented.")
      ]
    });

    expect(evidence).toMatchObject({
      presetId: "aura3d-external-parity-visual-quality-preset",
      presetVersion: 1,
      exampleId: "material-showroom",
      screenshotPath: "tests/reports/external-parity-example-screenshots/material-showroom.png",
      colorManagement: {
        inputColorSpace: "linear",
        outputColorSpace: "srgb",
        exposure: 1.25,
        whitePoint: 1
      },
      activeFeatures: ["bounded-pbr", "environment-reflections"]
    });
    expect(evidence.blockedFeatures).toEqual([
      { feature: "hdr", state: "blocked", reason: "HDR render targets are not implemented." }
    ]);
  });

  it("rejects duplicate features", () => {
    expect(() =>
      createExternalParityRenderPresetEvidence({
        exampleId: "shadow-lab",
        screenshotPath: "tests/reports/external-parity-example-screenshots/shadow-lab.png",
        features: [
          externalParityActiveFeature("directional-shadows", "first"),
          externalParityBlockedFeature("directional-shadows", "second")
        ]
      })
    ).toThrow(/Duplicate ExternalParity render preset feature/);
  });

  it("builds deterministic HDR environment resources for the shared preset", () => {
    const source = createExternalParityGeneratedHdrEnvironmentMapSource("studio", 16, 8);
    const maxValue = Math.max(...source.data);
    expect(source.width).toBe(16);
    expect(source.height).toBe(8);
    expect(maxValue).toBeGreaterThan(1);

    const bundle = createExternalParityEnvironmentLighting("studio");
    expect(bundle.resources.resourceSet).toBe("generated-local-linear-hdr-environment");
    expect(bundle.resources.inputEncoding).toBe("linear-hdr");
    expect(bundle.resources.hdrSource).toBe(true);
    expect(bundle.resources.maxLinearValue).toBeGreaterThan(1);
    expect(bundle.resources.validation).toMatchObject({
      environmentTexture: true,
      brdfLutTexture: true,
      specularMipLevels: true,
      diffuseIrradiance: true
    });
  });

  it("does not hard-block HDR, depth textures, or production shadow sampling when evidence is provided", () => {
    const evidence = createExternalParityFlagshipRenderPresetEvidence({
      exampleId: "root-rendering-quality",
      screenshotPath: "tests/reports/external-parity-root-rendering-quality.png",
      productionPbrEvidence: true,
      directionalShadowEvidence: true,
      productionShadowSamplingEvidence: true,
      postprocessEvidence: true,
      depthTextureEvidence: true,
      hdrRenderTargetEvidence: true,
      lodEvidence: true
    });

    expect(evidence.activeFeatures).toEqual(expect.arrayContaining([
      "pbr",
      "directional-shadows",
      "postprocess-bloom",
      "postprocess-fxaa",
      "depth-textures",
      "hdr",
      "lod"
    ]));
    expect(evidence.blockedFeatures.map((entry) => entry.feature)).not.toEqual(expect.arrayContaining([
      "pbr",
      "directional-shadows",
      "postprocess-bloom",
      "postprocess-fxaa",
      "depth-textures",
      "hdr",
      "lod"
    ]));
    expect(evidence.activeFeatures).not.toContain("bounded-pbr");
    expect(evidence.features.find((entry) => entry.feature === "pbr")?.evidence).toContain("material/shader PBR evidence");
    expect(evidence.features.find((entry) => entry.feature === "directional-shadows")?.evidence).toContain("renderer-owned directional shadow-map sampling");
    expect(evidence.features.find((entry) => entry.feature === "contact-shadows")?.evidence).toContain("auxiliary cue");
    expect(evidence.features.find((entry) => entry.feature === "contact-shadows")?.evidence).not.toContain("shadow maps remain blocked");
    expect(evidence.features.find((entry) => entry.feature === "tone-mapping")?.evidence).toContain("HDR render-target tone mapping");
    expect(evidence.features.find((entry) => entry.feature === "tone-mapping")?.evidence).not.toContain("bounded Reinhard LDR");
    expect(evidence.features.find((entry) => entry.feature === "postprocess-bloom")?.evidence).toContain("renderer-owned HDR render-target postprocess path");
    expect(evidence.features.find((entry) => entry.feature === "postprocess-fxaa")?.evidence).toContain("renderer-owned HDR render-target postprocess path");
    expect(evidence.features.find((entry) => entry.feature === "depth-textures")?.evidence).toContain("sampleable depth texture");
    expect(evidence.features.find((entry) => entry.feature === "hdr")?.evidence).toContain("HDR render-target");
  });

  it("marks directional shadow evidence as production sampling only when explicitly provided", () => {
    expect(createExternalParityDirectionalShadowEvidence({
      exampleId: "bounded-shadow",
      casterCount: 1,
      receiverCount: 1,
      visibleReceiverDarkening: true
    })).toMatchObject({
      mode: "bounded-directional-shadow-map",
      productionShadowSamplingClaimed: false,
      knownLimit: "directional-shadow-map-fit-and-visible-receiver-evidence-without-production-forward-shadow-sampling"
    });

    expect(createExternalParityDirectionalShadowEvidence({
      exampleId: "root-shadow",
      casterCount: 2,
      receiverCount: 1,
      visibleReceiverDarkening: true,
      productionShadowSamplingClaimed: true
    })).toMatchObject({
      mode: "renderer-owned-directional-shadow-map",
      productionShadowSamplingClaimed: true,
      knownLimit: "renderer-owned-forward-shadow-map-sampling-evidence"
    });
  });
});
