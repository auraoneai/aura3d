import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("renderer known limits", () => {
  it("keeps large-scene culling, PBR environment, material, and shadow caveats explicit", () => {
    const knownLimits = readFileSync("docs/project/status/known-limits.md", "utf8");

    expect(knownLimits).toContain("Renderer scene frustum culling is implemented");
    expect(knownLimits).toContain("not a broad large-scene performance claim");
    expect(knownLimits).toContain("GGX PMREM, RGBE HDR file loading");
    expect(knownLimits).toContain(
      "None of those package-level proofs automatically establishes root `createAuraApp` support",
    );
    expect(knownLimits).toContain(
      "OpenEXR decoding and physical Rayleigh/Mie atmosphere remain explicitly unsupported",
    );
    expect(knownLimits).toContain("one primary UV path for glTF render resources");
    expect(knownLimits).toContain("bounded KTX2/Basis transcoding coverage");
    expect(knownLimits).toContain("GPU capability-driven format selection");
    expect(knownLimits).toContain("no product-studio material-matrix visual coverage");
    expect(knownLimits).toContain("unit-level moving-camera cascade split stress");
    expect(knownLimits).toContain("point/spot shadow maps");
    expect(knownLimits).toContain("browser visual stress for long moving-camera paths");
  });
});
