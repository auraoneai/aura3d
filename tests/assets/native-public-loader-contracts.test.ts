import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioLoader } from "../../packages/assets/src/AudioLoader";
import { FormatRegistry, createDefaultFormatRegistry, createGLTFFormatAdapter } from "../../packages/assets/src/FormatRegistry";
import { ImageBitmapLoader } from "../../packages/assets/src/ImageBitmapLoader";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { SceneLoader } from "../../packages/assets/src/SceneLoader";
import { loadRenderableAsset } from "../../packages/assets/src/loadRenderableAsset";
import { createRenderableScene, type RenderableScene } from "../../packages/assets/src/createRenderableScene";
import { PLYLoader } from "../../packages/assets/src/loaders/MeshFormatLoaders";
import type { GLTFRenderResources } from "../../packages/assets/src/GLTFRenderResources";
import { DataTextureLoader } from "../../packages/assets/src/DataTextureLoader";
import { loadProductionGLTFRenderPipeline } from "../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";
import { webcrypto } from "node:crypto";

const abcDigest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const integrity = { version: 1 as const, digest: `sha256-${abcDigest}` };

afterEach(() => vi.unstubAllGlobals());

describe("native public loader contracts", () => {
  it("forwards audio credentials, headers, progress and verified bytes before decoding", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("abc"));
    vi.stubGlobal("fetch", fetchMock);
    const decode = vi.fn(async (bytes: ArrayBuffer) => ({ length: bytes.byteLength }) as AudioBuffer);
    const progress = vi.fn();
    const asset = await new AudioLoader({ decodeAudioData: decode }).load({ url: "https://example.test/audio.wav", onProgress: progress }, new LoadContext({
      credentials: "include", headers: { "X-Test": "ok" }, allowedOrigins: ["https://example.test"], integrity
    }));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include", headers: { "X-Test": "ok" } });
    expect(decode).toHaveBeenCalledOnce();
    expect(asset.buffer.length).toBe(3);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "complete", loadedBytes: 3 });
    await expect(new AudioLoader({ decodeAudioData: decode }).load({ url: "https://example.test/a.wav", integrity: { ...integrity, digest: "0".repeat(64) } }, new LoadContext())).rejects.toThrow(/integrity mismatch/);
    expect(decode).toHaveBeenCalledOnce();
  });

  it("rejects cancelled audio decode promptly and never transfers a late result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("abc")));
    let resolveDecode!: (value: AudioBuffer) => void;
    let decodeStarted!: () => void;
    const started = new Promise<void>((resolve) => { decodeStarted = resolve; });
    const loader = new AudioLoader({ decodeAudioData: () => {
      decodeStarted();
      return new Promise<AudioBuffer>((resolve) => { resolveDecode = resolve; });
    } });
    const controller = new AbortController();
    const pending = loader.load({ url: "https://example.test/a.wav", signal: controller.signal }, new LoadContext());
    await started;
    controller.abort(new Error("cancel audio"));
    await expect(pending).rejects.toThrow("cancel audio");
    resolveDecode({} as AudioBuffer);
  });

  it("uses the shared request policy for scenes and rejects unsupported data", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ nodes: [{ name: "authored-root", translation: [1, 2, 3] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const loader = new SceneLoader();
    const asset = await loader.load({ url: "world.scene.json" }, new LoadContext({ baseUrl: "https://example.test/scenes/", headers: { "X-Test": "scene" } }));
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/scenes/world.scene.json");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { "X-Test": "scene" } });
    expect(asset.scene.findByName("authored-root")[0].transform.position).toEqual([1, 2, 3]);
    loader.dispose(asset);
    fetchMock.mockResolvedValueOnce(Response.json({ nodes: [], external: ["ignored.glb"] }));
    await expect(loader.load({ url: "https://example.test/world.scene.json" }, new LoadContext())).rejects.toThrow(/Unsupported scene field: external/);
    fetchMock.mockResolvedValueOnce(Response.json({ nodes: [{ translation: [1, 2] }] }));
    await expect(loader.load({ url: "https://example.test/world.scene.json" }, new LoadContext())).rejects.toThrow(/translation/);
  });

  it("honors bitmap credentials and flipY with explicit orientation taking precedence", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("abc"));
    vi.stubGlobal("fetch", fetchMock);
    const close = vi.fn();
    // Real ImageBitmaps always carry dimensions; the loader admits them before returning.
    const bitmap = { close, width: 4, height: 4 } as unknown as ImageBitmap;
    const decode = vi.fn(async (_blob: Blob, _options?: ImageBitmapOptions) => bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    const loader = new ImageBitmapLoader({ flipY: true, premultiplyAlpha: "none" }).setWithCredentials(true).setRequestHeader({ "X-Test": "image" });
    expect(await loader.loadAsync("https://example.test/image.png", undefined, { integrity })).toBe(bitmap);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).get("x-test")).toBe("image");
    expect(decode.mock.calls[0][1]).toMatchObject({ imageOrientation: "flipY", premultiplyAlpha: "none" });
    loader.setOptions({ imageOrientation: "none" });
    await loader.loadAsync("https://example.test/image.png", undefined, { credentials: undefined, headers: undefined });
    expect(decode.mock.calls[1][1]).toMatchObject({ imageOrientation: "none" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: "include" });
    expect(new Headers(fetchMock.mock.calls[1][1]!.headers).get("x-test")).toBe("image");
    expect(close).not.toHaveBeenCalled();
  });

  it("closes an image whose asynchronous decode completes after cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("abc")));
    let resolveDecode!: (value: ImageBitmap) => void;
    let decodeStarted!: () => void;
    const started = new Promise<void>((resolve) => { decodeStarted = resolve; });
    vi.stubGlobal("createImageBitmap", () => { decodeStarted(); return new Promise<ImageBitmap>((resolve) => { resolveDecode = resolve; }); });
    const controller = new AbortController();
    const pending = new ImageBitmapLoader().loadAsync("https://example.test/image.png", undefined, { signal: controller.signal });
    await started;
    controller.abort(new Error("cancel image"));
    await expect(pending).rejects.toThrow("cancel image");
    const close = vi.fn();
    resolveDecode({ close } as unknown as ImageBitmap);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not substitute a canonical fixture for unknown input or unavailable fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadRenderableAsset("https://example.test/not-a-model.foo?token=secret")).rejects.toThrow(/No native format adapter/);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(loadRenderableAsset("https://example.test/not-a-model.foo?token=secret")).rejects.not.toThrow("secret");
    vi.stubGlobal("fetch", undefined);
    await expect(loadRenderableAsset("/missing.json", { type: "canonical-product-scene" })).rejects.toThrow(/fetch is unavailable/);
  });

  it("requires an explicit canonical type and a valid requested manifest", async () => {
    const manifest = { schemaVersion: "a3d-engine-readiness-canonical-product-scene", kind: "canonical-product-scene", sourceFixture: "createCanonicalProductSceneRenderKit", blockedClaims: ["sample"] };
    const fetchMock = vi.fn(async () => Response.json(manifest));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadRenderableAsset("https://example.test/canonical-product-scene.json")).rejects.toThrow(/No native format adapter/);
    const loaded = await loadRenderableAsset("https://example.test/canonical-product-scene.json", { type: "canonical-product-scene" });
    expect(loaded.kind).toBe("canonical-product-scene");
    expect(loaded.warnings).toEqual(["Blocked claims remain: sample"]);
    fetchMock.mockResolvedValueOnce(Response.json({ kind: "canonical-product-scene" }));
    await expect(loadRenderableAsset("https://example.test/invalid.json", { type: "canonical-product-scene" })).rejects.toThrow(/Invalid canonical fixture manifest/);
  });

  it("selects registered adapters explicitly and balances scene and asset ownership", async () => {
    const registry = new FormatRegistry();
    const disposeAsset = vi.fn();
    const disposeScene = vi.fn();
    const loader = { type: "model", canLoad: () => true, load: vi.fn(async (_request: import("../../packages/assets/src/AssetLoader").AssetLoadRequest, _context: LoadContext) => ({ payload: 7 })), dispose: disposeAsset };
    registry.register({
      id: "model", extensions: ["foo"], supportedVersions: ["1.0"], loader,
      buildRenderableScene: async () => ({ source: {}, warnings: [], kind: "gltf", setupLineBudget: 0, dispose: disposeScene }) as unknown as RenderableScene
    });
    const context = new LoadContext({ headers: { "X-Test": "registry" } });
    const loaded = await loadRenderableAsset("https://example.test/object.foo", {
      type: "model", format: "foo", formatMetadata: { version: "1.0", source: { format: "old", conversion: "offline" } }, formatRegistry: registry,
      headers: { "X-Test": "registry" }
    });
    expect(loaded.kind).toBe("native-format");
    expect(loaded.selectedFormat).toBe("model");
    expect(loaded.formatMetadata?.source?.conversion).toBe("offline");
    expect(loader.load.mock.calls[0][0]).toMatchObject({ url: "https://example.test/object.foo", headers: { "X-Test": "registry" } });
    const scene = await createRenderableScene(loaded);
    expect(scene.kind).toBe("native-format");
    await loaded.dispose!();
    await loaded.dispose!();
    scene.dispose();
    expect(disposeScene).toHaveBeenCalledOnce();
    expect(disposeAsset).toHaveBeenCalledOnce();
    expect(context.requestOptions.headers).toEqual({ "X-Test": "registry" });
  });

  it("builds and releases a real opt-in PLY scene through the public entry points", async () => {
    const ply = [
      "ply", "format ascii 1.0", "element vertex 3",
      "property float x", "property float y", "property float z",
      "element face 1", "property list uchar int vertex_indices", "end_header",
      "0 0 0", "1 0 0", "0 1 0", "3 0 1 2", ""
    ].join("\n");
    const nativeFetch = globalThis.fetch;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("data:") ? nativeFetch(input, init) : Promise.resolve(new Response(ply))
    );
    vi.stubGlobal("fetch", fetchMock);
    const registry = createDefaultFormatRegistry();
    registry.register(createGLTFFormatAdapter("ply", ["ply"], new PLYLoader(), undefined, ["1.0"]));
    const asset = await loadRenderableAsset("https://example.test/triangle.ply", {
      formatRegistry: registry, format: "ply", formatMetadata: { version: "1.0" }
    });
    expect(asset.kind).toBe("native-format");
    expect(asset.selectedFormat).toBe("ply");
    const scene = await createRenderableScene(asset);
    expect(scene.kind).toBe("native-format");
    expect(scene.rendererInput?.source.scene).toBeDefined();
    await asset.dispose!();
    expect(asset.format?.disposed).toBe(true);
    scene.dispose();
  });

  it("distinguishes data loaders, adapter aliases, versions and collisions", async () => {
    const defaultFormatRegistry = createDefaultFormatRegistry();
    const originalGeneration = defaultFormatRegistry.generation;
    expect(defaultFormatRegistry.select({ url: "a.glb", type: "glb" }).id).toBe("gltf");
    expect(defaultFormatRegistry.select({ url: "a.glb" }, { format: "glb", formatMetadata: { adapter: "gltf", version: "2.0" } }).id).toBe("gltf");
    expect(() => defaultFormatRegistry.select({ url: "a.glb" }, { format: "glb", formatMetadata: { adapter: "gltf", version: "1.0" } })).toThrow(/version/);
    expect(() => defaultFormatRegistry.select({ url: "a.glb", type: "bad" }, { format: "glb" })).toThrow(/Requested type/);
    expect(() => defaultFormatRegistry.select({ url: "a.glb" }, { formatMetadata: { version: "" } })).toThrow(/version/);
    const registry = new FormatRegistry();
    const loader = { type: "data", canLoad: () => true, load: async () => ({ values: [1] }) };
    registry.register({ id: "data", extensions: ["data"], loader });
    const asset = await registry.load({ url: "a.data" }, new LoadContext());
    expect(asset.renderable).toBe(false);
    await expect(asset.createRenderableScene()).rejects.toThrow(/does not provide a scene resource builder/);
    await asset.dispose();
    registry.register({ id: "other", extensions: ["data"], loader });
    expect(() => registry.select({ url: "a.data" })).toThrow(/Ambiguous/);
    expect(defaultFormatRegistry.unregister("unknown")).toBe(false);
    expect(defaultFormatRegistry.generation).toBe(originalGeneration);
    expect(defaultFormatRegistry.unregister("gltf")).toBe(true);
    expect(defaultFormatRegistry.generation).toBe(originalGeneration + 1);
  });

  it("preserves typed scene capabilities and releases separately built resources once", async () => {
    const registry = new FormatRegistry();
    const assetDisposed = vi.fn();
    const sceneDisposed = vi.fn();
    const resourcesDisposed = vi.fn();
    class SpecializedScene {
      readonly kind = "gltf" as const;
      readonly source = {} as RenderableScene["source"];
      readonly warnings: string[] = [];
      readonly setupLineBudget = 1;
      #time = 0;
      setTime(value: number) { this.#time = value; }
      getTime() { return this.#time; }
      dispose() { sceneDisposed(); }
    }
    registry.register({ id: "motion", extensions: ["mot"], loader: { type: "motion", canLoad: () => true, load: () => ({ id: 7 }), dispose: assetDisposed },
      buildRenderableScene: () => new SpecializedScene(),
      buildGLTFResources: () => ({ dispose: resourcesDisposed }) as unknown as GLTFRenderResources
    });
    const lease = await registry.load<{ id: number }, SpecializedScene>({ url: "x.mot" }, new LoadContext());
    expect(lease.gltfRenderable).toBe(true);
    expect(lease.asset.id).toBe(7);
    const scene = await lease.createRenderableScene();
    scene.setTime(0.25);
    expect(scene.getTime()).toBe(0.25);
    const resource = await lease.createGLTFRenderResources();
    resource.dispose();
    await lease.dispose();
    scene.dispose();
    resource.dispose();
    expect(sceneDisposed).toHaveBeenCalledOnce();
    expect(resourcesDisposed).toHaveBeenCalledOnce();
    expect(assetDisposed).toHaveBeenCalledOnce();
  });

  it("accepts a configured compatible loader without bypassing adapter selection", async () => {
    const registry = new FormatRegistry();
    const baseLoad = vi.fn(() => ({ id: "base" }));
    const customLoad = vi.fn(() => ({ id: "configured" }));
    const customDispose = vi.fn();
    registry.register({ id: "configurable", extensions: ["cfg"], supportedVersions: ["1"],
      loader: { type: "configurable", canLoad: () => true, load: baseLoad } });
    const override = { type: "configurable", canLoad: () => true, load: customLoad, dispose: customDispose };
    const loaded = await registry.load<{ id: string }>({ url: "x.cfg" }, new LoadContext(), { formatMetadata: { version: "1" } }, override);
    expect(loaded.asset.id).toBe("configured");
    expect(baseLoad).not.toHaveBeenCalled();
    await loaded.dispose();
    expect(customDispose).toHaveBeenCalledOnce();
    await expect(registry.load({ url: "x.cfg" }, new LoadContext(), {}, { ...override, type: "other" })).rejects.toThrow(/incompatible/);
    await expect(registry.load({ url: "x.cfg" }, new LoadContext(), { formatMetadata: { version: "2" } }, override)).rejects.toThrow(/version/);
    expect(customLoad).toHaveBeenCalledOnce();
  });

  it("rejects cancelled adapter loads promptly and disposes late results", async () => {
    const registry = new FormatRegistry();
    let resolveLoad!: (value: { id: number }) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const dispose = vi.fn();
    registry.register({ id: "late", extensions: ["late"], loader: {
      type: "late", canLoad: () => true, dispose,
      load: () => { notifyStarted(); return new Promise<{ id: number }>((resolve) => { resolveLoad = resolve; }); }
    } });
    const controller = new AbortController();
    const pending = registry.load({ url: "test.late", signal: controller.signal }, new LoadContext());
    await started;
    controller.abort(new Error("cancel adapter"));
    await expect(pending).rejects.toThrow("cancel adapter");
    resolveLoad({ id: 7 });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledWith({ id: 7 }));
  });

  it("releases a scene completed while its format asset is being disposed", async () => {
    const registry = new FormatRegistry();
    let resolveScene!: (scene: RenderableScene) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    const dispose = vi.fn();
    const sceneDispose = vi.fn();
    registry.register({ id: "late-scene", extensions: ["late"], loader: { type: "late", canLoad: () => true, load: () => ({}), dispose },
      buildRenderableScene: () => { notifyStarted(); return new Promise<RenderableScene>((resolve) => { resolveScene = resolve; }); }
    });
    const asset = await registry.load({ url: "test.late" }, new LoadContext());
    const scenePromise = asset.createRenderableScene();
    await started;
    const disposal = asset.dispose();
    resolveScene({ kind: "gltf", source: {}, warnings: [], setupLineBudget: 0, dispose: sceneDispose } as unknown as RenderableScene);
    await expect(scenePromise).rejects.toThrow(/disposed while creating/);
    await disposal;
    expect(sceneDispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("applies the request contract to DataTextureLoader fetches (credentials, headers, integrity, cancellation)", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("abc"));
    vi.stubGlobal("fetch", fetchMock);
    class BytesLoader extends DataTextureLoader<number> { parse(buffer: ArrayBuffer) { return buffer.byteLength; } }
    const loader = new BytesLoader().setPath("https://example.test/data/").setWithCredentials(true)
      .setRequestHeader({ "X-Token": "loader" }).setRequestOptions({ allowedOrigins: ["https://example.test"], redirect: "error" });
    await expect(loader.loadAsync("a.bin", undefined, { integrity })).resolves.toBe(3);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/data/a.bin");
    expect(init).toMatchObject({ credentials: "include", redirect: "error" });
    expect(new Headers(init!.headers).get("x-token")).toBe("loader");
    await expect(loader.loadAsync("a.bin", undefined, { integrity: { ...integrity, digest: "0".repeat(64) } })).rejects.toThrow(/integrity mismatch/);
    await expect(new BytesLoader().setRequestOptions({ allowedOrigins: ["https://other.test"] }).loadAsync("https://example.test/b.bin")).rejects.toThrow(/not allowed/);
    const controller = new AbortController();
    controller.abort();
    await expect(loader.loadAsync("a.bin", undefined, { signal: controller.signal })).rejects.toBeDefined();
  });

  it("reads external images for an uncapped custom glTF decoder through the document request contract", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]).buffer);
    const document = {
      asset: { version: "2.0" },
      buffers: [{ uri: `data:application/octet-stream;base64,${positions.toString("base64")}`, byteLength: 64 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
      accessors: [
        { bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5126, type: "VEC2", count: 3 }
      ],
      images: [{ uri: "textures/base.png" }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    };
    const documentUrl = "https://cdn.example.test/models/scene.gltf";
    const imageUrl = "https://cdn.example.test/models/textures/base.png";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input) === documentUrl
      ? new Response(JSON.stringify(document)) : new Response(new Uint8Array([1, 2, 3, 4])));
    vi.stubGlobal("fetch", fetchMock);
    const received: Array<{ data?: ArrayBuffer; uri?: string }> = [];
    const imageDecoder = vi.fn((image: { data?: ArrayBuffer; uri?: string }) => {
      received.push({ data: image.data, uri: image.uri });
      return { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]), colorSpace: "srgb" as const };
    });
    const request = { credentials: "include" as const, headers: { "X-Asset-Key": "k" }, allowedOrigins: ["https://cdn.example.test"], redirect: "error" as const, securityContext: "generation-1" };
    const pipeline = await loadProductionGLTFRenderPipeline({ url: documentUrl, assetId: "contract", request, imageDecoder });
    try {
      expect(imageDecoder).toHaveBeenCalledOnce();
      expect([...new Uint8Array(received[0]!.data!)]).toEqual([1, 2, 3, 4]);
      const imageCall = fetchMock.mock.calls.find(([input]) => String(input) === imageUrl);
      expect(imageCall?.[1]).toMatchObject({ credentials: "include", redirect: "error" });
      expect(new Headers(imageCall?.[1]?.headers).get("x-asset-key")).toBe("k");
    } finally { pipeline.dispose(); }

    // The origin policy also governs the decoder's image: no decode, no image fetch.
    imageDecoder.mockClear();
    fetchMock.mockClear();
    const crossOrigin = { ...document, images: [{ uri: "https://elsewhere.test/base.png" }] };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => String(input) === documentUrl
      ? new Response(JSON.stringify(crossOrigin)) : new Response(new Uint8Array([1, 2, 3, 4])));
    await expect(loadProductionGLTFRenderPipeline({ url: documentUrl, assetId: "contract-cross", request, imageDecoder, failOnMissingTexture: true } as never)).rejects.toThrow();
    expect(imageDecoder).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([documentUrl]);
  });
});
