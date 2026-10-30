/**
 * GU47 E-H (WP-8) item 8: `production-runtime/GlbResourceCache.ts`, the GLB
 * resource cache across `app.setScene`. `setScene` disposes every typed GLB
 * actor before the next scene mounts; with the cache on, the next actor of the
 * same asset loads with 0 GLB fetches. The class is bounded (entries, bytes,
 * least recently kept first) and disposes each kept entry exactly once.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GLB_RESOURCE_CACHE_DEFAULTS,
  GlbResourceCache,
  clearGlbResourceCache,
  configureGlbResourceCache,
  estimateGlbResourceBytes,
  glbResourceCache,
  glbResourceCacheKey,
  glbResourceCacheSnapshot
} from "../../../../packages/engine/src/production-runtime/GlbResourceCache";
import { createTypedGLBActor, type TypedGLBActor } from "../../../../packages/engine/src/production-runtime/TypedGLBActor";

function entry(bytes: number, log: string[], name: string, uncompressed = true) {
  return { bytes, uncompressed, dispose: () => { log.push(name); } };
}

describe("GlbResourceCache (class)", () => {
  it("keeps one entry per key, consumes and releases exactly once", () => {
    const log: string[] = [];
    const cache = new GlbResourceCache({ maxEntries: 4, maxBytes: 1000 });
    expect(cache.keep("a", entry(10, log, "a1"))).toBe(true);
    expect(cache.keep("a", entry(10, log, "a2"))).toBe(false); // already kept: the caller disposes a2
    expect(cache.peek("a")?.bytes).toBe(10);
    expect(cache.noteLoad("a")).toBe(true);
    expect(cache.noteLoad("b")).toBe(false);
    expect(cache.consume("a")).toBe(true);
    expect(cache.consume("a")).toBe(false);
    expect(log).toEqual(["a1"]);
    expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0, hits: 1, misses: 1, kept: 1, evicted: 0 });
  });

  it("evicts the least recently kept entries to stay inside maxEntries and maxBytes", () => {
    const log: string[] = [];
    const cache = new GlbResourceCache({ maxEntries: 2, maxBytes: 100 });
    cache.keep("a", entry(10, log, "a"));
    cache.keep("b", entry(10, log, "b"));
    cache.keep("c", entry(10, log, "c")); // entries bound: a goes
    expect(log).toEqual(["a"]);
    cache.keep("d", entry(85, log, "d")); // bytes bound (10 + 10 + 85 > 100): b goes, c + d = 95 fit
    expect(log).toEqual(["a", "b"]);
    expect(cache.snapshot().keys).toEqual(["c", "d"]);
    expect(cache.keep("huge", entry(101, log, "huge"))).toBe(false); // alone over the byte bound: declined
    expect(cache.snapshot()).toMatchObject({ entries: 2, bytes: 95, evicted: 2 });
  });

  it("configure shrinks at once; maxEntries 0 turns it off; clear disposes everything", () => {
    const log: string[] = [];
    const cache = new GlbResourceCache({ maxEntries: 3, maxBytes: 1000 });
    cache.keep("a", entry(1, log, "a"));
    cache.keep("b", entry(1, log, "b"));
    cache.configure({ maxEntries: 1 });
    expect(log).toEqual(["a"]);
    cache.configure({ maxEntries: 0 });
    expect(log).toEqual(["a", "b"]);
    expect(cache.enabled).toBe(false);
    expect(cache.keep("c", entry(1, log, "c"))).toBe(false);
    cache.configure({ maxEntries: 2 });
    cache.keep("d", entry(1, log, "d"));
    cache.clear();
    expect(log).toEqual(["a", "b", "d"]);
    expect(cache.snapshot().bytes).toBe(0);
  });

  it("keys by content hash, URL and decode options by value; sizes from the manifest or an estimate", () => {
    const base = { asset: { url: "/a.glb", hash: "sha256-abc" } };
    // The renderer builds a fresh `decoders` object per mount: equal values must give equal keys.
    expect(glbResourceCacheKey({ ...base, decoders: {} })).toBe(glbResourceCacheKey({ ...base, decoders: {} }));
    expect(glbResourceCacheKey({ ...base, decoders: { basePath: "/d/", workerCount: 2 } }))
      .toBe(glbResourceCacheKey({ ...base, decoders: { workerCount: 2, basePath: "/d/" } }));
    expect(glbResourceCacheKey({ ...base, decoders: { draco: false } })).not.toBe(glbResourceCacheKey({ ...base, decoders: {} }));
    expect(glbResourceCacheKey({ ...base, maxTextureSize: 1024 })).not.toBe(glbResourceCacheKey(base));
    expect(glbResourceCacheKey({ asset: { url: "/a.glb" } })).not.toBe(glbResourceCacheKey(base));
    // A function-valued decoder is keyed by identity.
    const decodeA = () => undefined;
    expect(glbResourceCacheKey({ ...base, imageDecoder: decodeA })).toBe(glbResourceCacheKey({ ...base, imageDecoder: decodeA }));
    expect(glbResourceCacheKey({ ...base, imageDecoder: decodeA })).not.toBe(glbResourceCacheKey({ ...base, imageDecoder: () => undefined }));
    expect(estimateGlbResourceBytes(1234, { vertexCount: 1, indexCount: 1, imageCount: 1 })).toBe(1234);
    expect(estimateGlbResourceBytes(undefined, { vertexCount: 10, indexCount: 30, imageCount: 1 })).toBe(10 * 48 + 30 * 4 + 4 * 1024 * 1024);
    expect(estimateGlbResourceBytes(undefined, undefined)).toBe(0);
  });
});

const GLB_BYTES = new Uint8Array(readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb"));
const nativeFetch = globalThis.fetch;
let fetches: string[] = [];

describe("GLB resource cache across a scene swap (typed GLB actors)", () => {
  beforeEach(() => {
    fetches = [];
    globalThis.fetch = (async (input: unknown) => {
      fetches.push(String(input));
      return new Response(new Uint8Array(GLB_BYTES), { status: 200 });
    }) as unknown as typeof fetch;
    clearGlbResourceCache();
    glbResourceCache.resetStats();
  });
  afterEach(() => {
    globalThis.fetch = nativeFetch;
    clearGlbResourceCache();
    configureGlbResourceCache(GLB_RESOURCE_CACHE_DEFAULTS);
  });

  it("is on by default with the documented bounds", () => {
    expect(glbResourceCache.enabled).toBe(true);
    expect(glbResourceCacheSnapshot()).toMatchObject({
      maxEntries: GLB_RESOURCE_CACHE_DEFAULTS.maxEntries,
      maxBytes: GLB_RESOURCE_CACHE_DEFAULTS.maxBytes
    });
  });

  let serial = 0;
  function asset(name: string) {
    serial += 1;
    return { url: `https://assets.invalid/gu47-eh/${name}-${serial}.glb`, type: "model", format: "glb", hash: `sha256-${name}-${serial}`, sizeBytes: GLB_BYTES.byteLength } as const;
  }
  const load = (a: ReturnType<typeof asset>, id: string, extra: Record<string, unknown> = {}): Promise<TypedGLBActor> =>
    createTypedGLBActor({ asset: a, id, width: 64, height: 64, ...extra });

  it("with the cache on, the second scene's actors of the same asset make 0 GLB fetches", async () => {
    configureGlbResourceCache(GLB_RESOURCE_CACHE_DEFAULTS);
    const car = asset("car");
    // Scene 1: two actors of one asset share one fetch (parse cache).
    const first = await Promise.all([load(car, "car-a"), load(car, "car-b")]);
    expect(fetches.filter((url) => url === car.url)).toHaveLength(1);
    // setScene: every actor of scene 1 is disposed; one parse lease is kept, while every
    // actor's render resources are freed at once as before.
    const geometries = first.flatMap((actor) => [...actor.pipeline.resources.geometryLibrary.values()]);
    for (const actor of first) actor.dispose();
    expect(glbResourceCacheSnapshot()).toMatchObject({ entries: 1, kept: 1 });
    expect(geometries.every((geometry) => (geometry as unknown as { vertexBuffer: { disposed: boolean } }).vertexBuffer.disposed)).toBe(true);
    expect(first[0]!.pipeline.asset.disposed).toBe(false);
    // Scene 2 mounts the same asset: no fetch at all.
    const second = await Promise.all([load(car, "car-a"), load(car, "car-b")]);
    expect(fetches.filter((url) => url === car.url)).toHaveLength(1);
    expect(second.every((actor) => actor.collectRenderItems().length === 5)).toBe(true);
    // The kept copy is handed back once a live actor holds the asset.
    expect(glbResourceCacheSnapshot()).toMatchObject({ entries: 0, hits: 2 });
    for (const actor of second) actor.dispose();
    second[0]!.dispose(); // a second dispose is a no-op
    expect(glbResourceCacheSnapshot().entries).toBe(1);
  });

  it("skips the decoder pre-scan fetch for a kept uncompressed GLB loaded with assets.decoders", async () => {
    configureGlbResourceCache(GLB_RESOURCE_CACHE_DEFAULTS);
    const prop = asset("prop");
    const first = await load(prop, "prop", { decoders: {} });
    const coldFetches = fetches.filter((url) => url === prop.url).length;
    expect(coldFetches).toBeGreaterThanOrEqual(1);
    first.dispose();
    const second = await load(prop, "prop", { decoders: {} });
    expect(fetches.filter((url) => url === prop.url).length).toBe(coldFetches);
    second.dispose();
  });

  it("is bounded: an evicted asset is fetched again", async () => {
    configureGlbResourceCache({ maxEntries: 1, maxBytes: GLB_RESOURCE_CACHE_DEFAULTS.maxBytes });
    const a = asset("crate");
    const b = asset("barrel");
    (await load(a, "crate")).dispose();
    (await load(b, "barrel")).dispose(); // keeps barrel, evicts crate
    expect(glbResourceCacheSnapshot()).toMatchObject({ entries: 1, evicted: 1 });
    (await load(a, "crate")).dispose();
    expect(fetches.filter((url) => url === a.url)).toHaveLength(2);
  });

  it("off (maxEntries 0): a remount fetches again", async () => {
    configureGlbResourceCache({ maxEntries: 0 });
    const tree = asset("tree");
    (await load(tree, "tree")).dispose();
    expect(glbResourceCacheSnapshot().entries).toBe(0);
    (await load(tree, "tree")).dispose();
    expect(fetches.filter((url) => url === tree.url)).toHaveLength(2);
  });
});
