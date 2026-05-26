import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAdvancedAssetCorpusSummary,
  GLTFLoader,
  inspectCurrentRoutesGlb,
  loadCurrentRoutesAssetManifest,
  loadRenderableAsset
} from "../../packages/assets/src";
import { LoadContext } from "../../packages/assets/src/LoadContext";

describe("CurrentRoutes GLTF loader corpus", () => {
  it("pins a local, checksummed GLB/HDR corpus with real renderer features", () => {
    const manifest = loadCurrentRoutesAssetManifest();
    const summary = createAdvancedAssetCorpusSummary(manifest);

    expect(manifest.schema).toBe("a3d-current-routes-local-asset-corpus");
    expect(summary.pass, summary.failures.join("\n")).toBe(true);
    expect(summary.assetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumAssetCount);
    expect(summary.environmentCount).toBe(2);
    expect(summary.existingAssetCount).toBe(summary.assetCount);
    expect(summary.shaVerifiedAssetCount).toBe(summary.assetCount);
    expect(summary.totalBytes).toBeGreaterThanOrEqual(manifest.requirements.minimumTotalBytes);
    expect(summary.totalTriangles).toBeGreaterThanOrEqual(manifest.requirements.minimumTotalTriangles);
    expect(summary.texturedPbrAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumTexturedPbrAssets);
    expect(summary.animationAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumAnimationAssets);
    expect(summary.skinAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumSkinAssets);
    expect(summary.morphAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumMorphAssets);
    expect(summary.materialExtensionAssetCount).toBeGreaterThanOrEqual(manifest.requirements.minimumMaterialExtensionAssets);
    expect(summary.classCoverage).toEqual(expect.arrayContaining(manifest.requirements.requiredClasses));
    expect(summary.featureCoverage).toEqual(expect.arrayContaining(manifest.requirements.requiredFeatures));
    expect(manifest.claimBoundary).toMatch(/does not by itself prove/i);
  });

  it("extracts declared per-asset metadata from the GLB JSON chunks", () => {
    const manifest = loadCurrentRoutesAssetManifest();

    for (const asset of manifest.assets) {
      const inspection = inspectCurrentRoutesGlb(asset.localPath);
      expect(inspection.validGlb).toBe(true);
      expect(inspection.triangleCount, asset.id).toBe(asset.triangleCount);
      expect(inspection.textureCount, asset.id).toBe(asset.textureCount);
      expect(inspection.animationCount, asset.id).toBe(asset.animationCount);
      expect(inspection.skinCount, asset.id).toBe(asset.skinCount);
      expect(inspection.morphTargetCount, asset.id).toBe(asset.morphTargetCount);
      expect(inspection.materialExtensionCount, asset.id).toBe(asset.materialExtensionCount);
      expect(inspection.unsupportedRequiredExtensions, asset.id).toEqual([]);
      expect(inspection.features, asset.id).toEqual(expect.arrayContaining(asset.requiredFeatures));
    }
  });

  it("loads representative production assets through the public GLTFLoader without blank-output diagnostics", async () => {
    const manifest = loadCurrentRoutesAssetManifest();
    const sampleIds = [
      "damaged-helmet",
      "chronograph-watch",
      "soldier",
      "robot-expressive",
      "compare-clearcoat",
      "car-concept"
    ];
    const loader = new GLTFLoader();

    for (const id of sampleIds) {
      const asset = manifest.assets.find((entry) => entry.id === id);
      expect(asset).toBeDefined();
      const loaded = await loader.load({ url: toGlbDataUri(asset!.localPath), type: "gltf" }, new LoadContext());

      expect(loaded.meshes.length, id).toBeGreaterThan(0);
      expect(loaded.defaultScene, id).toBeGreaterThanOrEqual(0);
      expect(loaded.loaderDiagnostics.primitiveCount, id).toBeGreaterThan(0);
      expect(loaded.loaderDiagnostics.vertexCount, id).toBeGreaterThan(0);
      expect(loaded.loaderDiagnostics.unsupportedExtensions, id).toEqual([]);
      expect(loaded.loaderDiagnostics.animationCount, id).toBe(asset!.animationCount);
      expect(loaded.loaderDiagnostics.skinCount, id).toBe(asset!.skinCount);
      expect(loaded.loaderDiagnostics.morphTargetCount, id).toBe(asset!.morphTargetCount);
      for (const mesh of loaded.meshes) {
        for (const weights of mesh.weights) {
          const sum = weights.reduce((total, weight) => total + weight, 0);
          expect(Math.abs(sum - 1), `${id} ${mesh.name} skin weights must be normalized`).toBeLessThan(1e-5);
        }
      }

      const scene = loaded.createScene();
      expect(scene.collectRenderables().length, id).toBeGreaterThan(0);
      expect(scene.collectRenderables().some(({ renderable }) => renderable.geometry.length > 0), id).toBe(true);
    }
  }, 30000);

  it("loads GLB assets through the one-call renderable asset API", async () => {
    const manifest = loadCurrentRoutesAssetManifest();
    const helmet = manifest.assets.find((asset) => asset.id === "damaged-helmet");

    expect(helmet).toBeDefined();
    const loaded = await loadRenderableAsset(toGlbDataUri(helmet!.localPath), { type: "gltf" });

    expect(loaded.kind).toBe("gltf");
    expect(loaded.gltf?.loaderDiagnostics.textureCount).toBeGreaterThan(0);
    expect(loaded.gltf?.createScene().collectRenderables().length).toBeGreaterThan(0);
    expect(loaded.warnings).toEqual([]);
  });
});

function toGlbDataUri(localPath: string): string {
  return `data:model/gltf-binary;base64,${readFileSync(localPath).toString("base64")}`;
}
