import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameSoundEngine, type GameSoundPlayHandle } from "../../../packages/audio/src/game-sound/GameSoundEngine";
import { FakeContext, type FakePanner, type FakeSource } from "./fake-context";

const abc = new TextEncoder().encode("abc");
const abcHash = "sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const buffer = (tag = 0): AudioBuffer => ({
  tag, duration: 1, length: 4, sampleRate: 4, numberOfChannels: 1
}) as unknown as AudioBuffer;
const response = (url: string, bytes: Uint8Array = abc): Response => ({
  ok: true, status: 200, url, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer
}) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush(): Promise<void> {
  for (let index = 0; index < 30; index++) await Promise.resolve();
}
async function started(handle: GameSoundPlayHandle | null): Promise<void> {
  expect(handle).not.toBeNull();
  if (handle?.started) expect(await handle.started).toBe(true);
}

afterEach(() => vi.unstubAllGlobals());

describe("native game-sound loading and policy isolation", () => {
  it("starts a supplied buffer immediately without probing or fetching", () => {
    const fetch = vi.fn();
    const probe = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const ctx = new FakeContext();
    const supplied = buffer();
    const engine = createGameSoundEngine({
      context: ctx,
      fetchProbe: probe,
      cues: { cue: { bus: "sfx", asset: { url: "/clip.{format}", hash: "catalog-placeholder", buffer: supplied } } }
    });
    const handle = engine.play("cue");
    expect(handle?.started).toBeUndefined();
    expect(ctx.ofKind<FakeSource>("source")[0].buffer).toBe(supplied);
    expect(ctx.ofKind<FakeSource>("source")[0].started).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("isolates the same URL by request headers and plays the corresponding decoded bytes", async () => {
    const ctx = new FakeContext();
    ctx.decodeAudioData = async (bytes) => buffer(new Uint8Array(bytes)[0]);
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const mode = new Headers(init?.headers).get("x-synthetic-mode");
      return response(String(url), new Uint8Array([mode === "alpha" ? 11 : 22]));
    });
    vi.stubGlobal("fetch", fetch);
    const common = { credentials: "omit" as const, sourceOrigin: "https://media.test" };
    const engine = createGameSoundEngine({ context: ctx, cues: {
      first: { bus: "sfx", asset: { url: "https://media.test/shared.wav", request: { ...common, headers: { "x-synthetic-mode": "alpha" } } } },
      second: { bus: "sfx", asset: { url: "https://media.test/shared.wav", request: { ...common, headers: { "x-synthetic-mode": "beta" } } } }
    } });
    const first = engine.play("first");
    const second = engine.play("second");
    await Promise.all([started(first), started(second)]);
    const tags = ctx.ofKind<FakeSource>("source").map((source) => (source.buffer as AudioBuffer & { tag: number }).tag);
    expect(tags.sort()).toEqual([11, 22]);
    expect(fetch).toHaveBeenCalledTimes(2);
    engine.dispose();
  });

  it("snapshots headers, origins and per-format integrity before a delayed probe", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const probeResult = deferred<ArrayBuffer>();
    const probe = vi.fn(() => probeResult.promise);
    const fetch = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => response(String(url)));
    vi.stubGlobal("fetch", fetch);
    const ctx = new FakeContext();
    const headers = new Headers({ "x-synthetic-mode": "before" });
    const allowedOrigins = ["https://media.test"];
    const variants = { "opus.webm": abcHash };
    const request = { headers, allowedOrigins, sourceOrigin: "https://media.test", credentials: "include" as const, securityContext: "snapshot-generation", expectedHash: abcHash };
    const engine = createGameSoundEngine({
      context: ctx, request, fetchProbe: probe,
      cues: { cue: { bus: "sfx", asset: { url: "https://media.test/clip.{format}", variantHashes: variants } } }
    });
    const handle = engine.play("cue");
    headers.set("x-synthetic-mode", "after");
    allowedOrigins[0] = "https://other.test";
    request.expectedHash = `sha256-${"0".repeat(64)}`;
    variants["opus.webm"] = `sha256-${"0".repeat(64)}`;
    probeResult.resolve(new ArrayBuffer(1));
    await started(handle);
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("x-synthetic-mode")).toBe("before");
    expect(String(fetch.mock.calls[0][0])).toBe("https://media.test/clip.opus.webm");
    expect(ctx.ofKind<FakeSource>("source")[0].started).toHaveLength(1);
    engine.dispose();
  });

  it("rejects missing variant proofs and unprovable inline content without fetching", async () => {
    const fetch = vi.fn();
    const probe = vi.fn(async () => new ArrayBuffer(1));
    vi.stubGlobal("fetch", fetch);
    const engine = createGameSoundEngine({ context: new FakeContext(), fetchProbe: probe, cues: {
      missing: { bus: "sfx", asset: { url: "/clip.{format}", sha256: abcHash } },
      wrongVariant: { bus: "sfx", asset: { url: "/other.{format}", variantHashes: { m4a: abcHash } } },
      inline: { bus: "sfx", asset: { url: "/inline.{format}", sha256: abcHash, buffer: buffer() } }
    } });
    const missing = engine.play("missing");
    const wrongVariant = engine.play("wrongVariant");
    const inline = engine.play("inline");
    expect(await missing?.started).toBe(false);
    expect(await wrongVariant?.started).toBe(false);
    expect(await inline?.started).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(engine.proof().errors.length).toBeGreaterThan(0);
    engine.dispose();
  });

  it("does not play a supplied buffer when its request signal is already aborted", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const abort = new AbortController();
    abort.abort();
    const ctx = new FakeContext();
    const engine = createGameSoundEngine({ context: ctx, cues: {
      cue: { bus: "sfx", asset: { url: "/inline.wav", buffer: buffer(), request: { signal: abort.signal } } }
    } });
    expect(await engine.play("cue")?.started).toBe(false);
    expect(ctx.ofKind<FakeSource>("source")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("preserves inherited transport limits when a local request field is undefined", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) => response(String(url)));
    vi.stubGlobal("fetch", fetch);
    const ctx = new FakeContext();
    const decode = vi.fn(async () => buffer());
    ctx.decodeAudioData = decode;
    const engine = createGameSoundEngine({ context: ctx, request: { credentials: "omit", maxBytes: 2 }, cues: {
      cue: { bus: "sfx", asset: { url: "https://media.test/size.wav", request: { maxBytes: undefined, credentials: undefined } } }
    } });
    expect(await engine.play("cue")?.started).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
    expect(ctx.ofKind<FakeSource>("source")).toHaveLength(0);
    engine.dispose();
  });

  it("retains foreign header entries and typed asset getters when snapshotting", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => response(String(url)));
    vi.stubGlobal("fetch", fetch);
    let headerValue = "original";
    const foreign = { forEach(callback: (value: string, key: string) => void) { callback(headerValue, "x-synthetic-mode"); } } as unknown as Headers;
    class TypedAsset {
      get kind() { return "aura-asset-ref"; }
      get type() { return "audio"; }
      get url() { return "https://media.test/typed.wav"; }
      get request() { return { credentials: "omit" as const, sourceOrigin: "https://media.test", headers: foreign }; }
    }
    const engine = createGameSoundEngine({ context: new FakeContext(), cues: {
      cue: { bus: "sfx", asset: new TypedAsset() }
    } });
    headerValue = "mutated";
    await started(engine.play("cue"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("x-synthetic-mode")).toBe("original");
    engine.dispose();
  });

  it("does not leak transport details, URL values or arbitrary exceptions into bounded diagnostics", async () => {
    const fetch = vi.fn(async () => { throw new Error("synthetic-private-exception"); });
    vi.stubGlobal("fetch", fetch);
    const cues = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [
      `cue${index}`, { bus: "sfx" as const, asset: { url: `https://media.test/${index}.wav?key=synthetic-query#synthetic-fragment` } }
    ]));
    const engine = createGameSoundEngine({ context: new FakeContext(), request: { credentials: "omit" }, cues });
    const handle = engine.play("cue0");
    expect(await handle?.started).toBe(false);
    await flush();
    const errors = engine.proof().errors;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.length).toBeLessThanOrEqual(32);
    expect(errors.every((entry) => /^AUDIO_[A-Z_]+$/.test(entry))).toBe(true);
    expect(JSON.stringify(errors)).not.toMatch(/synthetic|https|media\.test/);
    engine.dispose();
  });

  it("rejects a digest mismatch before decode and retries after a transport failure", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const decode = vi.fn(async () => buffer());
    const ctx = new FakeContext();
    ctx.decodeAudioData = decode;
    let attempt = 0;
    const fetch = vi.fn(async (url: RequestInfo | URL) => {
      attempt++;
      if (String(url).includes("retry") && attempt === 1) throw new Error("synthetic-failure");
      return response(String(url), String(url).includes("bad") ? new Uint8Array([7]) : abc);
    });
    vi.stubGlobal("fetch", fetch);
    const retry = createGameSoundEngine({ context: ctx, request: { credentials: "omit" }, cues: {
      cue: { bus: "sfx", asset: { url: "https://media.test/retry.wav", sha256: abcHash } }
    } });
    expect(await retry.play("cue")?.started).toBe(false);
    await started(retry.play("cue"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenCalledTimes(1);
    retry.dispose();
    decode.mockClear();
    const bad = createGameSoundEngine({ context: ctx, request: { credentials: "omit" }, cues: {
      cue: { bus: "sfx", asset: { url: "https://media.test/bad.wav", sha256: abcHash } }
    } });
    expect(await bad.play("cue")?.started).toBe(false);
    expect(decode).not.toHaveBeenCalled();
    expect(bad.proof().errors).toContain("AUDIO_ASSET_LOAD_FAILED");
    bad.dispose();
  });

  it("cancels one pending play without cancelling a second subscriber", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetch);
    const ctx = new FakeContext();
    const engine = createGameSoundEngine({ context: ctx, request: { credentials: "omit" }, cues: {
      first: { bus: "sfx", asset: { url: "https://media.test/shared.wav" } },
      second: { bus: "sfx", asset: { url: "https://media.test/shared.wav" } }
    } });
    const first = engine.play("first");
    const second = engine.play("second");
    expect(first?.started).toBeDefined();
    first?.stop();
    expect(await first?.started).toBe(false);
    pending.resolve(response("https://media.test/shared.wav"));
    await started(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ctx.ofKind<FakeSource>("source")).toHaveLength(1);
    engine.dispose();
  });

  it.each(["dispose", "generation"] as const)("suppresses late playback after %s", async (action) => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const ctx = new FakeContext();
    const engine = createGameSoundEngine({ context: ctx, request: { credentials: "omit" }, cues: {
      cue: { bus: "sfx", asset: { url: "https://media.test/late.wav" } }
    } });
    const handle = engine.play("cue");
    if (action === "dispose") engine.dispose();
    else engine.setSecurityContext("new-generation");
    expect(await handle?.started).toBe(false);
    pending.resolve(response("https://media.test/late.wav"));
    await flush();
    expect(ctx.ofKind<FakeSource>("source")).toHaveLength(0);
    expect(engine.proof().errors).toEqual([]);
    engine.dispose();
  });

  it("suppresses a late format probe after disposal before decode or asset fetch", async () => {
    const probe = deferred<ArrayBuffer>();
    const fetchProbe = vi.fn(() => probe.promise);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const ctx = new FakeContext();
    const decode = vi.fn(async () => buffer());
    ctx.decodeAudioData = decode;
    const engine = createGameSoundEngine({ context: ctx, fetchProbe, probeBase: "/synthetic-probe/", cues: {
      cue: { bus: "sfx", asset: { url: "/clip.{format}" } }
    } });
    const handle = engine.play("cue");
    expect(fetchProbe).toHaveBeenCalledTimes(1);
    engine.dispose();
    expect(await handle?.started).toBe(false);
    probe.resolve(new ArrayBuffer(1));
    await flush();
    expect(fetchProbe).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(ctx.ofKind<FakeSource>("source")).toHaveLength(0);
  });

  it("does not reuse ambient-credential loads until a security generation is supplied", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) => response(String(url)));
    vi.stubGlobal("fetch", fetch);
    const ctx = new FakeContext();
    const engine = createGameSoundEngine({ context: ctx, cues: {
      cue: { bus: "sfx", cooldownMs: 0, asset: { url: "https://media.test/ambient.wav" } }
    } });
    const first = engine.play("cue");
    await started(first);
    first?.stop();
    const second = engine.play("cue");
    await started(second);
    second?.stop();
    expect(fetch).toHaveBeenCalledTimes(3); // eager warm plus two independent plays
    engine.setSecurityContext("generation-a");
    const third = engine.play("cue");
    await started(third);
    third?.stop();
    const cached = engine.play("cue");
    expect(cached?.started).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(4);
    engine.setSecurityContext("generation-b");
    await started(engine.play("cue"));
    expect(fetch).toHaveBeenCalledTimes(5);
    engine.dispose();
  });

  it("retains pending loop controls and cancels a loop stopped before its buffer arrives", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const ctx = new FakeContext();
    const engine = createGameSoundEngine({ context: ctx, request: { credentials: "omit" }, cues: {
      first: { bus: "sfx", spatial: true, asset: { url: "https://media.test/loop.wav" } },
      second: { bus: "sfx", spatial: true, asset: { url: "https://media.test/loop.wav" } }
    } });
    const first = engine.loop("first");
    const second = engine.loop("second");
    first?.stop();
    second?.setRate(1.5);
    second?.setGain(-6);
    second?.setPosition([3, 0, 0]);
    expect(await first?.started).toBe(false);
    pending.resolve(response("https://media.test/loop.wav"));
    expect(await second?.started).toBe(true);
    const [source] = ctx.ofKind<FakeSource>("source");
    expect(source.loop).toBe(true);
    expect(source.playbackRate.value).toBe(1.5);
    expect(ctx.ofKind<FakePanner>("panner")[0].positionX.value).toBe(3);
    engine.dispose();
  });
});
