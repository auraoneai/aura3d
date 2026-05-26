import { describe, expect, it } from "vitest";
import { loadThreeCompatAssetManifest, loadThreeCompatAssetRegistry, summarizeThreeCompatAssetRegistry } from "../../packages/assets/src/threejs-compatibility/ThreeCompatAssetRegistry";

describe("ThreeCompat asset library", () => {
  it("tracks a broad, pinned production asset corpus with provenance", () => {
    const manifest = loadThreeCompatAssetManifest();
    const registry = loadThreeCompatAssetRegistry(manifest);
    const summary = summarizeThreeCompatAssetRegistry(manifest);

    expect(manifest.schema).toBe("a3d-three-compat-asset-library");
    expect(summary.trackedAssetCount).toBeGreaterThanOrEqual(40);
    expect(summary.visualEvidenceSlotCount).toBeGreaterThanOrEqual(12);
    expect(summary.localAssetCount).toBeGreaterThanOrEqual(12);
    expect(summary.missingSourceIds).toEqual([]);
    expect(summary.classes).toEqual(expect.arrayContaining(["product", "automotive", "architecture", "character", "materials", "animation", "large-scene"]));
    expect(summary.advancedMaterialAssetCount).toBeGreaterThanOrEqual(10);
    expect(summary.animationSkinMorphAssetCount).toBeGreaterThanOrEqual(3);
    expect(summary.textureAssetCount).toBeGreaterThanOrEqual(10);
    expect(registry.every((asset) => asset.license && asset.repository && asset.revision && asset.sourcePath && asset.uri && asset.sha256 && asset.localPath)).toBe(true);
    expect(manifest.claimBoundary).toMatch(/not flagship proof until rendered/i);
  });
});
