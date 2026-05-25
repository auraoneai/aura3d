import { describe, expect, it } from "vitest";
import {
  createV4BrdfLut,
  createV4EnvironmentPipeline,
  createV4IblResources,
  createV4Pmrem,
  listV4EnvironmentTargets
} from "../../../packages/rendering/src";

describe("V4 IBL and environment pipeline", () => {
  it("builds every required environment target with IBL resources and explicit release blockers", () => {
    const targets = listV4EnvironmentTargets();

    expect(targets).toEqual([
      "studio-softbox-hdr",
      "gallery-neutral-hdr",
      "outdoor-overcast-hdr",
      "warehouse-industrial-hdr",
      "night-neon-hdr"
    ]);

    for (const target of targets) {
      const pipeline = createV4EnvironmentPipeline({
        target,
        rotation: 0.25,
        intensity: 1.4,
        backgroundIntensity: 0.4
      });

      expect(pipeline.sourceManifest).toBe("fixtures/v4/environments/manifest.json");
      expect(pipeline.capabilities).toContain("diffuse irradiance");
      expect(pipeline.capabilities).toContain("specular prefilter mips");
      expect(pipeline.capabilities).toContain("BRDF LUT");
      expect(pipeline.ibl.diagnostics.hdrSource).toBe(true);
      expect(pipeline.ibl.diagnostics.diffuseIrradiance).toBe(true);
      expect(pipeline.ibl.diagnostics.specularPrefilter).toBe(true);
      expect(pipeline.ibl.diagnostics.brdfLut).toBe(true);
      expect(pipeline.ibl.diagnostics.backgroundSeparation).toBe(true);
      expect(pipeline.ibl.diagnostics.notFlagshipProof).toBe(true);
      expect(pipeline.releaseBlockers.join(" ")).toContain("licensed HDR");
    }
  });

  it("creates a PMREM-style prefiltered mip chain with roughness levels", () => {
    const ibl = createV4IblResources({ preset: "softbox", width: 64, height: 32 });
    const pmrem = createV4Pmrem(ibl.resources.base, { levels: 5 });

    expect(pmrem.diagnostics.mipCount).toBeGreaterThanOrEqual(5);
    expect(pmrem.diagnostics.directionalReflectionReady).toBe(true);
    expect(pmrem.levels[0]?.roughness).toBe(0);
    expect(pmrem.levels.at(-1)?.roughness).toBe(1);
    expect(pmrem.levels[0]!.width).toBeGreaterThan(pmrem.levels.at(-1)!.width);
  });

  it("creates a BRDF LUT with non-zero roughness response", () => {
    const lut = createV4BrdfLut(32);

    expect(lut.width).toBe(32);
    expect(lut.height).toBe(32);
    expect(lut.diagnostics.byteLength).toBe(32 * 32 * 4);
    expect(lut.diagnostics.nonZeroPixels).toBeGreaterThan(0);
    expect(lut.diagnostics.monotonicRoughnessTrend).toBe(true);
  });

  it("keeps environment rotation, intensity, and background separation explicit", () => {
    const ibl = createV4IblResources({
      preset: "evening",
      rotation: 0.5,
      intensity: 2,
      backgroundIntensity: 0.25
    });

    expect(ibl.rotation).toBe(0.5);
    expect(ibl.intensity).toBe(2);
    expect(ibl.backgroundIntensity).toBe(0.25);
    expect(ibl.diagnostics.environmentRotation).toBe(true);
    expect(ibl.diagnostics.environmentIntensity).toBe(true);
    expect(ibl.diagnostics.backgroundSeparation).toBe(true);
    expect(ibl.resources.diagnostics.maxLinearValue).toBeGreaterThan(1);
    expect(ibl.resources.diagnostics.specularMipCount).toBeGreaterThanOrEqual(4);
  });
});
