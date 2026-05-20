import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProductAsset } from "@galileo3d/product-studio";

describe("loadProductAsset", () => {
  it("loads a generated product asset with resources and manifest metadata", async () => {
    const product = await loadProductAsset({
      id: "camera-kit",
      url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), "fixtures/v2/products/camera-kit/camera-kit.gltf"))),
      manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), "fixtures/v2/products/camera-kit/manifest.json")))
    });

    expect(product.id).toBe("camera-kit");
    expect(product.parts.map((part) => part.name)).toEqual(expect.arrayContaining(["body", "lens-barrel", "rear-screen", "tripod-plate"]));
    expect(product.materials.map((material) => material.name)).toEqual(expect.arrayContaining(["matte-black-body", "transparent-lens-glass"]));
    expect(product.resources.bounds.max[0]).toBeGreaterThan(product.resources.bounds.min[0]);
    expect(product.gltf.loaderDiagnostics.textureSlots).toEqual(expect.arrayContaining(["base-color", "normal"]));
    product.resources.dispose();
  });
});

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
