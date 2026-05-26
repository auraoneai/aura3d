import { describe, expect, it } from "vitest";
import {
  createProductionEnvironmentCorpusSummary,
  inspectProductionHDR,
  loadProductionEnvironmentManifest
} from "../../../packages/environments/src/production-runtime";

describe("Production HDR environment corpus", () => {
  it("pins real HDRI files for IBL and PMREM work", () => {
    const manifest = loadProductionEnvironmentManifest();
    const summary = createProductionEnvironmentCorpusSummary(manifest);

    expect(manifest.schema).toBe("a3d-production-runtime-hdr-environment-corpus");
    expect(summary.pass, summary.failures.join("\n")).toBe(true);
    expect(summary.environmentCount).toBeGreaterThanOrEqual(manifest.requirements.minimumRealHdriSources);
    expect(summary.existingEnvironmentCount).toBe(summary.environmentCount);
    expect(summary.shaVerifiedEnvironmentCount).toBe(summary.environmentCount);
    expect(summary.totalBytes).toBeGreaterThanOrEqual(manifest.requirements.minimumTotalBytes);
    expect(summary.classCoverage).toEqual(expect.arrayContaining(["studio", "outdoor", "daylight", "industrial", "sunrise"]));
    expect(summary.probeCoverage).toEqual(expect.arrayContaining([...manifest.requirements.requiredProbeTypes]));
    expect(summary.flagshipBindingCount).toBeGreaterThanOrEqual(8);
    expect(summary.unresolvedFlagshipBindings).toEqual([]);
    expect(summary.pmremFaceSizes).toContain(256);
    expect(manifest.claimBoundary).toMatch(/do not prove renderer quality/i);
  });

  it("reads Radiance RGBE headers from the real HDR files", () => {
    const manifest = loadProductionEnvironmentManifest();

    for (const environment of manifest.environments) {
      const inspection = inspectProductionHDR(environment.localPath, environment.resolution);
      expect(inspection.hasRadianceHeader || inspection.hasFormatHeader).toBe(true);
      expect(inspection.declaredResolution).toEqual(environment.resolution);
      expect(inspection.dataBytes).toBe(environment.bytes);
    }
  });
});
