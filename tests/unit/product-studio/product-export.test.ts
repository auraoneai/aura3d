import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProductCameraFrame,
  createProductLightingPreset,
  createProductMaterialMode,
  createProductRenderScene,
  exportProductSceneManifest,
  loadProductAsset
} from "@galileo3d/product-studio";

describe("product scene export manifest", () => {
  it("exports the selected asset, lighting, camera, and material mode", async () => {
    const asset = await loadProductAsset({
      id: "watch",
      url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), "fixtures/v2/products/watch/watch.gltf"))),
      manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), "fixtures/v2/products/watch/manifest.json")))
    });
    const scene = createProductRenderScene(asset, {
      lighting: createProductLightingPreset("hero-contrast"),
      camera: createProductCameraFrame(asset, { preset: "macro-detail" }),
      materialMode: createProductMaterialMode("metal-check")
    });
    const manifest = exportProductSceneManifest(scene);

    expect(manifest.schema).toBe("g3d-product-studio-scene/v1");
    expect(manifest.assetId).toBe("watch");
    expect(manifest.cameraPreset).toBe("macro-detail");
    expect(manifest.lightingPreset).toBe("hero-contrast");
    expect(manifest.materialMode).toBe("metal-check");
    expect(manifest.partCount).toBeGreaterThanOrEqual(18);
    asset.resources.dispose();
  });
});

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
