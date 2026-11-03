import { describe, expect, it, vi } from "vitest";
import { createEngineLoop } from "../../../packages/audio/src/game-sound/EngineLoop";
import { MusicControllerImpl } from "../../../packages/audio/src/game-sound/MusicController";
import { VoicePool, type VoiceAsset } from "../../../packages/audio/src/game-sound/Voice";
import { mulberry32 } from "../../../packages/audio/src/game-sound/rng";
import type { SoundNodeLike } from "../../../packages/audio/src/game-sound/types";
import { FakeContext, FakeNode, FakeSource } from "./fake-context";

const buffer = (): AudioBuffer => ({ duration: 1, length: 48_000, sampleRate: 48_000, numberOfChannels: 1 }) as AudioBuffer;
const tick = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("asset-aware game sound routing", () => {
  it("passes the selected full asset to the resolver for equal URLs with distinct identities", () => {
    const ctx = new FakeContext(), a = buffer(), b = buffer();
    const first = { url: "/audio/shared", hash: "first" }, second = { url: "/audio/shared", hash: "second" };
    const lookup = vi.fn((_url: string, asset?: VoiceAsset) => asset?.hash === "first" ? a : b);
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 8, bufferFor: lookup });
    const one = pool.allocate("one", { bus: "sfx", asset: first, cooldownMs: 0 }, new FakeNode("bus"));
    const two = pool.allocate("two", { bus: "sfx", asset: second, cooldownMs: 0 }, new FakeNode("bus"));
    expect(one.record?.source.buffer).toBe(a);
    expect(two.record?.source.buffer).toBe(b);
    expect(lookup.mock.calls).toEqual([[first.url, first], [second.url, second]]);
  });

  it("retains a selected variant and exact buffer through deferred allocation", () => {
    const ctx = new FakeContext(), chosenBuffer = buffer();
    const lookup = vi.fn(() => undefined);
    const pool = new VoicePool({ ctx, rng: mulberry32(42), voiceCap: 8, bufferFor: lookup });
    const spec = { bus: "sfx", cooldownMs: 0, asset: [{ url: "/a", hash: "a" }, { url: "/b", hash: "b" }] };
    const selectedAsset = pool.selectAsset("cue", spec);
    const result = pool.allocate("cue", spec, new FakeNode("bus"), { selectedAsset, buffer: chosenBuffer });
    expect(spec.asset).toContain(selectedAsset);
    expect(result.record?.source.buffer).toBe(chosenBuffer);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not allocate a silent source or consume cooldown for an unavailable asset", () => {
    const ctx = new FakeContext(), pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 1, bufferFor: () => undefined });
    const asset = { url: "/missing" }, spec = { bus: "sfx", asset, cooldownMs: 1_000 };
    expect(pool.allocate("cue", spec, new FakeNode("bus")).dropped).toBe(true);
    expect(ctx.ofKind("source")).toHaveLength(0);
    expect(pool.liveCount).toBe(0);
    expect(pool.allocate("cue", spec, new FakeNode("bus"), { selectedAsset: asset, buffer: buffer() }).dropped).toBe(false);
  });

  it("keeps URL-only buffer callbacks compatible", () => {
    const ctx = new FakeContext(), decoded = buffer();
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 1, bufferFor: (url) => url === "/a" ? decoded : undefined });
    expect(pool.allocate("cue", { bus: "sfx", asset: { url: "/a" } }, new FakeNode("bus")).record?.source.buffer).toBe(decoded);
  });

  it.each([
    { sha256: "a".repeat(64) },
    { sha256: "malformed" },
    { hash: "sha256-" + "b".repeat(64) },
    { hash: "  " + "b".repeat(64) + "  " },
    { sizeBytes: 100 },
    { integrity: "sha256-" + "c".repeat(64) },
    { request: { expectedUrl: "/verified" } },
    { request: { maxBytes: 100 } },
    { request: { headers: { Authorization: "synthetic" } } },
    { kind: "aura-asset-ref", type: "image" },
    { variantHashes: { m4a: "d".repeat(64) } }
  ])("requires a verified override for inline buffers with encoded proof %#", (proof) => {
    const ctx = new FakeContext(), inline = buffer(), verified = buffer(), lookup = vi.fn(() => buffer());
    const asset: VoiceAsset = { url: "/verified", buffer: inline, ...proof };
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 2, bufferFor: lookup });
    const spec = { bus: "sfx", asset, cooldownMs: 0 };
    expect(pool.allocate("cue", spec, new FakeNode("bus")).dropped).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
    expect(ctx.ofKind("source")).toHaveLength(0);
    expect(pool.allocate("cue", spec, new FakeNode("bus"), { selectedAsset: asset, buffer: verified }).record?.source.buffer).toBe(verified);
  });
});

