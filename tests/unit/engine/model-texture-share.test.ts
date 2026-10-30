import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTypedGLBActor, type TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { ModelTextureShareRegistry, modelTextureShareKey, sharedModelTextures } from "../../../packages/engine/src/production-runtime/actor/ModelTextureShare";

const GLB_BYTES = new Uint8Array(readFileSync("fixtures/asset-corpus/avocado.glb"));
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => new Response(new Uint8Array(GLB_BYTES), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = nativeFetch;
});

function asset(name: string) {
  return { url: `https://assets.invalid/aura-assets/${name}.glb`, type: "model", format: "glb", hash: `sha256-${name}` } as const;
}

function countingDecoder() {
  const state = { calls: 0 };
  const decoder = () => {
    state.calls += 1;
    return { width: 2, height: 2, data: new Uint8Array(16) };
  };
  return { state, decoder };
}

async function mount(count: number, name: string, options: Record<string, unknown>): Promise<TypedGLBActor[]> {
  return await Promise.all(
    Array.from({ length: count }, (_, i) =>
      createTypedGLBActor({ asset: asset(name), id: `${name}-${i}`, width: 64, height: 64, ...options }) as Promise<TypedGLBActor>
    )
  );
}

describe("ModelTextureShareRegistry (ref counting)", () => {
  it("hits for the same key, misses for another, and forgets the entry when the last holder releases", () => {
    const registry = new ModelTextureShareRegistry();
    const a = registry.acquire("k1");
    const b = registry.acquire("k1");
    const c = registry.acquire("k2");
    expect(a.cache).toBe(b.cache);
    expect(a.cache).not.toBe(c.cache);
    expect(registry.size).toBe(2);
    expect(a.holders).toBe(2);
    a.release();
    a.release(); // idempotent
    expect(b.holders).toBe(1);
    expect(registry.size).toBe(2);
    b.release();
    expect(registry.size).toBe(1);
    c.release();
    expect(registry.size).toBe(0);
    // A later acquire builds a fresh cache (the old one disposed with its last lease).
    expect(registry.acquire("k1").cache).not.toBe(a.cache);
  });

  it("keys on asset bytes and every decode input", () => {
    const base = { asset: { url: "u", id: "i", sha256: "s" } };
    const key = modelTextureShareKey(base);
    expect(modelTextureShareKey({ ...base })).toBe(key);
    expect(modelTextureShareKey({ ...base, maxTextureSize: 512 })).not.toBe(key);
    expect(modelTextureShareKey({ ...base, textureBudget: 1 })).not.toBe(key);
    expect(modelTextureShareKey({ asset: { ...base.asset, sha256: "t" } })).not.toBe(key);
    const decoders = {};
    expect(modelTextureShareKey({ ...base, decoders })).toBe(modelTextureShareKey({ ...base, decoders }));
    // GU47 eint EH-5: plain-data decode options key by value (a fresh `decoders: {}` per mount still shares),
    // decoder instances (anything with behaviour) by identity, as `glbResourceCacheKey` does.
    expect(modelTextureShareKey({ ...base, decoders })).toBe(modelTextureShareKey({ ...base, decoders: {} }));
    expect(modelTextureShareKey({ ...base, compressedTextureCapabilities: { astc: true, bc7: false } }))
      .toBe(modelTextureShareKey({ ...base, compressedTextureCapabilities: { bc7: false, astc: true } }));
    expect(modelTextureShareKey({ ...base, compressedTextureCapabilities: { astc: true } }))
      .not.toBe(modelTextureShareKey({ ...base, compressedTextureCapabilities: { astc: false } }));
    const withInstance = { draco: { decode: () => undefined } };
    expect(modelTextureShareKey({ ...base, decoders: withInstance })).toBe(modelTextureShareKey({ ...base, decoders: withInstance }));
    expect(modelTextureShareKey({ ...base, decoders: withInstance })).not.toBe(modelTextureShareKey({ ...base, decoders: { draco: { decode: () => undefined } } }));
  });
});

describe("repeated model() nodes of one GLB share decoded textures", () => {
  it("decodes each image once for 20 actors (was once per actor), and frees them with the last actor", async () => {
    const shared = countingDecoder();
    const private_ = countingDecoder();
    const before = sharedModelTextures.size;

    const sharedActors = await mount(20, "ShareOn", { imageDecoder: shared.decoder });
    const privateActors = await mount(20, "ShareOff", { imageDecoder: private_.decoder, shareTextures: false });

    expect(private_.state.calls).toBeGreaterThan(0);
    // Without sharing every actor decodes every image: calls scale with actor count.
    expect(private_.state.calls % 20).toBe(0);
    const perActor = private_.state.calls / 20;
    // With sharing the whole set decodes each distinct image once.
    expect(shared.state.calls).toBe(perActor);
    expect(sharedModelTextures.size).toBe(before + 1);

    const textureOf = (actor: TypedGLBActor) => [...actor.pipeline.resources.textureLibrary.values()][0];
    expect(textureOf(sharedActors[0]!)).toBe(textureOf(sharedActors[19]!));
    expect(textureOf(privateActors[0]!)).not.toBe(textureOf(privateActors[1]!));

    const survivor = textureOf(sharedActors[0]!)!;
    for (const actor of sharedActors.slice(1)) actor.dispose();
    expect(sharedModelTextures.size).toBe(before + 1);
    expect((survivor as { disposed?: boolean }).disposed ?? false).toBe(false);
    sharedActors[0]!.dispose();
    expect(sharedModelTextures.size).toBe(before);
    for (const actor of privateActors) actor.dispose();
    // Disposing twice never double-releases.
    sharedActors[0]!.dispose();
    expect(sharedModelTextures.size).toBe(before);
  });
});
