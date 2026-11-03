import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack.js";
import { compileClip, type CompiledClip } from "../../../packages/animation/src/pose/CompiledClip.js";
import { bindSkeleton } from "../../../packages/animation/src/pose/SkeletonBinding.js";
import { AURA3D_RETARGET_ENGINE_VERSION, retargetCacheKey, retargetClipsHash, retargetSkeletonHash } from "../../../packages/animation/src/pose/RetargetCache.js";
import type { BakeRetargetedClipsOptions } from "../../../packages/animation/src/pose/Retarget.js";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime.js";
import { Scene } from "../../../packages/scene/src/Scene.js";

// Authored locally for this test: a one-joint rig, two keys, and one marker.
function fixture(payload: unknown = { value: "first" }): Map<string, CompiledClip> {
  const clip = new AnimationClip({
    name: "Walk", duration: 1,
    tracks: [new AnimationTrack({ target: "Hips.translation", valueType: "vector3", keyframes: [
      { time: 0, value: [0, 0, 0], interpolation: "cubicspline", outTangent: [0.1, 0, 0] },
      { time: 1, value: [1.0000000000001, 0, 0], inTangent: [0.2, 0, 0] }
    ] })],
    events: [{ name: "step", time: 0.5, payload }]
  });
  return new Map([[clip.name, compileClip(clip)]]);
}

function skeleton() {
  return bindSkeleton({
    joints: [0], jointNames: ["Hips"], parentIndices: [-1],
    resolveNode: () => ({ name: "Hips", position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })
  });
}

function bakeMap(): NonNullable<BakeRetargetedClipsOptions["map"]> {
  return {
    sourceRigId: "source", targetRigId: "target", ok: true, coverage: 1, requiredCoverage: 1,
    bindings: { hips: { bone: "hips", source: { name: "Hips" }, target: { name: "Hips" }, scale: 1 } }, diagnostics: []
  };
}

function fakeIndexedDb(delayFirstOpen = false) {
  const data = new Map<string, unknown>();
  const keys: string[] = [];
  let opens = 0;
  let resumeFirstOpen: (() => void) | undefined;
  const indexedDB = {
    open() {
      opens++;
      const request: { result?: unknown; onsuccess?: () => void } = {};
      request.result = {
        close() {},
        transaction() {
          const transaction: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
            objectStore: () => ({
              get(key: string) {
                const get: { result?: unknown; onsuccess?: () => void } = { result: data.has(key) ? structuredClone(data.get(key)) : undefined };
                queueMicrotask(() => get.onsuccess?.());
                return get;
              },
              put(value: unknown, key: string) {
                keys.push(key);
                data.set(key, structuredClone(value));
                queueMicrotask(() => transaction.oncomplete?.());
              }
            })
          };
          return transaction;
        }
      };
      if (delayFirstOpen && opens === 1) resumeFirstOpen = () => request.onsuccess?.();
      else queueMicrotask(() => request.onsuccess?.());
      return request;
    }
  };
  return { indexedDB, data, keys, get opens() { return opens; }, releaseFirstOpen() { resumeFirstOpen?.(); } };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

afterEach(() => vi.unstubAllGlobals());

