import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProductionGLTFRenderPipeline } from "../../../packages/assets/src/asset-corpus";
import { parsedGLTFAssetCacheKey, snapshotParsedGLTFAssetCache } from "../../../packages/assets/src/GLTFAssetParseCache";

/**
 * Performance mission section 27 (asset reuse) / section 38 (fix once in the reusable layer).
 *
 * Deep Recovery fetched and parsed the same typed GLB once per scene node: 17 GLB requests for 5
 * distinct assets (WreckHull x7, CrateHeavy x5, CrateStandard x3). The reuse has to happen in
 * `loadProductionGLTFRenderPipeline`, below typed-asset provenance, so every route inherits it.
 *
 * These tests replace the network with a counting stub and assert the shared-layer invariants:
 * one parse per URL, per-pipeline mutation isolation, reference-counted disposal, and no poisoned
 * entries after a failure.
 */

const GLB_FIXTURE = "tests/fixtures/gltf-multipart/body-and-four-wheels.glb";
const GLB_BYTES = new Uint8Array(readFileSync(GLB_FIXTURE));
const GLB_URL = "https://assets.invalid/props/body-and-four-wheels.glb";

/** One tiny glTF document with two named scenes and a shared mesh, served as `.gltf` text. */
function twoSceneGltfJson(): string {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const buffer = new Uint8Array(positions.byteLength + indices.byteLength);
  buffer.set(new Uint8Array(positions.buffer), 0);
  buffer.set(new Uint8Array(indices.buffer), positions.byteLength);
  return JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [
      { name: "hangar", nodes: [0] },
      { name: "exterior", nodes: [1] }
    ],
    nodes: [
      { name: "hangarPylon", mesh: 0 },
      { name: "exteriorPylon", mesh: 0 }
    ],
    meshes: [{ name: "pylon", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: "pylonMat", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", max: [1, 1, 0], min: [0, 0, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR", max: [2], min: [0] }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
    ],
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`, byteLength: buffer.byteLength }]
  });
}

const GLTF_URL = "https://assets.invalid/props/two-scene.gltf";
const GLTF_TEXT = twoSceneGltfJson();

let fetchCalls: string[];
let fetchResponder: (url: string, callIndex: number) => Response;
const nativeFetch = globalThis.fetch;

function installFetchStub(): void {
  fetchCalls = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(typeof (input as { url?: unknown })?.url === "string" ? (input as { url: string }).url : input);
    const callIndex = fetchCalls.length;
    fetchCalls.push(url);
    return fetchResponder(url, callIndex);
  }) as unknown as typeof fetch;
}

function serveGlb(): Response {
  return new Response(GLB_BYTES.slice(0).buffer as ArrayBuffer, { status: 200 });
}

function serveBroken(status = 500): Response {
  return new Response("nope", { status });
}

const imageDecoder = () => ({ width: 1, height: 1, data: new Uint8Array(4).fill(255), colorSpace: "srgb" as const });

function loadPipeline(url: string, assetId: string, extra: Record<string, unknown> = {}) {
  return loadProductionGLTFRenderPipeline({ url, assetId, imageDecoder, ...extra });
}

function sceneNodeNames(pipeline: Awaited<ReturnType<typeof loadPipeline>>): string[] {
  return pipeline.resources.scene.collectRenderables().map(({ node }) => node.name);
}

function cachedKeyCount(url: string): number {
  return snapshotParsedGLTFAssetCache().keys.filter((key) => key.startsWith(`${url}|`)).length;
}

/**
 * A disposed `VertexBuffer` refuses attribute reads, which is the observable signal that one
 * pipeline's own GPU resource was freed. Returns `null` while the buffer is still live.
 */
function vertexBufferState(geometry: { vertexBuffer: { getAttribute(index: number, semantic: string): unknown } }): string | null {
  try {
    geometry.vertexBuffer.getAttribute(0, "position");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeEach(() => {
  fetchResponder = serveGlb;
  installFetchStub();
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

describe("shared parsed GLB reuse in loadProductionGLTFRenderPipeline", () => {
  it("fetches and parses one GLB once for two pipelines that share a URL", async () => {
    const first = await loadPipeline(GLB_URL, "wreck-a");
    const second = await loadPipeline(GLB_URL, "wreck-b");

    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(1);
    expect(second.asset).toBe(first.asset);
    // The parse is shared; everything an actor can mutate is not.
    expect(second.resources).not.toBe(first.resources);
    expect(second.resources.scene).not.toBe(first.resources.scene);
    expect(second.metadata.meshCount).toBe(first.metadata.meshCount);
    expect(second.metadata.meshCount).toBeGreaterThan(0);
    for (const [, geometry] of second.resources.geometryLibrary) {
      expect([...first.resources.geometryLibrary.values()]).not.toContain(geometry);
    }
    first.dispose();
    second.dispose();
  });

  it("collapses concurrent loads of the same URL into one in-flight parse", async () => {
    // Routes build actors with `Promise.all`, so the seven WreckHull loads overlap.
    const pipelines = await Promise.all(
      Array.from({ length: 7 }, (_, index) => loadPipeline(GLB_URL, `wreck-${index}`))
    );

    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(1);
    expect(new Set(pipelines.map((pipeline) => pipeline.asset)).size).toBe(1);
    expect(new Set(pipelines.map((pipeline) => pipeline.resources)).size).toBe(7);
    for (const pipeline of pipelines) pipeline.dispose();
  });

  it("keeps per-pipeline scene mutation out of the shared parse and out of its peer", async () => {
    const first = await loadPipeline(GLB_URL, "crate-a");
    const second = await loadPipeline(GLB_URL, "crate-b");
    const [firstRenderable] = first.resources.scene.collectRenderables();
    const peerName = firstRenderable!.node.name;

    first.resources.scene.root.name = "crate-a-scene-root";
    first.resources.scene.root.visible = false;
    for (const [, material] of first.resources.materialLibrary) {
      material.setParameter("u_baseColor", [0.1, 0.2, 0.3, 1]);
    }

    expect(second.resources.scene.root.name).not.toBe("crate-a-scene-root");
    expect(second.resources.scene.root.visible).toBe(true);
    const peerNode = second.resources.scene.collectRenderables().find(({ node }) => node.name === peerName);
    expect(peerNode?.node.visible).toBe(true);
    for (const [key, material] of first.resources.materialLibrary) {
      expect((material.getParameter("u_baseColor") as readonly number[])[0]).toBe(0.1);
      expect(second.resources.materialLibrary.get(key)).not.toBe(material);
    }
    for (const [, material] of second.resources.materialLibrary) {
      const baseColor = material.getParameter("u_baseColor") as readonly number[] | undefined;
      expect(baseColor?.[0]).not.toBe(0.1);
    }
    // The shared parse itself stayed untouched by the per-pipeline scene writes.
    expect(first.resources.scene.collectRenderables().length).toBe(second.resources.scene.collectRenderables().length);
    first.dispose();
    second.dispose();
  });

  it("serves scene selection per pipeline from a single parse", async () => {
    fetchResponder = (url) => (url === GLTF_URL ? new Response(GLTF_TEXT, { status: 200 }) : serveGlb());
    const hangar = await loadPipeline(GLTF_URL, "hangar-view", { sceneName: "hangar" });
    const exterior = await loadPipeline(GLTF_URL, "exterior-view", { sceneName: "exterior" });

    // sceneName/sceneIndex/materialVariant change what `createScene` selects, not what is parsed,
    // so they must not split the cache - and must still be applied per pipeline.
    expect(fetchCalls.filter((url) => url === GLTF_URL)).toHaveLength(1);
    expect(exterior.asset).toBe(hangar.asset);
    expect(sceneNodeNames(hangar)).toEqual(["hangarPylon"]);
    expect(sceneNodeNames(exterior)).toEqual(["exteriorPylon"]);
    hangar.dispose();
    exterior.dispose();
  });

  it("keys the parse on the decoders that change it", async () => {
    const decoderA = (() => ({ attributes: { POSITION: [0, 0, 0] }, indices: [0, 1, 2] })) as never;
    const decoderB = (() => ({ attributes: { POSITION: [0, 0, 0] }, indices: [0, 1, 2] })) as never;

    const first = await loadPipeline(GLB_URL, "draco-1", { dracoDecoder: decoderA });
    const same = await loadPipeline(GLB_URL, "draco-1-again", { dracoDecoder: decoderA });
    const other = await loadPipeline(GLB_URL, "draco-2", { dracoDecoder: decoderB });
    const plain = await loadPipeline(GLB_URL, "no-draco");

    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(3);
    expect(same.asset).toBe(first.asset);
    expect(other.asset).not.toBe(first.asset);
    expect(plain.asset).not.toBe(first.asset);
    for (const pipeline of [first, same, other, plain]) pipeline.dispose();
  });

  it("does not cache a failed fetch, for a single caller or for concurrent callers", async () => {
    fetchResponder = () => serveBroken();
    const attempts = await Promise.allSettled([
      loadPipeline(GLB_URL, "retry-a"),
      loadPipeline(GLB_URL, "retry-b")
    ]);

    expect(attempts.map((attempt) => attempt.status)).toEqual(["rejected", "rejected"]);
    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(1);
    expect(cachedKeyCount(GLB_URL)).toBe(0);

    fetchResponder = serveGlb;
    const recovered = await loadPipeline(GLB_URL, "after-failure");
    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(2);
    expect(recovered.metadata.meshCount).toBeGreaterThan(0);
    recovered.dispose();
  });

  it("does not cache a corrupt parse and still serves the next load", async () => {
    fetchResponder = () => new Response(new Uint8Array([0, 1, 2, 3]).buffer as ArrayBuffer, { status: 200 });
    await expect(loadPipeline(GLB_URL, "corrupt")).rejects.toThrow();
    expect(cachedKeyCount(GLB_URL)).toBe(0);

    fetchResponder = serveGlb;
    const recovered = await loadPipeline(GLB_URL, "after-corrupt-parse");
    expect(recovered.resources.scene).toBeTruthy();
    expect(recovered.metadata.primitiveCount).toBeGreaterThan(0);
    recovered.dispose();
  });

  it("releases the parse reference when render-resource creation fails", async () => {
    // `materialVariant` is applied after the parse, so this throws in createGLTFRenderResources.
    await expect(loadPipeline(GLB_URL, "bad-variant", { materialVariant: "does-not-exist" })).rejects.toThrow(/material variant/);
    expect(cachedKeyCount(GLB_URL)).toBe(0);

    const survivor = await loadPipeline(GLB_URL, "after-resource-failure");
    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(2);
    expect(survivor.metadata.meshCount).toBeGreaterThan(0);
    survivor.dispose();
    expect(cachedKeyCount(GLB_URL)).toBe(0);
  });

  it("does not pin the shared parse when a non-finite option aborts the load", async () => {
    const url = "https://assets.invalid/props/non-finite.glb";
    let outcome: "resolved" | "rejected" = "resolved";
    let pipeline: Awaited<ReturnType<typeof loadPipeline>> | undefined;
    try {
      pipeline = await loadPipeline(url, "non-finite-viewport", { width: Number.NaN });
    } catch {
      outcome = "rejected";
    }
    // Whatever the loader decides about a non-finite viewport, a load that did not produce a live
    // pipeline must not leave a reference behind.
    expect(cachedKeyCount(url)).toBe(outcome === "resolved" ? 1 : 0);
    pipeline?.dispose();
    expect(cachedKeyCount(url)).toBe(0);

    const recovered = await loadPipeline(url, "after-non-finite");
    expect(recovered.resources.scene.collectRenderables().length).toBeGreaterThan(0);
    recovered.dispose();
  });

  it("keeps a peer alive when one pipeline disposes, and evicts only after the last one", async () => {
    const first = await loadPipeline(GLB_URL, "dispose-a");
    const second = await loadPipeline(GLB_URL, "dispose-b");
    const sharedAsset = first.asset;
    const firstGeometries = [...first.resources.geometryLibrary.values()];
    const peerGeometries = [...second.resources.geometryLibrary.values()];
    expect(firstGeometries.length).toBeGreaterThan(0);

    first.dispose();
    first.dispose(); // idempotent: a double dispose must not underflow the reference count

    expect(firstGeometries.every((geometry) => vertexBufferState(geometry) === "VertexBuffer is disposed")).toBe(true);
    expect(peerGeometries.every((geometry) => vertexBufferState(geometry) === null)).toBe(true);
    expect(second.asset).toBe(sharedAsset);
    expect(second.resources.scene.collectRenderables().length).toBeGreaterThan(0);
    expect(cachedKeyCount(GLB_URL)).toBe(1);

    second.dispose();
    expect(cachedKeyCount(GLB_URL)).toBe(0);

    // The released parse is gone: the next load fetches again instead of serving a dead asset.
    const reloaded = await loadPipeline(GLB_URL, "after-full-release");
    expect(fetchCalls.filter((url) => url === GLB_URL)).toHaveLength(2);
    expect(reloaded.asset).not.toBe(sharedAsset);
    expect(reloaded.resources.scene.collectRenderables().length).toBeGreaterThan(0);
    reloaded.dispose();
  });

  it("keeps the cache key on the resolved url plus the parse-affecting decoders", () => {
    expect(parsedGLTFAssetCacheKey("/aura-assets/a.glb")).toBe(parsedGLTFAssetCacheKey("/aura-assets/a.glb"));
    expect(parsedGLTFAssetCacheKey("/aura-assets/a.glb")).not.toBe(parsedGLTFAssetCacheKey("/aura-assets/b.glb"));
    expect(parsedGLTFAssetCacheKey("/aura-assets/a.glb")).not.toBe(parsedGLTFAssetCacheKey("/aura-assets/a.glb?v=2"));
    expect(parsedGLTFAssetCacheKey("http://localhost:5199/aura-assets/a.glb")).not.toBe(
      parsedGLTFAssetCacheKey("http://otherhost/aura-assets/a.glb")
    );
  });
});
