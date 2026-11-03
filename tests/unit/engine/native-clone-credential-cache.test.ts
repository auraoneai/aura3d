import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { cloneSkinned, type ClonedSkinnedModel } from "../../../packages/engine/src/agent-api/characters/clone";
import { GLB_RESOURCE_CACHE_DEFAULTS, glbResourceCache } from "../../../packages/engine/src/production-runtime/GlbResourceCache";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

const url = "https://assets.invalid/clone-model.gltf";
let principal = "a";
const batches: ClonedSkinnedModel[] = [];

function gltf(): string {
  const extent = principal === "a" ? 1 : 2;
  const positions = new Float32Array([0, 0, 0, extent, 0, 0, 0, 1, 0]);
  return JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString("base64")}`, byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [extent, 1, 0] }],
    images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  });
}

const decode = vi.fn(() => ({ width: 1, height: 1, data: new Uint8Array([principal === "a" ? 17 : 83, 0, 0, 255]) }));
const fetchModel = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(gltf(), { status: 200 }));

function remember(batch: ClonedSkinnedModel): ClonedSkinnedModel {
  batches.push(batch);
  return batch;
}

function texture(actor: TypedGLBActor) {
  const [result] = actor.pipeline.resources.textureLibrary.values();
  if (!result) throw new Error("Expected a decoded texture");
  return result;
}

beforeEach(() => {
  principal = "a";
  decode.mockClear();
  fetchModel.mockReset();
  fetchModel.mockImplementation(async () => new Response(gltf(), { status: 200 }));
  glbResourceCache.clear();
  glbResourceCache.configure(GLB_RESOURCE_CACHE_DEFAULTS);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", fetchModel);
});

afterEach(() => {
  for (const batch of batches.splice(0)) batch.dispose();
  glbResourceCache.clear();
  glbResourceCache.configure(GLB_RESOURCE_CACHE_DEFAULTS);
  vi.unstubAllGlobals();
});

describe("cloneSkinned credential-aware texture ownership", () => {
  it.each([undefined, "same-origin", "include"] as const)("loads unscoped %s credentials privately", async (credentials) => {
    let calls = 0;
    fetchModel.mockImplementation(async () => {
      principal = calls++ === 0 ? "a" : "b";
      return new Response(gltf(), { status: 200 });
    });
    const batch = remember(await cloneSkinned({ url, format: "gltf" }, 2, {
      imageDecoder: decode,
      ...(credentials ? { request: { credentials } } : {})
    }));
    const [first, second] = batch.actors;
    expect(fetchModel).toHaveBeenCalledTimes(2);
    expect(first.pipeline.asset).not.toBe(second.pipeline.asset);
    expect(texture(first)).not.toBe(texture(second));
    expect(texture(first).data?.[0]).toBe(17);
    expect(texture(second).data?.[0]).toBe(83);
    expect(batch.sharedTextures.size).toBe(0);
    expect(batch.sharedTextures.refCount).toBe(0);
  });

  it.each([
    { credentials: "omit" as const },
    { credentials: "include" as const, securityContext: "generation-a" }
  ])("shares only a reusable request and inherits its live cache", async (request) => {
    const first = remember(await cloneSkinned({ url, format: "gltf" }, 2, { request, imageDecoder: decode }));
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(texture(first.actors[0])).toBe(texture(first.actors[1]));
    expect(first.sharedTextures.refCount).toBe(2);
    const peer = remember(await cloneSkinned(first.actors[0], 1, { request, imageDecoder: decode }));
    expect(peer.sharedTextures).toBe(first.sharedTextures);
    expect(texture(peer.actors[0])).toBe(texture(first.actors[0]));
  });

  it("does not inherit a cache from a different authentication generation", async () => {
    const first = remember(await cloneSkinned({ url, format: "gltf" }, 1, {
      request: { credentials: "include", securityContext: "generation-a" }, imageDecoder: decode
    }));
    principal = "b";
    const second = remember(await cloneSkinned(first.actors[0], 1, {
      request: { credentials: "include", securityContext: "generation-b" }, imageDecoder: decode
    }));
    expect(fetchModel).toHaveBeenCalledTimes(2);
    expect(second.sharedTextures).not.toBe(first.sharedTextures);
    expect(texture(second.actors[0])).not.toBe(texture(first.actors[0]));
    expect(texture(second.actors[0]).data?.[0]).toBe(83);
  });

  it("rejects an explicitly supplied unsafe cache before fetching", async () => {
    const sharedTextures = new GLTFSharedTextureCache();
    await expect(cloneSkinned({ url, format: "gltf" }, 1, { sharedTextures, imageDecoder: decode }))
      .rejects.toThrow(/requires a reusable request identity/i);
    expect(fetchModel).not.toHaveBeenCalled();
    expect(sharedTextures.refCount).toBe(0);
  });

  it("keeps resources private when hashing is unavailable or sharing is disabled", async () => {
    vi.stubGlobal("crypto", undefined);
    const noHash = remember(await cloneSkinned({ url, format: "gltf" }, 2, {
      request: { credentials: "omit" }, imageDecoder: decode
    }));
    expect(fetchModel).toHaveBeenCalledTimes(2);
    expect(texture(noHash.actors[0])).not.toBe(texture(noHash.actors[1]));
    expect(noHash.sharedTextures.refCount).toBe(0);
    await expect(cloneSkinned({ url, format: "gltf" }, 1, {
      request: { credentials: "omit" }, sharedTextures: new GLTFSharedTextureCache(), imageDecoder: decode
    })).rejects.toThrow(/requires a reusable request identity/i);

    vi.stubGlobal("crypto", webcrypto);
    const privateBatch = remember(await cloneSkinned({ url, format: "gltf" }, 2, {
      request: { credentials: "omit" }, shareTextures: false, imageDecoder: decode
    }));
    expect(texture(privateBatch.actors[0])).not.toBe(texture(privateBatch.actors[1]));
    expect(privateBatch.sharedTextures.refCount).toBe(0);
  });

  it("snapshots admitted policy and metadata before identity hashing, with app policy taking precedence", async () => {
    let finishDigest!: (digest: ArrayBuffer) => void;
    const pendingDigest = new Promise<ArrayBuffer>((resolve) => { finishDigest = resolve; });
    let firstDigest = true;
    const digest = vi.fn((_algorithm: unknown, data: unknown) => {
      if (firstDigest) { firstDigest = false; return pendingDigest; }
      return webcrypto.subtle.digest("SHA-256", data as never);
    });
    vi.stubGlobal("crypto", { subtle: { digest } });
    const headers = { "x-auth-generation": "asset-one" };
    const appHeaders = { "x-auth-generation": "app-one" };
    const allowedOrigins = ["https://assets.invalid"];
    const admitted = {
      url, format: "gltf", sha256: createHash("sha256").update(gltf()).digest("hex"),
      formatMetadata: { version: "2.0", source: { format: "gltf", conversion: "offline" as const } },
      request: { credentials: "include" as const, securityContext: "asset-one", headers, allowedOrigins }
    };
    const request = { securityContext: "app-one", headers: appHeaders };
    const loading = cloneSkinned(admitted, 1, { request, imageDecoder: decode });
    headers["x-auth-generation"] = "asset-mutated";
    appHeaders["x-auth-generation"] = "app-mutated";
    allowedOrigins[0] = "https://wrong.invalid";
    admitted.request.securityContext = "asset-mutated";
    admitted.formatMetadata.source.format = "mutated";
    request.securityContext = "app-mutated";
    finishDigest(new ArrayBuffer(32));
    const batch = remember(await loading);
    expect(new Headers(fetchModel.mock.calls[0]?.[1]?.headers).get("x-auth-generation")).toBe("app-one");
    expect(fetchModel.mock.calls[0]?.[1]?.credentials).toBe("include");
    expect(batch.asset.sha256).toBe(admitted.sha256);
    expect(batch.asset.request?.securityContext).toBe("asset-one");
    expect(batch.asset.request?.allowedOrigins).toEqual(["https://assets.invalid"]);
    expect(batch.asset.formatMetadata?.source?.format).toBe("gltf");
  });

  it("does not start a load when cancellation arrives during identity hashing", async () => {
    let finishDigest!: (digest: ArrayBuffer) => void;
    const pendingDigest = new Promise<ArrayBuffer>((resolve) => { finishDigest = resolve; });
    vi.stubGlobal("crypto", { subtle: { digest: () => pendingDigest } });
    const controller = new AbortController();
    const reason = new Error("cancel clone");
    const loading = cloneSkinned({ url, format: "gltf" }, 1, {
      request: { credentials: "omit", signal: controller.signal }, imageDecoder: decode
    });
    controller.abort(reason);
    finishDigest(new ArrayBuffer(32));
    await expect(loading).rejects.toBe(reason);
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it("enforces the admitted asset digest instead of dropping it", async () => {
    await expect(cloneSkinned({ url, format: "gltf", sha256: "0".repeat(64) }, 1, {
      request: { credentials: "omit" }, imageDecoder: decode
    })).rejects.toThrow(/integrity|sha-256/i);
  });
});
