import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { createGLTFRenderResources } from "../../../packages/assets/src/GLTFRenderResources";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { createGLTFTextureResidencySource } from "../../../packages/assets/src/gltf/GLTFTextureResidency";
import { Texture } from "../../../packages/rendering/src/Texture";

async function model(encoded = "AA==") {
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_texture_basisu"],
    images: [{ uri: `data:image/ktx2;base64,${encoded}`, mimeType: "image/ktx2" }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ normalTexture: { index: 0 }, occlusionTexture: { index: 0 } }],
    scenes: [{ nodes: [] }], scene: 0
  };
  return new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}` }, new LoadContext());
}

function decodedMips() {
  return {
    width: 4, height: 4, format: "bc1-rgba-unorm" as const,
    mipLevels: [
      { width: 4, height: 4, data: new Uint8Array(8).fill(4) },
      { width: 2, height: 2, data: new Uint8Array(8).fill(2) },
      { width: 1, height: 1, data: new Uint8Array(8).fill(1) }
    ],
    fallbackMipLevels: [
      { width: 4, height: 4, data: new Uint8Array(64).fill(40) },
      { width: 2, height: 2, data: new Uint8Array(16).fill(20) },
      { width: 1, height: 1, data: new Uint8Array(4).fill(10) }
    ]
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("glTF retained GPU-residency sources", () => {
  it("preserves the ordinary path unless explicitly requested", async () => {
    const decode = vi.fn(decodedMips);
    const resources = await createGLTFRenderResources(await model(), { imageDecoder: decode });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(resources.textureResidencySources).toBeUndefined();
    expect(resources.unmanagedTextureResidency).toBeUndefined();
    resources.dispose();
  });

  it("retains actual mip bytes and separates different neutral material samples", async () => {
    const decode = vi.fn(decodedMips);
    const resources = await createGLTFRenderResources(await model(), { imageDecoder: decode, retainTextureResidencySources: true });
    const sources = [...resources.textureResidencySources!.values()];
    expect(decode).toHaveBeenCalledTimes(2);
    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.fallback)).toEqual(expect.arrayContaining([[128, 128, 255, 255], [255, 255, 255, 255]]));
    expect(sources[0]!.levels).toEqual([{ width: 4, height: 4, bytes: 8 }, { width: 2, height: 2, bytes: 8 }, { width: 1, height: 1, bytes: 8 }]);
    const mip = await sources[0]!.loadMip(1, new AbortController().signal);
    expect([...mip.value.data]).toEqual(Array(8).fill(2));
    expect([...mip.value.fallbackData!]).toEqual(Array(16).fill(20));
    mip.release();
    const controller = new AbortController();
    controller.abort();
    await expect(sources[0]!.loadMip(0, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    resources.dispose();
    await expect(sources[0]!.loadMip(0, new AbortController().signal)).rejects.toThrow(/disposed/);
  });

  it("leaves incomplete retained mip chains unmanaged without disposing the texture", () => {
    const textures = [
      new Texture({ width: 4, height: 4, mipLevelCount: 3, data: new Uint8Array(64), generateMipmaps: false }),
      new Texture({ width: 4, height: 4, mipLevelCount: 3, mipLevels: [
        { width: 4, height: 4, data: new Uint8Array(64) },
        { width: 2, height: 2, data: new Uint8Array(16) }
      ], generateMipmaps: false })
    ];
    for (const texture of textures) {
      expect(texture.textureLevels.length).toBeLessThan(texture.mipLevelCount);
      expect(createGLTFTextureResidencySource(texture, "factor")).toBeUndefined();
      expect(texture.disposed).toBe(false);
      texture.dispose();
      expect(texture.disposed).toBe(true);
    }
  });

  it("keeps a fully retained declared mip chain available for independent source leases", async () => {
    const texture = new Texture({ width: 4, height: 4, mipLevelCount: 3, mipLevels: [
      { width: 4, height: 4, data: new Uint8Array(64).fill(4) },
      { width: 2, height: 2, data: new Uint8Array(16).fill(2) },
      { width: 1, height: 1, data: new Uint8Array(4).fill(1) }
    ], generateMipmaps: false });
    const source = createGLTFTextureResidencySource(texture, "factor")!;
    expect(source.texture).toBe(texture);
    expect(source.levels).toEqual([{ width: 4, height: 4, bytes: 64 }, { width: 2, height: 2, bytes: 16 }, { width: 1, height: 1, bytes: 4 }]);
    const mip = await source.loadMip(2, new AbortController().signal);
    expect([...mip.value.data]).toEqual([1, 1, 1, 1]);
    mip.release();
    expect(texture.disposed).toBe(false);
    texture.dispose();
    await expect(source.loadMip(0, new AbortController().signal)).rejects.toThrow(/disposed/);
  });

  it("explicitly reports source-backed images as unmanaged and closes their owners", async () => {
    const close = vi.fn();
    const resources = await createGLTFRenderResources(await model(), {
      imageDecoder: () => ({ width: 4, height: 4, source: { close } as unknown as TexImageSource }),
      retainTextureResidencySources: true
    });
    expect(resources.textureResidencySources!.size).toBe(0);
    expect([...resources.unmanagedTextureResidency!.values()]).toEqual([
      "decoded texture has no supported retained 2D mip bytes",
      "decoded texture has no supported retained 2D mip bytes"
    ]);
    resources.dispose();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed normal map neutral even after its missing-texture fallback becomes resident", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const resources = await createGLTFRenderResources(await model(), {
        imageDecoder: () => { throw new Error("fixture unavailable"); }, retainTextureResidencySources: true
      });
      const normal = [...resources.textureResidencySources!.values()].find((source) => source.fallback[2] === 255 && source.fallback[0] === 128)!;
      const mip = await normal.loadMip(0, new AbortController().signal);
      expect([...mip.value.data]).toEqual([128, 128, 255, 255]);
      resources.dispose();
    } finally { warn.mockRestore(); }
  });

  it("shares CPU texture identities across independent leases without closing a live peer", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const asset = await model();
    const sharedTextures = new GLTFSharedTextureCache();
    const decode = vi.fn(decodedMips);
    const options = { imageDecoder: decode, retainTextureResidencySources: true, sharedTextures, request: { credentials: "omit" as const } };
    const first = await createGLTFRenderResources(asset, options);
    const second = await createGLTFRenderResources(asset, options);
    const firstSources = [...first.textureResidencySources!.values()];
    const secondSources = [...second.textureResidencySources!.values()];
    expect(decode).toHaveBeenCalledTimes(2);
    expect(secondSources.map((source) => source.texture)).toEqual(firstSources.map((source) => source.texture));
    first.dispose();
    expect((await secondSources[0]!.loadMip(2, new AbortController().signal)).value.data.byteLength).toBe(8);
    second.dispose();
    await Promise.resolve();
    await expect(secondSources[0]!.loadMip(2, new AbortController().signal)).rejects.toThrow(/disposed/);
  });

  it("exposes the actual KTX2 decoder's retained pixels as a source", async () => {
    const encoded = readFileSync(new URL("../../assets/native-fixtures/ktx2-red-4x4.ktx2", import.meta.url));
    const resources = await createGLTFRenderResources(await model(encoded.toString("base64")), {
      retainTextureResidencySources: true, ktx2BasisTargetFormat: "rgba8", failOnMissingTexture: true
    });
    try {
      const source = [...resources.textureResidencySources!.values()][0]!;
      expect(source.levels[0]).toMatchObject({ width: 4, height: 4, bytes: 64 });
      const mip = await source.loadMip(0, new AbortController().signal);
      expect(mip.value.data[0]).toBeGreaterThan(180);
      expect(mip.value.data[1]).toBeLessThan(75);
      expect(mip.value.data[2]).toBeLessThan(75);
      expect(mip.value.data[3]).toBe(255);
      mip.release();
    } finally { resources.dispose(); }
  });
});
