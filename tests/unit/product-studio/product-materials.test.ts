import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProductMaterialMode, createProductMaterialMode, loadProductAsset } from "@galileo3d/product-studio";

describe("product material modes", () => {
  it("preserves asset materials and creates override material libraries", async () => {
    const asset = await loadProductAsset({
      id: "speaker",
      url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), "fixtures/v2/products/speaker/speaker.gltf"))),
      manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), "fixtures/v2/products/speaker/manifest.json")))
    });
    const assetMode = applyProductMaterialMode(asset, createProductMaterialMode("asset"));
    const contrastMode = applyProductMaterialMode(asset, createProductMaterialMode("contrast"));

    expect(assetMode).toBe(asset.resources.materialLibrary);
    expect(contrastMode).not.toBe(asset.resources.materialLibrary);
    expect([...contrastMode.keys()]).toEqual([...asset.resources.materialLibrary.keys()]);
    asset.resources.dispose();
  });
});

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
