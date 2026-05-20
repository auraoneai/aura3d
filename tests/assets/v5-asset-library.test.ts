import { describe, expect, it } from "vitest";
import { loadV5AssetManifest, loadV5AssetRegistry, summarizeV5AssetRegistry } from "../../packages/assets/src/v5/V5AssetRegistry";

describe("V5 asset library", () => {
  it("tracks a broad, pinned production asset corpus with provenance", () => {
    const manifest = loadV5AssetManifest();
    const registry = loadV5AssetRegistry(manifest);
    const summary = summarizeV5AssetRegistry(manifest);

    expect(manifest.schema).toBe("g3d-v5-asset-library/v1");
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
