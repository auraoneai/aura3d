import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { createTypedGLBActor, type TypedGLBActor, type TypedGLBActorOptions } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { GLB_RESOURCE_CACHE_DEFAULTS, glbResourceCache } from "../../../packages/engine/src/production-runtime/GlbResourceCache";
import { sharedModelTextures } from "../../../packages/engine/src/production-runtime/actor/ModelTextureShare";

const url = "https://assets.invalid/session-model.gltf";
let principal = "a";
let fetchCount = 0;
const actors: TypedGLBActor[] = [];

function documentForPrincipal(): string {
  const extent = principal === "a" ? 1 : 2;
  const positions = new Float32Array([0, 0, 0, extent, 0, 0, 0, 1, 0]);
  const bytes = Buffer.from(positions.buffer);
  return JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: bytes.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [extent, 1, 0] }],
    images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  });
}

const decode = vi.fn(() => ({ width: 1, height: 1, data: new Uint8Array([principal === "a" ? 17 : 83, 0, 0, 255]) }));

async function actor(id: string, request?: TypedGLBActorOptions["request"], sharedTextures?: GLTFSharedTextureCache): Promise<TypedGLBActor> {
  const result = await createTypedGLBActor({
    id, asset: { url, format: "gltf" }, width: 8, height: 8, imageDecoder: decode,
    ...(request ? { request } : {}), ...(sharedTextures ? { sharedTextures } : {})
  });
  actors.push(result);
  return result;
}

function firstTexture(model: TypedGLBActor) {
  const [value] = model.pipeline.resources.textureLibrary.values();
  if (!value) throw new Error("Expected decoded material texture");
  return value;
}

beforeEach(() => {
  principal = "a";
  fetchCount = 0;
  decode.mockClear();
  glbResourceCache.clear();
  glbResourceCache.configure(GLB_RESOURCE_CACHE_DEFAULTS);
  glbResourceCache.resetStats();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async () => {
    fetchCount += 1;
    return new Response(documentForPrincipal(), { status: 200 });
  }));
});

afterEach(() => {
  for (const model of actors.splice(0)) model.dispose();
  glbResourceCache.clear();
  glbResourceCache.configure(GLB_RESOURCE_CACHE_DEFAULTS);
  vi.unstubAllGlobals();
});

describe("typed actor credential-aware cache ownership", () => {
  it.each([undefined, "same-origin", "include"] as const)("keeps unscoped %s requests private across concurrent actors and remounts", async (credentials) => {
    const request = credentials ? { credentials } : undefined;
    const registryBefore = sharedModelTextures.size;
    const first = await actor("private-a", request);
    principal = "b";
    const second = await actor("private-b", request);
    expect(fetchCount).toBe(2);
    expect(first.pipeline.asset).not.toBe(second.pipeline.asset);
    expect(first.pipeline.resources.bounds.max[0]).toBe(1);
    expect(second.pipeline.resources.bounds.max[0]).toBe(2);
    expect(firstTexture(first)).not.toBe(firstTexture(second));
    expect(firstTexture(first).data?.[0]).toBe(17);
    expect(firstTexture(second).data?.[0]).toBe(83);
    expect(sharedModelTextures.size).toBe(registryBefore);
    first.dispose();
    second.dispose();
    expect(glbResourceCache.snapshot().entries).toBe(0);

    const remounted = await actor("private-remount", request);
    expect(fetchCount).toBe(3);
    expect(remounted.pipeline.asset).not.toBe(second.pipeline.asset);
    expect(glbResourceCache.snapshot().hits).toBe(0);
  });

  it("shares omitted-credential resources across peers and preserves parse reuse across remounts", async () => {
    const request = { credentials: "omit" as const };
    const first = await actor("public-a", request);
    const second = await actor("public-b", request);
    expect(fetchCount).toBe(1);
    expect(first.pipeline.asset).toBe(second.pipeline.asset);
    expect(firstTexture(first)).toBe(firstTexture(second));
    expect(decode).toHaveBeenCalledTimes(1);
    first.dispose();
    expect(firstTexture(second).disposed).toBe(false);
    second.dispose();
    expect(glbResourceCache.snapshot().entries).toBe(1);
    const remounted = await actor("public-remount", request);
    expect(fetchCount).toBe(1);
    expect(remounted.pipeline.asset).toBe(first.pipeline.asset);
    expect(glbResourceCache.snapshot().hits).toBe(1);
  });

  it("shares only within the same explicit security generation", async () => {
    const generationA = { credentials: "include" as const, securityContext: "generation-a" };
    const generationB = { credentials: "include" as const, securityContext: "generation-b" };
    const first = await actor("generation-a-1", generationA);
    const same = await actor("generation-a-2", generationA);
    principal = "b";
    const next = await actor("generation-b", generationB);
    expect(fetchCount).toBe(2);
    expect(first.pipeline.asset).toBe(same.pipeline.asset);
    expect(firstTexture(first)).toBe(firstTexture(same));
    expect(next.pipeline.asset).not.toBe(first.pipeline.asset);
    expect(firstTexture(next)).not.toBe(firstTexture(first));
    expect(firstTexture(next).data?.[0]).toBe(83);
    first.dispose();
    expect(glbResourceCache.snapshot().entries).toBe(1);
    const keys = glbResourceCache.snapshot().keys.join(" ");
    expect(keys).not.toContain("generation-a");
    expect(keys).not.toContain("generation-b");
  });

  it("rejects an explicitly shared cache before fetching without a reusable identity", async () => {
    const cache = new GLTFSharedTextureCache();
    await expect(actor("unsafe-explicit", undefined, cache)).rejects.toThrow(/requires a reusable request identity/i);
    await expect(actor("unsafe-explicit-include", { credentials: "include" }, cache)).rejects.toThrow(/requires a reusable request identity/i);
    expect(fetchCount).toBe(0);
    expect(cache.refCount).toBe(0);
  });

  it("rejects the same explicit cache in a different credential generation", async () => {
    const cache = new GLTFSharedTextureCache();
    const first = await actor("explicit-a", { credentials: "include", securityContext: "generation-a" }, cache);
    const same = await actor("explicit-a-peer", { credentials: "include", securityContext: "generation-a" }, cache);
    expect(firstTexture(first)).toBe(firstTexture(same));
    await expect(actor("explicit-b", { credentials: "include", securityContext: "generation-b" }, cache)).rejects.toThrow(/asset or request contexts/i);
    expect(fetchCount).toBe(1);
  });

  it("fails closed when hashing is unavailable even for an omitted-credential request", async () => {
    vi.stubGlobal("crypto", undefined);
    const cache = new GLTFSharedTextureCache();
    await expect(actor("no-hash-explicit", { credentials: "omit" }, cache)).rejects.toThrow(/requires a reusable request identity/i);
    const privateActor = await actor("no-hash-private", { credentials: "omit" });
    privateActor.dispose();
    expect(glbResourceCache.snapshot().entries).toBe(0);
    expect(cache.refCount).toBe(0);
  });
});