describe("retarget cache identity", () => {
  it("uses the versioned SHA-256 namespace and matches an independent digest", () => {
    expect(AURA3D_RETARGET_ENGINE_VERSION).toBe("prd06-retarget/v2");
    expect(retargetClipsHash(new Map())).toBe(createHash("sha256").update("map:1:0").digest("hex"));
    const key = retargetCacheKey("v1", "source", "target", { hipsScale: 2 });
    expect(key).toMatch(/^prd06-retarget\/v2\|[a-f0-9]{64}$/);
    expect(key).not.toContain("source");
    expect(retargetCacheKey("a|b", "c", "d")).not.toBe(retargetCacheKey("a", "b|c", "d"));
  });

  it("matches an independent SHA-256 implementation across multiple input blocks", () => {
    const version = "version-".repeat(40);
    const frame = (tag: string, value: Buffer = Buffer.alloc(0)) => Buffer.concat([Buffer.from(`${tag}:${value.length}:`), value]);
    const text = (value: string) => {
      const result = Buffer.alloc(value.length * 2);
      for (let i = 0; i < value.length; i++) result.writeUInt16BE(value.charCodeAt(i), i * 2);
      return result;
    };
    const length = Buffer.alloc(8);
    length.writeDoubleBE(4);
    const bytes = Buffer.concat([
      frame("array", Buffer.from("5")),
      frame("key", text("0")), frame("string", text(version)),
      frame("key", text("1")), frame("string", text("source")),
      frame("key", text("2")), frame("string", text("target")),
      frame("key", text("3")), frame("object", Buffer.from("0")),
      frame("key", text("length")), frame("number", length)
    ]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(retargetCacheKey(version, "source", "target")).toBe(`${AURA3D_RETARGET_ENGINE_VERSION}|${digest}`);
  });

  it("changes for all compiled samples, precision sidecars, modes, tangents, flags, events and payloads", () => {
    const base = fixture();
    const original = retargetClipsHash(base);
    const mutate = (edit: (clip: CompiledClip) => void): string => {
      const changed = structuredClone(base);
      edit(changed.get("Walk")!);
      return retargetClipsHash(changed);
    };
    expect(retargetClipsHash(structuredClone(base))).toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.values[3] += 0.01; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.times[1] -= 0.1; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.exactTimes![1] -= 0.00000001; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.exactValues![3] += 1e-12; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.interpolation[0] = 3; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.outTangents![0] += 0.01; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.exactInTangents![3] += 1e-12; })).not.toBe(original);
    expect(mutate((clip) => { clip.tracks[0]!.authoredKeyframeFlags![0] ^= 1; })).not.toBe(original);
    expect(mutate((clip) => { (clip.events![0]!.payload as { value: string }).value = "second"; })).not.toBe(original);
    expect(mutate((clip) => { (clip.events![0] as { time: number }).time = 0.6; })).not.toBe(original);
    expect(retargetClipsHash(fixture({ value: "\ud800" }))).not.toBe(retargetClipsHash(fixture({ value: "\ud801" })));
  });

  it("distinguishes exact skeleton rests, node identity, mappings and all bake options", () => {
    const original = skeleton();
    const changed = skeleton();
    changed.restPose.positions[0] = 0.000001;
    expect(retargetSkeletonHash(changed)).not.toBe(retargetSkeletonHash(original));
    const differentIndices = { ...original, jointNodeIndices: [42] };
    expect(retargetSkeletonHash(differentIndices)).not.toBe(retargetSkeletonHash(original));
    const remapped = { ...original, jointIndicesByName: new Map([["Hips", [1]]]) };
    expect(retargetSkeletonHash(remapped)).not.toBe(retargetSkeletonHash(original));
    const base = retargetCacheKey("engine", "source", "target", { map: bakeMap(), hipsScale: 1 });
    for (const options of [
      { map: bakeMap(), hipsScale: 2 },
      { map: bakeMap(), hipsScale: 1, fingers: true },
      { map: bakeMap(), hipsScale: 1, retarget: { requireToes: true } },
      { map: { ...bakeMap(), sourceFacingAxis: "x" as const }, hipsScale: 1 }
    ]) expect(retargetCacheKey("engine", "source", "target", options)).not.toBe(base);
  });

  it("rejects unsafe data instead of collapsing identities or evaluating accessors", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const shared = {};
    let reads = 0;
    const accessor = { get secret() { reads++; return 1; } };
    const buffer = new ArrayBuffer(4);
    const unsupported = [() => 1, Symbol("payload"), cyclic, { first: shared, second: shared }, accessor,
      new Date(), { first: new Uint8Array(buffer), second: new Uint8Array(buffer) }];
    for (const payload of unsupported) expect(() => retargetClipsHash(fixture(payload))).toThrow(/Retarget cache identity/);
    expect(reads).toBe(0);
    expect(() => retargetCacheKey("e", "s", "t", { hipsScale: () => 1 } as unknown as BakeRetargetedClipsOptions)).toThrow();
  });

  it("includes a marker view's offset and complete observable backing buffer", () => {
    const first = new Uint8Array([7, 1, 2, 8]);
    const differentOutside = new Uint8Array([9, 1, 2, 8]);
    const differentOffset = new Uint8Array([1, 2, 7, 8]);
    expect(retargetClipsHash(fixture(first.subarray(1, 3))))
      .not.toBe(retargetClipsHash(fixture(differentOutside.subarray(1, 3))));
    expect(retargetClipsHash(fixture(first.subarray(1, 3))))
      .not.toBe(retargetClipsHash(fixture(differentOffset.subarray(0, 2))));
  });

  it("uses distinct cache entries for bake options, then reuses the matching baked markers", async () => {
    const cache = fakeIndexedDb();
    vi.stubGlobal("indexedDB", cache.indexedDB);
    const scene = new Scene();
    scene.root.addChild(scene.createNode("Hips"));
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    const source = { skeleton: skeleton(), clips: fixture() };
    const options = { map: bakeMap(), worker: false, hipsScale: 1 } as const;
    await runtime.addClipsFrom(source, options);
    await flushMicrotasks();
    expect(cache.keys).toHaveLength(1);
    const first = runtime.compiledClips().get("Walk")!;
    expect(first.events?.[0]).toMatchObject({ name: "step", payload: { value: "first" } });
    await runtime.addClipsFrom(source, { ...options, hipsScale: 2 });
    await flushMicrotasks();
    expect(cache.keys).toHaveLength(2);
    expect(cache.keys[0]).not.toBe(cache.keys[1]);
    const second = runtime.compiledClips().get("Walk")!;
    expect(second.tracks.find((track) => track.target === "Hips.translation")!.values[3]).toBeCloseTo(2);
    await runtime.addClipsFrom(source, options);
    await flushMicrotasks();
    expect(cache.keys).toHaveLength(2);
    expect(runtime.compiledClips().get("Walk")!.tracks.find((track) => track.target === "Hips.translation")!.values[3]).toBeCloseTo(1);
    runtime.dispose();
  });

  it("bypasses IndexedDB and still bakes when a marker or option cannot be cloned safely", async () => {
    const cache = fakeIndexedDb();
    vi.stubGlobal("indexedDB", cache.indexedDB);
    const scene = new Scene();
    scene.root.addChild(scene.createNode("Hips"));
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    const callback = () => "payload";
    await runtime.addClipsFrom({ skeleton: skeleton(), clips: fixture(callback) }, { map: bakeMap(), worker: false });
    expect(runtime.compiledClips().get("Walk")!.events?.[0]?.payload).toBe(callback);
    const mapWithFunction = { ...bakeMap(), extra: callback };
    await runtime.addClipsFrom({ skeleton: skeleton(), clips: fixture() }, { map: mapWithFunction, worker: false });
    await flushMicrotasks();
    expect(cache.opens).toBe(0);
    expect(cache.keys).toEqual([]);
    runtime.dispose();
  });

  it("binds a cache lookup and write to an immutable input snapshot despite concurrent edits", async () => {
    const cache = fakeIndexedDb(true);
    vi.stubGlobal("indexedDB", cache.indexedDB);
    const scene = new Scene();
    scene.root.addChild(scene.createNode("Hips"));
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    const payload = { value: "first" };
    const source = { skeleton: skeleton(), clips: fixture(payload) };
    const options = { map: bakeMap(), worker: false, hipsScale: 1 };
    const pending = runtime.addClipsFrom(source, options);
    source.clips.get("Walk")!.tracks[0]!.values[3] = 0.5;
    options.hipsScale = 3;
    payload.value = "changed";
    cache.releaseFirstOpen();
    await pending;
    await flushMicrotasks();
    const first = runtime.compiledClips().get("Walk")!;
    expect(first.tracks.find((track) => track.target === "Hips.translation")!.values[3]).toBeCloseTo(1);
    expect(first.events?.[0]?.payload).toBe(payload);
    expect(cache.keys).toHaveLength(1);
    const cached = cache.data.get(cache.keys[0]!) as Map<string, CompiledClip>;
    expect(cached.get("Walk")!.events?.[0]?.payload).toEqual({ value: "first" });
    await runtime.addClipsFrom(source, options);
    await flushMicrotasks();
    expect(cache.keys).toHaveLength(2);
    expect(cache.keys[1]).not.toBe(cache.keys[0]);
    expect(runtime.compiledClips().get("Walk")!.tracks.find((track) => track.target === "Hips.translation")!.values[3]).toBeCloseTo(1.5);
    runtime.dispose();
  });

  it("bakes without opening a cache when structuredClone is unavailable", async () => {
    const cache = fakeIndexedDb();
    vi.stubGlobal("indexedDB", cache.indexedDB);
    vi.stubGlobal("structuredClone", undefined);
    const scene = new Scene();
    scene.root.addChild(scene.createNode("Hips"));
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });
    await runtime.addClipsFrom({ skeleton: skeleton(), clips: fixture() }, { map: bakeMap(), worker: false });
    expect(runtime.compiledClips().get("Walk")!.events?.[0]?.name).toBe("step");
    expect(cache.opens).toBe(0);
    runtime.dispose();
  });
});
