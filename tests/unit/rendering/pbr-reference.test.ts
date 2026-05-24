import { describe, expect, it } from "vitest";
import {
  pbrCausticsConformanceSuite,
  pbrCausticsTransmissionResponse,
  pbrDiffuseBurley,
  pbrDirectLight,
  pbrDistributionGgx,
  pbrEnvironmentLight,
  pbrF0,
  pbrFresnelSchlick,
  pbrFresnelSchlickRoughnessSpecular,
  pbrFresnelSchlickSpecular,
  pbrGeometrySmithGgxCorrelated,
  pbrPhotometricConformanceSuite,
  pbrReferenceFinite,
  pbrReferenceLuminance,
  pbrTransmissionVolumeConformanceSuite,
  pbrTransmissionVolumeResponse
} from "../../../packages/rendering/src";

describe("PBR reference math", () => {
  it("matches deterministic GGX, Smith, Fresnel, and Burley reference samples", () => {
    expect(pbrDistributionGgx(0.8, 0.35)).toBeCloseTo(0.034966, 6);
    expect(pbrGeometrySmithGgxCorrelated(0.65, 0.72, 0.35)).toBeCloseTo(0.529646, 6);
    expect(pbrDiffuseBurley(0.65, 0.72, 0.82, 0.35)).toBeCloseTo(0.87961, 6);
    expect(pbrFresnelSchlick([0.04, 0.04, 0.04], 0.55)).toEqual([
      expect.closeTo(0.057715, 6),
      expect.closeTo(0.057715, 6),
      expect.closeTo(0.057715, 6),
    ]);
  });

  it("separates dielectric and metallic F0 values", () => {
    const albedo = [0.8, 0.32, 0.12] as const;
    const dielectric = pbrF0(albedo, 0);
    const metal = pbrF0(albedo, 1);

    expect(dielectric).toEqual([expect.closeTo(0.04, 6), expect.closeTo(0.04, 6), expect.closeTo(0.04, 6)]);
    expect(metal).toEqual([expect.closeTo(0.8, 6), expect.closeTo(0.32, 6), expect.closeTo(0.12, 6)]);
    expect(pbrReferenceLuminance(metal)).toBeGreaterThan(pbrReferenceLuminance(dielectric));
  });

  it("lets low-specular imported materials suppress grazing white Fresnel", () => {
    const f0 = [0.0024, 0.00022, 0.00018] as const;
    const directLow = pbrFresnelSchlickSpecular(f0, 0.02, 0.06);
    const directDefault = pbrFresnelSchlick(f0, 0.02);
    const environmentLow = pbrFresnelSchlickRoughnessSpecular(f0, 0.04, 0.82, 0.015);

    expect(pbrReferenceLuminance(directLow)).toBeLessThan(0.06);
    expect(pbrReferenceLuminance(directLow)).toBeLessThan(pbrReferenceLuminance(directDefault) * 0.08);
    expect(pbrReferenceLuminance(environmentLow)).toBeLessThan(0.004);
  });

  it("keeps direct and environment light finite while responding to material changes", () => {
    const base = {
      normal: [0, 0, 1] as const,
      viewDirection: [0.22, 0.16, 1] as const,
      lightDirection: [-0.3, 0.4, 1] as const,
      lightColor: [1, 0.92, 0.78] as const,
      lightIntensity: 3,
      albedo: [0.76, 0.38, 0.18] as const,
    };
    const glossyMetal = pbrDirectLight({ ...base, metallic: 1, roughness: 0.18 });
    const roughDielectric = pbrDirectLight({ ...base, metallic: 0, roughness: 0.86 });

    expect(pbrReferenceFinite(glossyMetal)).toBe(true);
    expect(pbrReferenceFinite(roughDielectric)).toBe(true);
    expect(Math.abs(pbrReferenceLuminance(glossyMetal) - pbrReferenceLuminance(roughDielectric))).toBeGreaterThan(0.1);

    const environmentBase = {
      normal: [0, 0, 1] as const,
      viewDirection: [0.2, -0.15, 1] as const,
      diffuseIrradiance: [0.32, 0.36, 0.42] as const,
      specularRadiance: [1.8, 1.55, 1.25] as const,
      albedo: [0.76, 0.38, 0.18] as const,
    };
    const metalEnvironment = pbrEnvironmentLight({ ...environmentBase, metallic: 1, roughness: 0.18 });
    const dielectricEnvironment = pbrEnvironmentLight({ ...environmentBase, metallic: 0, roughness: 0.86 });

    expect(pbrReferenceFinite(metalEnvironment)).toBe(true);
    expect(pbrReferenceFinite(dielectricEnvironment)).toBe(true);
    expect(pbrReferenceLuminance(metalEnvironment)).toBeGreaterThan(pbrReferenceLuminance(dielectricEnvironment));
  });

  it("publishes a deterministic photometric conformance suite", () => {
    const report = pbrPhotometricConformanceSuite();

    expect(report.ok).toBe(true);
    expect(report.samples.map((sample) => sample.id)).toEqual([
      "direct-dielectric-rough",
      "direct-dielectric-smooth",
      "direct-metal-rough",
      "direct-metal-smooth",
      "environment-dielectric-balanced",
      "environment-metal-balanced",
      "environment-low-irradiance",
      "environment-high-irradiance",
      "specular-factor-low",
      "specular-factor-high",
      "specular-color-red-tint",
      "fresnel-facing",
      "fresnel-grazing",
    ]);
    expect(report.metrics.sampleCount).toBe(13);
    expect(report.metrics.checkCount).toBe(8);
    expect(report.metrics.failedCheckCount).toBe(0);
    expect(report.metrics.finiteNonNegativeSamples).toBe(13);
    expect(report.checks.every((check) => check.passed)).toBe(true);
    expect(report.metrics.directRoughnessDelta).toBeGreaterThan(0.01);
    expect(report.metrics.directMetalDielectricDelta).toBeGreaterThan(0.05);
    expect(report.metrics.environmentMetalDielectricDelta).toBeGreaterThan(0.02);
    expect(report.metrics.grazingFresnelGain).toBeGreaterThan(0.1);
    expect(report.metrics.specularFactorGain).toBeGreaterThan(0.0005);
    expect(report.metrics.specularTintRedBias).toBeGreaterThan(0.01);
    expect(report.metrics.irradianceGain).toBeGreaterThan(0.1);
  });

  it("models bounded transmission, volume attenuation, IOR, and dispersion response", () => {
    const report = pbrTransmissionVolumeConformanceSuite();

    expect(report.ok).toBe(true);
    expect(report.samples.map((sample) => sample.id)).toEqual([
      "transmission-clear-glass",
      "transmission-thick-blue-glass",
      "diffuse-transmission-green-panel",
      "transmission-low-ior",
      "transmission-high-ior",
      "transmission-dispersion-prism",
    ]);
    expect(report.metrics.sampleCount).toBe(6);
    expect(report.metrics.checkCount).toBe(6);
    expect(report.metrics.failedCheckCount).toBe(0);
    expect(report.metrics.finiteNonNegativeSamples).toBe(6);
    expect(report.metrics.thickGlassAttenuationLoss).toBeGreaterThan(0.04);
    expect(report.metrics.attenuationBlueBias).toBeGreaterThan(0.2);
    expect(report.metrics.diffuseTransmissionGreenBias).toBeGreaterThan(0.08);
    expect(report.metrics.iorSpecularGain).toBeGreaterThan(0.03);
    expect(report.metrics.dispersionRedBlueSpread).toBeGreaterThan(0.02);

    const response = pbrTransmissionVolumeResponse({
      baseColor: [0.72, 0.88, 1],
      transmissionFactor: 0.7,
      volumeThicknessFactor: 0.6,
      volumeAttenuationDistance: 1.2,
      volumeAttenuationColor: [0.5, 0.75, 1],
      ior: 1.6,
      dispersion: 24,
    });
    expect(pbrReferenceFinite(response.color)).toBe(true);
    expect(response.volumeAttenuation[2]).toBeGreaterThan(response.volumeAttenuation[0]);
    expect(response.dispersionTint[0]).toBeGreaterThan(response.dispersionTint[2]);
    expect(response.transmitted[0]).toBeGreaterThan(0.18);
    expect(response.transmitted[1]).toBeGreaterThan(0.24);
    expect(response.transmitted[2]).toBeGreaterThan(0.32);

    const unbackedWhiteGlass = pbrTransmissionVolumeResponse({
      baseColor: [1, 1, 1],
      transmissionFactor: 1,
      transmissionFallbackEnergy: 0.08,
    });
    expect(unbackedWhiteGlass.transmitted).toEqual([0.08, 0.08, 0.08]);
    expect(unbackedWhiteGlass.color[0]).toBeLessThan(0.2);
  });

  it("models bounded caustics, transmission focus, attenuation, roughness, and dispersion response", () => {
    const report = pbrCausticsConformanceSuite();

    expect(report.ok).toBe(true);
    expect(report.samples.map((sample) => sample.id)).toEqual([
      "caustic-diffuse-glass",
      "caustic-focused-glass",
      "caustic-rough-glass",
      "caustic-amber-attenuation",
      "caustic-dispersed-prism",
    ]);
    expect(report.metrics.sampleCount).toBe(5);
    expect(report.metrics.checkCount).toBe(6);
    expect(report.metrics.failedCheckCount).toBe(0);
    expect(report.metrics.finiteNonNegativeSamples).toBe(5);
    expect(report.metrics.focusedPeakGain).toBeGreaterThan(1.5);
    expect(report.metrics.roughnessPeakLoss).toBeGreaterThan(1);
    expect(report.metrics.focusedFootprintContraction).toBeGreaterThan(0.5);
    expect(report.metrics.attenuationRedBias).toBeGreaterThan(0.5);
    expect(report.metrics.dispersionRedBlueSpread).toBeGreaterThan(0.08);

    const response = pbrCausticsTransmissionResponse({
      incidentColor: [1, 0.96, 0.86],
      transmittedColor: [0.86, 0.94, 1],
      ior: 1.58,
      curvature: 1.05,
      thickness: 0.74,
      roughness: 0.04,
      receiverDistance: 0.66,
      dispersion: 48,
    });
    expect(pbrReferenceFinite(response.color)).toBe(true);
    expect(response.focusStrength).toBeGreaterThan(0.5);
    expect(response.peakIntensity).toBeGreaterThan(2);
    expect(response.dispersionTint[0]).toBeGreaterThan(response.dispersionTint[2]);
  });
});
