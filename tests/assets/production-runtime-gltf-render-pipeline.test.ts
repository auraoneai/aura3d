import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadV6GLTFRenderPipeline } from "../../packages/assets/src/asset-corpus";

const imageDecoder = () => ({
  width: 4,
  height: 4,
  data: new Uint8Array(4 * 4 * 4).fill(180),
  colorSpace: "srgb" as const
});

function dataUri(path: string): string {
  const data = readFileSync(path).toString("base64");
  return `data:model/gltf-binary;base64,${data}`;
}

describe("V6 glTF render pipeline", () => {
  it("maps real GLB PBR texture assets into renderer metadata and render resources", async () => {
    const pipeline = await loadV6GLTFRenderPipeline({
      url: dataUri("fixtures/asset-corpus/damaged-helmet.glb"),
      assetId: "damaged-helmet",
      assetName: "Damaged Helmet",
      imageDecoder
    });

    expect(pipeline.metadata.assetId).toBe("damaged-helmet");
    expect(pipeline.metadata.meshCount).toBeGreaterThan(0);
    expect(pipeline.metadata.primitiveCount).toBeGreaterThan(0);
    expect(pipeline.metadata.materialCount).toBeGreaterThan(0);
    expect(pipeline.metadata.textureCount).toBeGreaterThanOrEqual(5);
    expect(pipeline.metadata.imageCount).toBeGreaterThanOrEqual(5);
    expect(pipeline.metadata.pbrTextureCount).toBeGreaterThan(0);
    expect(pipeline.metadata.normalMapCount).toBeGreaterThan(0);
    expect(pipeline.metadata.ormTextureCount).toBeGreaterThan(0);
    expect(pipeline.metadata.emissiveTextureCount).toBeGreaterThan(0);
    expect(pipeline.metadata.hasPbr).toBe(true);
    expect(pipeline.resources.geometryLibrary.size).toBeGreaterThan(0);
    expect(pipeline.resources.materialLibrary.size).toBeGreaterThan(0);
    expect(pipeline.resources.textureLibrary.size).toBeGreaterThan(0);
    pipeline.dispose();
  });

  it("detects material extension, skinning, animation, and morph target coverage", async () => {
    const clearcoat = await loadV6GLTFRenderPipeline({
      url: dataUri("fixtures/asset-corpus/clear-coat-test.glb"),
      assetId: "clear-coat-test",
      imageDecoder
    });
    const character = await loadV6GLTFRenderPipeline({
      url: dataUri("fixtures/asset-corpus/cesium-man.glb"),
      assetId: "cesium-man",
      imageDecoder
    });
    const morph = await loadV6GLTFRenderPipeline({
      url: dataUri("fixtures/asset-corpus/animated-morph-cube.glb"),
      assetId: "animated-morph-cube",
      imageDecoder
    });

    expect(clearcoat.metadata.materialExtensionCoverage).toContain("KHR_materials_clearcoat");
    expect(clearcoat.metadata.materialCount).toBeGreaterThan(10);
    expect(character.metadata.hasSkinning).toBe(true);
    expect(character.metadata.hasAnimation).toBe(true);
    expect(morph.metadata.hasMorphTargets).toBe(true);
    expect(morph.metadata.hasAnimation).toBe(true);

    clearcoat.dispose();
    character.dispose();
    morph.dispose();
  });
});
