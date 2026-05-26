import { describe, expect, it } from "vitest";
import {
  createV5EnvironmentGalleryModel,
  loadV5EnvironmentManifest,
  summarizeV5EnvironmentLibrary
} from "../../../packages/environments/src";

describe("V5 environment library", () => {
  it("provides real HDRI sources, procedural HDR presets, PMREM diagnostics, and probe previews", () => {
    const manifest = loadV5EnvironmentManifest();
    const summary = summarizeV5EnvironmentLibrary(manifest);
    const gallery = createV5EnvironmentGalleryModel(manifest);

    expect(manifest.schema).toBe("a3d-three-compat-environment-library/v1");
    expect(summary.presetCount).toBeGreaterThanOrEqual(12);
    expect(summary.realHdriCount).toBeGreaterThanOrEqual(6);
    expect(summary.checkedRealHdriCount).toBeGreaterThanOrEqual(6);
    expect(summary.proceduralCount).toBeGreaterThanOrEqual(6);
    expect(summary.probeTypes).toEqual(["emissive", "reflective", "rough", "transmissive"]);
    expect(summary.unresolvedFlagshipBindings).toEqual([]);
    expect(summary.flagshipBindingCount).toBeGreaterThanOrEqual(8);
    expect(summary.diagnosticsWarningCount).toBe(0);
    expect(gallery.every((entry) => entry.probes.length === 4)).toBe(true);
    expect(gallery.every((entry) => entry.diagnostics.pmrem.faceSize >= 256)).toBe(true);
    expect(gallery.every((entry) => entry.diagnostics.pmrem.mipCount >= 8)).toBe(true);
    expect(manifest.claimBoundary).toMatch(/not flagship visual proof until rendered/i);
  });
});
