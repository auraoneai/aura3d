import { describe, expect, it } from "vitest";
import {
  createThreeCompatEnvironmentGalleryModel,
  loadThreeCompatEnvironmentManifest,
  summarizeThreeCompatEnvironmentLibrary
} from "../../../packages/engine/src/devtools/environments/node";

describe("ThreeCompat environment library", () => {
  it("provides real HDRI sources, procedural HDR presets, PMREM diagnostics, and probe previews", () => {
    const manifest = loadThreeCompatEnvironmentManifest();
    const summary = summarizeThreeCompatEnvironmentLibrary(manifest);
    const gallery = createThreeCompatEnvironmentGalleryModel(manifest);

    expect(manifest.schema).toBe("a3d-three-compat-environment-library");
    // QR-10 (864ccaa89, "HDRI de-alias") dropped the three alias presets that
    // repeated a canonical preset's sha256; the manifest's own requirements
    // are now 9 presets / 3 distinct real HDRI sources.
    expect(manifest.requirements).toEqual(expect.objectContaining({ minimumPresets: 9, minimumRealHdriSources: 3 }));
    expect(summary.presetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumPresets);
    expect(summary.realHdriCount).toBeGreaterThanOrEqual(manifest.requirements.minimumRealHdriSources);
    expect(summary.checkedRealHdriCount).toBe(summary.realHdriCount);
    expect(new Set(manifest.presets.filter((preset) => preset.kind === "real-hdri").map((preset) => preset.sha256)).size).toBe(summary.realHdriCount);
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
