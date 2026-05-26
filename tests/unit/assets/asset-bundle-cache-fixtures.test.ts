import { describe, expect, it } from "vitest";
import { createAssetBundleCacheEvidence } from "../../../packages/assets/src";

describe("asset bundle cache fixtures", () => {
  it("builds deterministic bundle, dependency, and cache evidence for a loaded glTF asset", () => {
    const evidence = createAssetBundleCacheEvidence({
      assetId: "External Parity Product Speaker",
      url: "/fixtures/product-studio/products/speaker/speaker.gltf",
      meshCount: 5,
      materialCount: 4,
      textureCount: 3,
      animationCount: 1,
      skinCount: 0,
      morphTargetCount: 0,
      decodedTextureBytes: 196608
    });

    expect(evidence).toMatchObject({
      source: "origin-master-asset-bundle-cache-adapted",
      manifest: {
        id: "external-parity-product-speaker-bundle",
        version: "external-parity-generated",
        assetCount: 8
      },
      dependencyGraph: {
        rootAssetId: "external-parity-product-speaker",
        cycleDetected: false
      },
      cache: {
        policy: "lru"
      },
      productionReadiness: {
        bundleManifest: true,
        dependencySorting: true,
        memoryBudgetEviction: true,
        cacheTelemetry: true,
        inFlightDeduplicationBoundary: true
      }
    });
    expect(evidence.dependencyGraph.loadOrder.at(-1)).toBe("external-parity-product-speaker");
    expect(evidence.dependencyGraph.releaseOrder[0]).toBe("external-parity-product-speaker");
    expect(evidence.dependencyGraph.directDependencies).toEqual([
      "external-parity-product-speaker:geometry-buffer",
      "external-parity-product-speaker:material-manifest",
      "external-parity-product-speaker:metadata",
      "external-parity-product-speaker:animation"
    ]);
    expect(evidence.dependencyGraph.transitiveDependencies).toEqual(expect.arrayContaining([
      "external-parity-product-speaker:geometry-buffer",
      "external-parity-product-speaker:material-manifest",
      "external-parity-product-speaker:texture-1",
      "external-parity-product-speaker:texture-2",
      "external-parity-product-speaker:texture-3",
      "external-parity-product-speaker:animation"
    ]));
    expect(evidence.manifest.totalBytes).toBeGreaterThan(0);
    expect(evidence.cache.cachedEntries).toBeGreaterThan(0);
    expect(evidence.cache.evictions).toBeGreaterThan(0);
    expect(evidence.cache.hitRate).toBeGreaterThan(0);
    expect(evidence.blockedClaims).toEqual(expect.arrayContaining([
      "Unity Addressables catalog parity",
      "Unreal Asset Manager primary asset parity",
      "IndexedDB persistent cache certification"
    ]));
    expect(evidence.claimBoundary).toContain("does not claim Unity Addressables");
    expect(evidence.hash).toMatch(/^[0-9a-f]{8}$/);

    expect(createAssetBundleCacheEvidence({
      assetId: "External Parity Product Speaker",
      url: "/fixtures/product-studio/products/speaker/speaker.gltf",
      meshCount: 5,
      materialCount: 4,
      textureCount: 3,
      animationCount: 1,
      skinCount: 0,
      morphTargetCount: 0,
      decodedTextureBytes: 196608
    }).hash).toBe(evidence.hash);
  });

  it("rejects invalid bundle input instead of publishing empty evidence", () => {
    expect(() => createAssetBundleCacheEvidence({
      assetId: "",
      url: "model.gltf",
      meshCount: 1,
      materialCount: 1,
      textureCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0
    })).toThrow(/assetId/);
    expect(() => createAssetBundleCacheEvidence({
      assetId: "bad",
      url: " ",
      meshCount: 1,
      materialCount: 1,
      textureCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0
    })).toThrow(/url/);
    expect(() => createAssetBundleCacheEvidence({
      assetId: "bad",
      url: "model.gltf",
      meshCount: -1,
      materialCount: 1,
      textureCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0
    })).toThrow(/meshCount/);
  });
});
