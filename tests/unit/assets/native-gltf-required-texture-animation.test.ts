import { describe, expect, it, vi } from "vitest";
import { GLTFLoader, type GLTFAsset, type GLTFImageAsset } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources } from "../../../packages/assets/src/GLTFRenderResources";
import { LoadContext } from "../../../packages/assets/src/LoadContext";

// The loader still rejects required texture pointers. These tests exercise the
// resource-stage contract using an explicit source identity, before that loader
// admission and actor binding validation are implemented.
async function fixture(): Promise<GLTFAsset> {
  const doc = {
    asset: { version: "2.0" },
    images: [{ uri: "data:image/png;base64,AA==" }, { uri: "data:image/png;base64,AQ==" }],
    textures: [{ source: 0 }, { source: 0 }, { source: 1 }],
    materials: [
      { name: "first-alias", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
      { name: "animated", pbrMetallicRoughness: { baseColorTexture: { index: 1 } } },
      { name: "unrelated", pbrMetallicRoughness: { baseColorTexture: { index: 2 } } }
    ],
    scenes: [{ nodes: [] }], scene: 0
  };
  const url = "data:model/gltf+json," + encodeURIComponent(JSON.stringify(doc));
  return new GLTFLoader().load({ url }, new LoadContext());
}

function withRequiredImage(asset: GLTFAsset): GLTFAsset {
  return { ...asset, requiredTextureAnimationTargets: [{
    clipName: "uv", target: "material:animated.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform.offset",
    materialIndex: 1, materialName: "animated", textureIndex: 1, imageIndex: 0
  }] };
}

describe("required texture animation resource prerequisite", () => {
  it("rejects a failed required image even when another texture alias starts its decode", async () => {
    const asset = withRequiredImage(await fixture());
    const close = vi.fn();
    const decoder = vi.fn((_image: GLTFImageAsset, imageIndex: number) => {
      if (imageIndex === 0) throw new Error("decode failed");
      return { width: 1, height: 1, source: { width: 1, height: 1, close } as unknown as TexImageSource };
    });
    await expect(createGLTFRenderResources(asset, { imageDecoder: decoder })).rejects.toMatchObject({
      name: "GLTFTextureLoadError", issue: { imageIndex: 0, fallback: false }
    });
    expect(decoder.mock.calls.filter(([, index]) => index === 0)).toHaveLength(1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps fallback for unrelated failed images and disposes the successful resources", async () => {
    const asset = withRequiredImage(await fixture());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const resources = await createGLTFRenderResources(asset, { imageDecoder: (_image, imageIndex) => {
        if (imageIndex === 1) throw new Error("decode failed");
        return { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) };
      } });
      const textures = [...resources.textureLibrary.values()];
      expect(resources.loadIssues).toContainEqual(expect.objectContaining({ code: "texture-load-failed", imageIndex: 1, fallback: true }));
      resources.dispose();
      expect(textures.length).toBeGreaterThan(0);
      expect(textures.every((texture) => texture.disposed)).toBe(true);
    } finally { warn.mockRestore(); }
  });
});
