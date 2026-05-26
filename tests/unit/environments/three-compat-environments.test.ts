import { describe, expect, it } from "vitest";
import {
  createThreeCompatEnvironmentGalleryModel,
  loadThreeCompatEnvironmentManifest,
  summarizeThreeCompatEnvironmentLibrary
} from "../../../packages/environments/src";

describe("ThreeCompat environment library", () => {
  it("provides real HDRI sources, procedural HDR presets, PMREM diagnostics, and probe previews", () => {
    const manifest = loadThreeCompatEnvironmentManifest();
    const summary = summarizeThreeCompatEnvironmentLibrary(manifest);
    const gallery = createThreeCompatEnvironmentGalleryModel(manifest);

    expect(manifest.schema).toBe("a3d-three-compat-environment-library");
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
