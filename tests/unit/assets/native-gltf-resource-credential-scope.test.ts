import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources, type GLTFImageDecoder, type GLTFRenderResources } from "../../../packages/assets/src/GLTFRenderResources";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { AssetIntegrityError } from "../../../packages/assets/src/LoaderFetch";
import { loadProductionGLTFRenderPipeline } from "../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";

function documentWithImage(uri = "data:image/png;base64,AA==") {
  const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
  const bytes = Buffer.from(values.buffer);
  return {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [{ uri }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
}

const inlineUrl = () => `data:model/gltf+json,${encodeURIComponent(JSON.stringify(documentWithImage()))}`;
const loadAsset = () => new GLTFLoader().load({ url: inlineUrl() }, new LoadContext());
const pixels = () => ({ width: 1, height: 1, data: new Uint8Array([10, 20, 30, 255]) });
const textureOf = (resources: GLTFRenderResources) => [...resources.textureLibrary.values()][0]!;

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("glTF decoded texture request scope", () => {
  it.each([
    ["anonymous", { credentials: "omit" as const }],
    ["scoped credentials", { credentials: "include" as const, securityContext: "generation-a" }]
  ] as const)("shares one %s decode and releases it with the final lease", async (_name, request) => {
    const asset = await loadAsset();
    const cache = new GLTFSharedTextureCache();
    const decode = vi.fn(pixels);
    const first = await createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache, request });
    const second = await createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache, request });
    try {
      expect(decode).toHaveBeenCalledOnce();
      expect(textureOf(first)).toBe(textureOf(second));
      expect(cache.refCount).toBe(2);
      first.dispose();
      expect(textureOf(second).disposed).toBe(false);
    } finally { first.dispose(); second.dispose(); }
    await Promise.resolve();
    expect(textureOf(second).disposed).toBe(true);
  });

  it("honors the parsed asset's inherited anonymous policy without an override", async () => {
    const asset = await new GLTFLoader().load({ url: inlineUrl(), credentials: "omit" }, new LoadContext());
    const cache = new GLTFSharedTextureCache();
    const decode = vi.fn(pixels);
    const options = { imageDecoder: decode, sharedTextures: cache };
    const first = await createGLTFRenderResources(asset, options);
    const second = await createGLTFRenderResources(asset, options);
    try {
      expect(decode).toHaveBeenCalledOnce();
      expect(textureOf(first)).toBe(textureOf(second));
    } finally { first.dispose(); second.dispose(); }
  });

  it.each([undefined, { credentials: "same-origin" as const }, { credentials: "include" as const }])(
    "keeps unscoped credentialed requests private: %j", async (request) => {
      const asset = await loadAsset();
      const cache = new GLTFSharedTextureCache();
      const decode = vi.fn(pixels);
      const first = await createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache, request });
      const second = await createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache, request });
      try {
        expect(decode).toHaveBeenCalledTimes(2);
        expect(textureOf(first)).not.toBe(textureOf(second));
        expect(cache.refCount).toBe(0);
        first.dispose();
        expect(textureOf(first).disposed).toBe(true);
        expect(textureOf(second).disposed).toBe(false);
      } finally { first.dispose(); second.dispose(); }
    }
  );

  it("isolates authorization, generation, and transport policy within a shared cache", async () => {
    const asset = await loadAsset();
    const cache = new GLTFSharedTextureCache();
    const decode = vi.fn(pixels);
    const make = (securityContext: string, authorization: string, maxBytes = 1024) =>
      createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache,
        request: { credentials: "include", securityContext, headers: { authorization }, maxBytes } });
    const first = await make("generation-a", "Bearer a");
    const same = await make("generation-a", "Bearer a");
    const rotated = await make("generation-b", "Bearer a");
    const differentHeader = await make("generation-a", "Bearer b");
    const differentBudget = await make("generation-a", "Bearer a", 2048);
    try {
      expect(textureOf(same)).toBe(textureOf(first));
      expect(new Set([textureOf(first), textureOf(rotated), textureOf(differentHeader), textureOf(differentBudget)]).size).toBe(4);
      expect(decode).toHaveBeenCalledTimes(4);
    } finally { first.dispose(); same.dispose(); rotated.dispose(); differentHeader.dispose(); differentBudget.dispose(); }
  });

  it("does not share if secure hashing is unavailable", async () => {
    const asset = await loadAsset();
    vi.stubGlobal("crypto", {});
    const cache = new GLTFSharedTextureCache();
    const decode = vi.fn(pixels);
    const options = { imageDecoder: decode, sharedTextures: cache, request: { credentials: "omit" as const } };
    const first = await createGLTFRenderResources(asset, options);
    const second = await createGLTFRenderResources(asset, options);
    try {
      expect(decode).toHaveBeenCalledTimes(2);
      expect(textureOf(first)).not.toBe(textureOf(second));
      expect(cache.refCount).toBe(0);
    } finally { first.dispose(); second.dispose(); }
  });

  it("binds mutable request data to the digest and decoder before hashing yields", async () => {
    const asset = await loadAsset();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const subtle = webcrypto.subtle as unknown as SubtleCrypto;
    vi.stubGlobal("crypto", { subtle: { digest: async (...args: Parameters<SubtleCrypto["digest"]>) => {
      await gate;
      return subtle.digest(...args);
    } } });
    const cache = new GLTFSharedTextureCache();
    const seen: string[] = [];
    const decoder: GLTFImageDecoder = (_image, _index, _asset, context) => {
      seen.push(`${new Headers(context?.request?.headers).get("authorization")}:${context?.request?.securityContext}`);
      return pixels();
    };
    const headers = { authorization: "Bearer original" };
    const request = { credentials: "omit" as const, headers, securityContext: "original" };
    const pendingOriginal = createGLTFRenderResources(asset, { imageDecoder: decoder, sharedTextures: cache, request });
    headers.authorization = "Bearer changed";
    request.securityContext = "changed";
    const pendingChanged = createGLTFRenderResources(asset, { imageDecoder: decoder, sharedTextures: cache, request });
    release();
    const [original, changed] = await Promise.all([pendingOriginal, pendingChanged]);
    try {
      expect(seen.sort()).toEqual(["Bearer changed:changed", "Bearer original:original"]);
      expect(textureOf(original)).not.toBe(textureOf(changed));
    } finally { original.dispose(); changed.dispose(); }
  });

  it("keeps explicit progress callbacks private and delivers each subscriber's callback", async () => {
    const asset = await loadAsset();
    const cache = new GLTFSharedTextureCache();
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();
    const decode = vi.fn<GLTFImageDecoder>((_image, _index, _asset, context) => {
      context?.request?.onProgress?.({ url: "image", phase: "complete", loadedBytes: 1 });
      return pixels();
    });
    const first = await createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache,
      request: { credentials: "omit", onProgress: firstProgress } });
    const second = await createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache,
      request: { credentials: "omit", onProgress: secondProgress } });
    try {
      expect(decode).toHaveBeenCalledTimes(2);
      expect(firstProgress).toHaveBeenCalledOnce();
      expect(secondProgress).toHaveBeenCalledOnce();
      expect(textureOf(first)).not.toBe(textureOf(second));
    } finally { first.dispose(); second.dispose(); }
  });

  it("checks a changed dependency digest instead of reusing a verified texture", async () => {
    const documentUrl = "https://assets.invalid/model.gltf";
    const imageUrl = "https://assets.invalid/pixel.png";
    const document = { asset: { version: "2.0" }, images: [{ uri: "pixel.png" }], textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], scenes: [{ nodes: [] }], scene: 0 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === documentUrl) return new Response(JSON.stringify(document));
      if (String(input) === imageUrl) return new Response("pixels");
      throw new Error("unexpected request");
    });
    vi.stubGlobal("fetch", fetchMock);
    const asset = await new GLTFLoader().load({ url: documentUrl, credentials: "omit" }, new LoadContext());
    const cache = new GLTFSharedTextureCache();
    const decode = vi.fn<GLTFImageDecoder>((image) => {
      expect(new TextDecoder().decode(image.data)).toBe("pixels");
      return pixels();
    });
    const digest = createHash("sha256").update("pixels").digest("hex");
    const make = (child: string) => createGLTFRenderResources(asset, { imageDecoder: decode, sharedTextures: cache,
      request: { credentials: "omit", integrity: { version: 1, digest: "0".repeat(64), dependencies: { "pixel.png": child }, requireDependencies: true } } });
    const first = await make(digest);
    const same = await make(digest);
    try {
      expect(textureOf(first)).toBe(textureOf(same));
      expect(decode).toHaveBeenCalledOnce();
      await expect(make("f".repeat(64))).rejects.toBeInstanceOf(AssetIntegrityError);
      expect(decode).toHaveBeenCalledOnce();
    } finally { first.dispose(); same.dispose(); }
  });

  it("shares and disposes through the production pipeline with an inherited progress dispatcher", async () => {
    const cache = new GLTFSharedTextureCache();
    const decode = vi.fn(pixels);
    const options = { url: inlineUrl(), imageDecoder: decode, sharedTextures: cache, request: { credentials: "omit" as const } };
    const first = await loadProductionGLTFRenderPipeline({ ...options, assetId: "first" });
    const second = await loadProductionGLTFRenderPipeline({ ...options, assetId: "second" });
    try {
      expect(first.asset).toBe(second.asset);
      expect(textureOf(first.resources)).toBe(textureOf(second.resources));
      expect(decode).toHaveBeenCalledOnce();
      expect(first.metadata.runtimeMaterialCount).toBe(1);
      await first.disposeAsync();
      expect(textureOf(second.resources).disposed).toBe(false);
    } finally { await first.disposeAsync(); await second.disposeAsync(); }
    await Promise.resolve();
    expect(textureOf(second.resources).disposed).toBe(true);
  });

  it("uses one captured request policy for pipeline parsing and resource creation", async () => {
    const url = "https://assets.invalid/snapshot.gltf";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(documentWithImage())));
    vi.stubGlobal("fetch", fetchMock);
    const seen: string[] = [];
    const decode: GLTFImageDecoder = (_image, _index, _asset, context) => {
      seen.push(`${new Headers(context?.request?.headers).get("authorization")}:${context?.request?.securityContext}`);
      return pixels();
    };
    const headers = { authorization: "Bearer original" };
    const request = { credentials: "omit" as const, headers, securityContext: "original" };
    const pending = loadProductionGLTFRenderPipeline({ url, assetId: "snapshot", imageDecoder: decode,
      sharedTextures: new GLTFSharedTextureCache(), request });
    headers.authorization = "Bearer changed";
    request.securityContext = "changed";
    const pipeline = await pending;
    try {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer original");
      expect(seen).toEqual(["Bearer original:original"]);
    } finally { await pipeline.disposeAsync(); }
  });
});