describe("engine layer identity and lifetime", () => {
  it("starts each layer with the buffer for its actual asset, even when URLs match", () => {
    const ctx = new FakeContext(), a = buffer(), b = buffer();
    const first = { url: "/shared", hash: "first" }, second = { url: "/shared", hash: "second" };
    const lookup = vi.fn((_url: string, asset?: VoiceAsset) => asset?.hash === "first" ? a : b);
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 8, bufferFor: lookup });
    const startVoice = vi.fn((value: AudioBuffer | undefined, input: SoundNodeLike, _loop: true, asset?: VoiceAsset) => {
      if (!value || !asset) throw new Error("missing selected asset");
      const record = pool.allocate("engine", { bus: "sfx", asset, cooldownMs: 0, maxVoices: 8 }, input,
        { selectedAsset: asset, buffer: value, loop: true }).record;
      record?.source.start();
      return record;
    });
    const handle = createEngineLoop({ ctx, onLoad: [{ asset: first, rpm: 1_000 }, { asset: second, rpm: 3_000 }],
      idleRpm: 1_000, maxRpm: 3_000, busInput: new FakeNode("bus"), pool, bufferFor: lookup, startVoice });
    expect(startVoice.mock.calls.map((call) => [call[0], call[3]])).toEqual([[a, first], [b, second]]);
    expect(ctx.ofKind<FakeSource>("source").map((source) => source.buffer)).toEqual([a, b]);
    handle.stop();
  });

  it("defers a missing layer, applies current RPM/load on start, and stops it on cancellation", async () => {
    const ctx = new FakeContext(), loaded = deferred<AudioBuffer | undefined>(), asset = { url: "/engine", hash: "v1" };
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 8, bufferFor: () => undefined });
    let signal: AbortSignal | undefined;
    const startVoice = vi.fn((value: AudioBuffer | undefined, input: SoundNodeLike, _loop: true, chosen?: VoiceAsset) => {
      if (!value || !chosen) return undefined;
      const record = pool.allocate("engine", { bus: "sfx", asset: chosen, cooldownMs: 0 }, input,
        { selectedAsset: chosen, buffer: value, loop: true }).record;
      record?.source.start();
      return record;
    });
    const handle = createEngineLoop({ ctx, onLoad: [{ asset, rpm: 1_000 }], idleRpm: 1_000, maxRpm: 3_000,
      busInput: new FakeNode("bus"), pool, bufferFor: () => undefined,
      loadAsset: (_asset, nextSignal) => { signal = nextSignal; return loaded.promise; }, startVoice });
    handle.setRpm(1_400);
    handle.setLoad(1);
    expect(ctx.ofKind("source")).toHaveLength(0);
    loaded.resolve(buffer());
    await tick();
    expect(startVoice).toHaveBeenCalledTimes(1);
    expect(ctx.ofKind<FakeSource>("source")[0].playbackRate.value).toBeCloseTo(1.4, 4);
    handle.stop();
    expect(signal?.aborted).toBe(true);
  });

  it("never starts an engine layer after its pending handle is stopped", async () => {
    const ctx = new FakeContext(), loaded = deferred<AudioBuffer | undefined>(), startVoice = vi.fn();
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 4, bufferFor: () => undefined });
    let signal: AbortSignal | undefined;
    const handle = createEngineLoop({ ctx, onLoad: [{ asset: { url: "/late" }, rpm: 1_000 }], idleRpm: 1_000,
      maxRpm: 3_000, busInput: new FakeNode("bus"), pool, bufferFor: () => undefined,
      loadAsset: (_asset, nextSignal) => { signal = nextSignal; return loaded.promise; }, startVoice });
    handle.stop();
    expect(signal?.aborted).toBe(true);
    loaded.resolve(buffer());
    await tick();
    expect(startVoice).not.toHaveBeenCalled();
    expect(handle.ended).toBe(true);
  });

  it("sends an inline layer through the loader when inherited policy requires proof", async () => {
    const ctx = new FakeContext(), loaded = deferred<AudioBuffer | undefined>();
    const asset = { url: "/inline-engine", buffer: buffer() }, lookup = vi.fn(() => buffer()), startVoice = vi.fn();
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 4, bufferFor: lookup });
    let signal: AbortSignal | undefined;
    const loadAsset = vi.fn((_asset: VoiceAsset, nextSignal?: AbortSignal) => { signal = nextSignal; return loaded.promise; });
    const handle = createEngineLoop({ ctx, onLoad: [{ asset, rpm: 1_000 }], idleRpm: 1_000, maxRpm: 3_000,
      busInput: new FakeNode("bus"), pool, bufferFor: lookup, requiresBufferedAsset: () => true, loadAsset, startVoice });
    expect(loadAsset).toHaveBeenCalledWith(asset, expect.any(AbortSignal));
    expect(lookup).not.toHaveBeenCalled();
    expect(startVoice).not.toHaveBeenCalled();
    handle.stop();
    expect(signal?.aborted).toBe(true);
    loaded.resolve(buffer());
    await tick();
    expect(startVoice).not.toHaveBeenCalled();
  });

  it("releases earlier layers if a later layer fails while constructing the loop", () => {
    const ctx = new FakeContext(), decoded = buffer();
    const lookup = vi.fn((url: string) => { if (url === "/broken") throw new Error("lookup failed"); return decoded; });
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 4, bufferFor: lookup });
    const startVoice = (value: AudioBuffer | undefined, input: SoundNodeLike, _loop: true, asset?: VoiceAsset) => {
      if (!value || !asset) return undefined;
      const record = pool.allocate("engine", { bus: "sfx", asset, cooldownMs: 0 }, input,
        { selectedAsset: asset, buffer: value, loop: true }).record;
      record?.source.start();
      return record;
    };
    expect(() => createEngineLoop({ ctx, onLoad: [{ asset: { url: "/first" }, rpm: 1_000 },
      { asset: { url: "/broken" }, rpm: 2_000 }], idleRpm: 1_000, maxRpm: 3_000,
      busInput: new FakeNode("bus"), pool, bufferFor: lookup, startVoice })).toThrow("lookup failed");
    expect(pool.liveCount).toBe(0);
    expect(ctx.ofKind<FakeSource>("source")[0].stopped).toBe(1);
    expect(ctx.ofKind<FakeNode>("gain").every((node) => node.connectedTo.length === 0)).toBe(true);
  });

  it("disconnects the spatial graph when an engine loop is stopped", () => {
    const ctx = new FakeContext(), spatialInput = new FakeNode("spatial"), dispose = vi.fn();
    const spatial = { input: spatialInput, dispose, setPosition: vi.fn(), setVelocity: vi.fn(), setOcclusion: vi.fn(),
      occlusionFilter: new FakeNode("filter") } as unknown as import("../../../packages/audio/src/game-sound/SpatialVoice").SpatialNode;
    const pool = new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 2, bufferFor: () => undefined });
    const handle = createEngineLoop({ ctx, onLoad: [], idleRpm: 1_000, maxRpm: 3_000,
      busInput: new FakeNode("bus"), spatial, pool, bufferFor: () => undefined, startVoice: () => undefined });
    handle.stop();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("protected and multi-stem music", () => {
  it("resolves every same-URL stem by its own asset and starts on one shared timestamp", () => {
    const ctx = new FakeContext(), a = buffer(), b = buffer();
    ctx.currentTime = 2;
    const first = { url: "/shared", hash: "first" }, second = { url: "/shared", hash: "second" };
    const lookup = vi.fn((_url: string, asset?: VoiceAsset) => asset?.hash === "first" ? a : b);
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: { theme: { stems: [first, second] } }, bufferFor: lookup });
    music.play("theme", { crossfadeMs: 0 });
    const sources = ctx.ofKind<FakeSource>("source");
    expect(sources.map((source) => source.buffer)).toEqual([a, b]);
    expect(sources.map((source) => source.started[0].when)).toEqual([2.05, 2.05]);
    expect(lookup.mock.calls.map((call) => call[1]?.hash)).toEqual(["first", "second"]);
    music.dispose();
  });

  it.each([
    { url: "/song", hash: "sha256-example" },
    { url: "/song", sha256: "value" },
    { url: "/song", sizeBytes: 10 },
    { url: "/song", request: { headers: { Authorization: "synthetic" } } },
    { url: "/song", securityContext: "generation-1" },
    { url: "/song.{format}", variantHashes: { m4a: "value" } }
  ])("does not stream a protected stem %#", (asset) => {
    const ctx = new FakeContext(), media = vi.fn();
    ctx.createMediaElementSource = () => new FakeNode("media") as unknown as MediaElementAudioSourceNode;
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: { theme: { stems: [asset] } },
      bufferFor: () => undefined, createMediaElement: media });
    expect(() => music.play("theme")).toThrow(/verified decoded buffers/);
    expect(media).not.toHaveBeenCalled();
    expect(ctx.ofKind("source")).toHaveLength(0);
  });

  it("does not stream a plain asset when the engine requires inherited request policy", () => {
    const ctx = new FakeContext(), media = vi.fn();
    ctx.createMediaElementSource = () => new FakeNode("media") as unknown as MediaElementAudioSourceNode;
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: { theme: { stems: [{ url: "/plain" }] } },
      bufferFor: () => undefined, createMediaElement: media, requiresBufferedAsset: () => true });
    expect(() => music.play("theme")).toThrow(/verified decoded buffers/);
    expect(media).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not use an inline stem to bypass encoded or inherited policy (inherited=%s)", async (inherited) => {
    const ctx = new FakeContext(), inline = buffer(), loaded = deferred<AudioBuffer | undefined>(), lookup = vi.fn(() => buffer());
    const failures = vi.fn();
    const asset: VoiceAsset = inherited ? { url: "/song", buffer: inline } :
      { url: "/song", buffer: inline, sha256: "a".repeat(64) };
    const loadAsset = vi.fn((_asset: VoiceAsset) => loaded.promise);
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: { theme: { stems: [asset] } },
      bufferFor: lookup, loadAsset, requiresBufferedAsset: () => inherited, onLoadFailure: failures });
    music.play("theme");
    expect(loadAsset).toHaveBeenCalledWith(asset, expect.any(AbortSignal));
    expect(lookup).not.toHaveBeenCalled();
    expect(ctx.ofKind("source")).toHaveLength(0);
    loaded.resolve(undefined);
    await tick();
    expect(ctx.ofKind("source")).toHaveLength(0);
    expect(music.playing).toBeUndefined();
    expect(failures).toHaveBeenCalledTimes(1);
    music.dispose();
  });

  it("retains prototype-backed typed asset and request fields in the load snapshot", async () => {
    const ctx = new FakeContext(), media = vi.fn(), failures = vi.fn();
    const prototypeRequest = Object.create({ get expectedHash() { return "sha256-" + "a".repeat(64); } });
    const prototypeAsset = Object.create({
      get url() { return "/protected"; },
      get kind() { return "aura-asset-ref"; },
      get type() { return "image"; },
      get buffer() { return buffer(); },
      get request() { return prototypeRequest; }
    }) as VoiceAsset;
    const loadAsset = vi.fn(async (_asset: VoiceAsset) => undefined);
    ctx.createMediaElementSource = () => new FakeNode("media") as unknown as MediaElementAudioSourceNode;
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: { theme: { stems: [prototypeAsset] } },
      bufferFor: () => undefined, createMediaElement: media, loadAsset, onLoadFailure: failures });
    music.play("theme");
    expect(loadAsset.mock.calls[0][0]).toMatchObject({ url: "/protected", kind: "aura-asset-ref", type: "image",
      request: { expectedHash: "sha256-" + "a".repeat(64) } });
    expect(media).not.toHaveBeenCalled();
    await tick();
    expect(failures).toHaveBeenCalledTimes(1);
    expect(ctx.ofKind("source")).toHaveLength(0);
    music.dispose();
  });

  it("validates a typed single-stem asset before selecting the streaming route", async () => {
    const ctx = new FakeContext(), media = vi.fn(), loadAsset = vi.fn(async (_asset: VoiceAsset) => undefined);
    ctx.createMediaElementSource = () => new FakeNode("media") as unknown as MediaElementAudioSourceNode;
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: {
      theme: { stems: [{ url: "/not-audio", kind: "aura-asset-ref", type: "image" }] }
    }, bufferFor: () => undefined, createMediaElement: media, loadAsset });
    music.play("theme");
    expect(loadAsset).toHaveBeenCalledTimes(1);
    expect(media).not.toHaveBeenCalled();
    await tick();
    expect(ctx.ofKind("source")).toHaveLength(0);
    music.dispose();
  });

  it("snapshots every stem's headers before any resolver can mutate later stems", async () => {
    const ctx = new FakeContext(), headers = new Headers({ Authorization: "synthetic-original" });
    const loadAsset = vi.fn(async (_asset: VoiceAsset) => undefined);
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: {
      theme: { stems: [{ url: "/first" }, { url: "/second", request: { headers } }] }
    }, bufferFor: (url) => {
      if (url === "/first") headers.set("Authorization", "synthetic-changed");
      return undefined;
    }, loadAsset });
    music.play("theme");
    const secondRequest = loadAsset.mock.calls[1][0].request;
    expect(new Headers(secondRequest?.headers).get("Authorization")).toBe("synthetic-original");
    const inherited = { expectedHash: "sha256-" + "c".repeat(64), maxBytes: 256, credentials: "omit" };
    expect({ ...inherited, ...secondRequest }).toMatchObject(inherited);
    await tick();
    music.dispose();
  });

  it("defers protected music without a bufferless source and prevents late start after stop", async () => {
    const ctx = new FakeContext(), loaded = deferred<AudioBuffer | undefined>(), media = vi.fn();
    ctx.createMediaElementSource = () => new FakeNode("media") as unknown as MediaElementAudioSourceNode;
    let signal: AbortSignal | undefined;
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: { theme: { stems: [{ url: "/protected", hash: "v1" }] } },
      bufferFor: () => undefined, createMediaElement: media,
      loadAsset: (_asset, nextSignal) => { signal = nextSignal; return loaded.promise; } });
    music.play("theme");
    expect(music.playing).toBeUndefined();
    expect(ctx.ofKind("source")).toHaveLength(0);
    music.stop();
    expect(signal?.aborted).toBe(true);
    loaded.resolve(buffer());
    await tick();
    expect(ctx.ofKind("source")).toHaveLength(0);
    expect(media).not.toHaveBeenCalled();
  });

  it("keeps the old track until its replacement has decoded and ignores stale completions", async () => {
    const ctx = new FakeContext(), first = buffer(), next = deferred<AudioBuffer | undefined>(), later = deferred<AudioBuffer | undefined>();
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: {
      playing: { stems: [{ url: "/playing", buffer: first }] },
      next: { stems: [{ url: "/next", hash: "next" }] },
      later: { stems: [{ url: "/later", hash: "later" }] }
    }, bufferFor: () => undefined, loadAsset: (asset) => asset.url === "/next" ? next.promise : later.promise });
    music.play("playing", { crossfadeMs: 0 });
    const previous = ctx.ofKind<FakeSource>("source")[0];
    music.play("next", { crossfadeMs: 0 });
    music.play("later", { crossfadeMs: 0 });
    expect(music.playing).toBe("playing");
    next.resolve(buffer());
    await tick();
    expect(music.playing).toBe("playing");
    expect(previous.stopped).toBe(0);
    later.resolve(buffer());
    await tick();
    expect(music.playing).toBe("later");
    expect(ctx.ofKind<FakeSource>("source")).toHaveLength(2);
    music.dispose();
  });

  it("resets active, fading and pending tracks and can play again after the reset", async () => {
    const ctx = new FakeContext(), pending = deferred<AudioBuffer | undefined>();
    let signal: AbortSignal | undefined;
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: {
      first: { stems: [{ url: "/first", buffer: buffer() }] },
      second: { stems: [{ url: "/second", buffer: buffer() }] },
      pending: { stems: [{ url: "/pending", hash: "pending" }] },
      future: { stems: [{ url: "/future", buffer: buffer() }] }
    }, bufferFor: () => undefined, loadAsset: (_asset, nextSignal) => { signal = nextSignal; return pending.promise; } });
    music.play("first", { crossfadeMs: 0 });
    music.play("second", { crossfadeMs: 10_000 });
    music.play("pending");
    const [first, second] = ctx.ofKind<FakeSource>("source");
    expect([first.stopped, second.stopped]).toEqual([0, 0]);
    music.reset();
    expect([first.stopped, second.stopped]).toEqual([1, 1]);
    expect(signal?.aborted).toBe(true);
    expect(music.playing).toBeUndefined();
    pending.resolve(buffer());
    await tick();
    expect(ctx.ofKind("source")).toHaveLength(2);
    music.play("future", { crossfadeMs: 0 });
    expect(music.playing).toBe("future");
    expect(ctx.ofKind("source")).toHaveLength(3);
    music.dispose();
  });

  it("aborts sibling stem loads on failure and preserves the previous track", async () => {
    const ctx = new FakeContext(), failed = deferred<AudioBuffer | undefined>(), sibling = deferred<AudioBuffer | undefined>();
    const signals: AbortSignal[] = [], failures = vi.fn();
    const music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: {
      first: { stems: [{ url: "/first", buffer: buffer() }] },
      next: { stems: [{ url: "/failed" }, { url: "/sibling" }] }
    }, bufferFor: () => undefined, onLoadFailure: failures,
      loadAsset: (asset, signal) => { if (signal) signals.push(signal); return asset.url === "/failed" ? failed.promise : sibling.promise; } });
    music.play("first", { crossfadeMs: 0 });
    const first = ctx.ofKind<FakeSource>("source")[0];
    music.play("next");
    failed.resolve(undefined);
    await tick();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(failures).toHaveBeenCalledTimes(1);
    sibling.resolve(buffer());
    await tick();
    expect(music.playing).toBe("first");
    expect(first.stopped).toBe(0);
    expect(ctx.ofKind("source")).toHaveLength(1);
    music.dispose();
  });

  it("stops a partially started track if reset occurs during source start", () => {
    const ctx = new FakeContext();
    let music!: MusicControllerImpl;
    const createSource = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = createSource() as unknown as FakeSource;
      source.start = (when = 0) => { source.started.push({ when }); music.reset(); };
      return source as unknown as AudioBufferSourceNode;
    };
    music = new MusicControllerImpl({ ctx, output: new FakeNode("music"), tracks: {
      theme: { stems: [{ url: "/first", buffer: buffer() }, { url: "/second", buffer: buffer() }] }
    }, bufferFor: () => undefined });
    music.play("theme", { crossfadeMs: 0 });
    const sources = ctx.ofKind<FakeSource>("source");
    expect(sources).toHaveLength(1);
    expect(sources[0].stopped).toBe(1);
    expect(music.playing).toBeUndefined();
  });
});
