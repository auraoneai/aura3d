import { describe, expect, it } from "vitest";
import {
  createV6AssetCorpusSummary,
  inspectV6Glb,
  loadV6AssetManifest
} from "../../packages/assets/src/v6";

describe("V6 real asset corpus", () => {
  it("pins real imported GLB assets instead of primitive-only proof", () => {
    const manifest = loadV6AssetManifest();
    const summary = createV6AssetCorpusSummary(manifest);

    expect(manifest.schema).toBe("g3d-v6-real-asset-corpus/v1");
    expect(summary.pass, summary.failures.join("\n")).toBe(true);
    expect(summary.assetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumRealGlbAssets);
    expect(summary.existingAssetCount).toBe(summary.assetCount);
    expect(summary.shaVerifiedAssetCount).toBe(summary.assetCount);
    expect(summary.realGlbParsedCount).toBe(summary.assetCount);
    expect(summary.visualFlagshipAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumVisualFlagshipAssets);
    expect(summary.totalBytes).toBeGreaterThanOrEqual(manifest.requirements.minimumTotalBytes);
    expect(summary.pbrTextureAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumPbrTextureAssets);
    expect(summary.advancedMaterialAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumAdvancedMaterialAssets);
    expect(summary.animationAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumAnimationAssets);
    expect(summary.classCoverage).toEqual(expect.arrayContaining(["product", "automotive", "character", "materials", "animation"]));
    expect(summary.primitiveOnlyRejected).toBe(true);
    expect(manifest.claimBoundary).toMatch(/not sufficient/i);
  });

  it("extracts actual glTF scene structure from flagship files", () => {
    const manifest = loadV6AssetManifest();
    const damagedHelmet = manifest.assets.find((asset) => asset.id === "damaged-helmet");
    const cesiumMan = manifest.assets.find((asset) => asset.id === "cesium-man");
    const morphCube = manifest.assets.find((asset) => asset.id === "animated-morph-cube");

    expect(damagedHelmet).toBeDefined();
    expect(cesiumMan).toBeDefined();
    expect(morphCube).toBeDefined();

    const helmet = inspectV6Glb(damagedHelmet!.localPath);
    const character = inspectV6Glb(cesiumMan!.localPath);
    const morph = inspectV6Glb(morphCube!.localPath);

    expect(helmet.validGlb).toBe(true);
    expect(helmet.texturedPbrMaterialCount).toBeGreaterThan(0);
    expect(helmet.textureCount).toBeGreaterThan(0);
    expect(character.skinCount).toBeGreaterThan(0);
    expect(character.animationCount).toBeGreaterThan(0);
    expect(morph.morphTargetPrimitiveCount).toBeGreaterThan(0);
    expect(morph.animationCount).toBeGreaterThan(0);
  });
});
