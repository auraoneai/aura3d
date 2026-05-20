import { describe, expect, it } from "vitest";
import {
  createV6EnvironmentCorpusSummary,
  inspectV6HDR,
  loadV6EnvironmentManifest
} from "../../../packages/environments/src/v6";

describe("V6 HDR environment corpus", () => {
  it("pins real HDRI files for IBL and PMREM work", () => {
    const manifest = loadV6EnvironmentManifest();
    const summary = createV6EnvironmentCorpusSummary(manifest);

    expect(manifest.schema).toBe("g3d-v6-hdr-environment-corpus/v1");
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
    const manifest = loadV6EnvironmentManifest();

    for (const environment of manifest.environments) {
      const inspection = inspectV6HDR(environment.localPath, environment.resolution);
      expect(inspection.hasRadianceHeader || inspection.hasFormatHeader).toBe(true);
      expect(inspection.declaredResolution).toEqual(environment.resolution);
      expect(inspection.dataBytes).toBe(environment.bytes);
    }
  });
});
