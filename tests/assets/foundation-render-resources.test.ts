import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGLTFRenderResources, GLTFLoader, LoadContext, loadRenderableAsset, createRenderableScene } from "@aura3d/assets";

const root = join(process.cwd(), "fixtures/workflow-assets/assets");

describe("Foundation glTF render resources", () => {
  it("creates render resources with bounds, geometry, materials, and textures", async () => {
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: jsonDataUri(readFileSync(join(root, "product-camera/product-camera.gltf"), "utf8")) }, new LoadContext());
    const resources = await createGLTFRenderResources(asset, { imageDecoder: () => ({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([220, 220, 220, 255]) }) });

    expect(resources.bounds.max[0]).toBeGreaterThan(resources.bounds.min[0]);
    expect(resources.geometryLibrary.size).toBeGreaterThan(0);
    expect(resources.materialLibrary.size).toBeGreaterThan(0);
    expect(resources.textureLibrary.size).toBeGreaterThan(0);
    const source = resources.toRenderSource({ qualityPreset: "studio-preview", cameraPolicy: "auto-frame" });
    expect(source.scene).toBeTruthy();
    expect(source.geometryLibrary).toBeTruthy();
    resources.dispose();
  });

  it("creates the higher-level renderable asset and scene defaults", async () => {
    const asset = await loadRenderableAsset(jsonDataUri(readFileSync(join(root, "material-spheres/material-spheres.gltf"), "utf8")));
    const scene = await createRenderableScene(asset, {
      camera: "auto-frame",
      lighting: "studioProduct",
      shadows: true,
      postprocess: "product-default",
      renderResources: {
        imageDecoder: () => ({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([220, 220, 220, 255]) })
      }
    });

    expect(asset.kind).toBe("gltf");
    expect(scene.source).toBeTruthy();
    expect(scene.setupLineBudget).toBeLessThanOrEqual(30);
    scene.dispose();
  });
});

function jsonDataUri(json: string): string {
  return `data:model/gltf+json;base64,${Buffer.from(json).toString("base64")}`;
}
