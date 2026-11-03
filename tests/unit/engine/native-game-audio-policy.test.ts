import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioClip, type AudioAssetRef } from "@aura3d/audio";
import type { GameAudioContextLike } from "../../../packages/engine/src/game/GameAudio";

const mocks = vi.hoisted(() => ({ factory: vi.fn() }));

vi.mock("@aura3d/audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aura3d/audio")>();
  return { ...actual, createGameSoundEngine: (options: unknown) => mocks.factory(options) };
});

import { createGameAudio } from "../../../packages/engine/src/game/GameAudio";

type CapturedEngineOptions = {
  request?: { headers?: HeadersInit; allowedOrigins?: readonly string[]; securityContext?: string; integrity?: unknown };
  probeBase?: string;
  cues: Record<string, { asset?: AudioAssetRef }>;
};

function context(): GameAudioContextLike {
  return {
    state: "running",
    currentTime: 1,
    destination: {} as AudioNode,
    createGain: vi.fn(() => ({} as GainNode)),
    resume: vi.fn(async () => {})
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}

function voice(started?: Promise<boolean>) {
  return {
    id: 1,
    ...(started === undefined ? {} : { started }),
    ended: false,
    setLevel: vi.fn(),
    setPosition: vi.fn(),
    setOcclusion: vi.fn(),
    stop: vi.fn()
  };
}

function soundEngine(handle = voice()) {
  return {
    unlock: vi.fn(async () => {}),
    play: vi.fn(() => handle),
    setMuted: vi.fn(),
    setBusVolume: vi.fn(),
    setSecurityContext: vi.fn(),
    setListener: vi.fn(),
    proof: vi.fn(() => ({ errors: [] as string[] })),
    dispose: vi.fn()
  };
}

beforeEach(() => {
  mocks.factory.mockReset();
  vi.stubEnv("A3D_QR", "none");
  vi.stubEnv("A3D_QR_GAME", "0");
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("game audio request identity and evidence", () => {
  it("snapshots typed asset and default request policy before lazy engine creation", async () => {
    const engine = soundEngine();
    mocks.factory.mockReturnValue(engine);
    const digest = `sha256-${"a".repeat(64)}`;
    const variantDigest = `sha256-${"b".repeat(64)}`;
    const assetHeaders = new Headers({ "x-test-auth": "asset-original" });
    const defaultHeaders = new Headers({ "x-test-auth": "default-original" });
    const assetOrigins = ["https://asset.invalid"];
    const defaultOrigins = ["https://asset.invalid"];
    const assetDependencies: Record<string, string> = { child: digest };
    const defaultDependencies: Record<string, string> = { child: digest };
    const asset = {
      kind: "aura-asset-ref" as const,
      id: "cue-a",
      type: "audio" as const,
      format: "wav",
      url: "https://asset.invalid/cue.wav?synthetic=one",
      hash: digest,
      sha256: digest,
      sizeBytes: 7,
      license: "test-license",
      securityContext: "asset-top-level-generation",
      integrity: { version: 1 as const, digest, dependencies: assetDependencies },
      request: { headers: assetHeaders, allowedOrigins: assetOrigins, credentials: "omit" as const, securityContext: "asset-generation" },
      variantHashes: { "opus.webm": variantDigest }
    };
    const request = {
      headers: defaultHeaders,
      allowedOrigins: defaultOrigins,
      securityContext: "default-generation",
      integrity: { version: 1 as const, digest, dependencies: defaultDependencies }
    };
    const options = { context: context(), request, probeBase: "/probes-original/", cues: { hit: { id: "hit", asset } }, qualityRebuild: { flags: "none" } };
    const audio = createGameAudio(options);

    asset.url = "https://asset.invalid/replaced.wav";
    asset.hash = "changed";
    assetHeaders.set("x-test-auth", "changed");
    defaultHeaders.set("x-test-auth", "changed");
    assetOrigins.push("https://changed.invalid");
    defaultOrigins.push("https://changed.invalid");
    assetDependencies.child = "changed";
    defaultDependencies.child = "changed";
    asset.variantHashes["opus.webm"] = "changed";
    request.securityContext = "changed";
    options.probeBase = "/probes-changed/";

    await audio.unlock();
    expect(mocks.factory).toHaveBeenCalledTimes(1);
    const captured = mocks.factory.mock.calls[0]![0] as CapturedEngineOptions;
    expect(captured.probeBase).toBe("/probes-original/");
    const supplied = captured.cues.hit!.asset!;
    expect(supplied).toMatchObject({
      kind: "aura-asset-ref", id: "cue-a", type: "audio", format: "wav",
      url: "https://asset.invalid/cue.wav?synthetic=one", hash: digest, sha256: digest,
      sizeBytes: 7, license: "test-license", securityContext: "asset-top-level-generation",
      integrity: { version: 1, digest, dependencies: { child: digest } },
      request: { allowedOrigins: ["https://asset.invalid"], credentials: "omit", securityContext: "asset-generation" },
      variantHashes: { "opus.webm": variantDigest }
    });
    expect(new Headers(supplied.request?.headers).get("x-test-auth")).toBe("asset-original");
    expect(captured.request).toMatchObject({
      allowedOrigins: ["https://asset.invalid"], securityContext: "default-generation",
      integrity: { version: 1, digest, dependencies: { child: digest } }
    });
    expect(new Headers(captured.request?.headers).get("x-test-auth")).toBe("default-original");
    await audio.dispose();
  });

  it("updates the authentication generation before and after lazy construction", async () => {
    const engine = soundEngine();
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    audio.setSecurityContext("first-generation");
    expect(mocks.factory).not.toHaveBeenCalled();
    await audio.unlock();
    expect((mocks.factory.mock.calls[0]![0] as CapturedEngineOptions).request?.securityContext).toBe("first-generation");
    audio.setSecurityContext("second-generation");
    audio.setSecurityContext();
    expect(engine.setSecurityContext.mock.calls).toEqual([["second-generation"], [undefined]]);
    expect(() => audio.setSecurityContext("  ")).toThrow(/non-empty/);
    await audio.dispose();
  });

  it("snapshots a foreign header collection even when the global constructor is absent", async () => {
    const engine = soundEngine();
    mocks.factory.mockReturnValue(engine);
    let current = "original";
    const headers = {
      forEach(callback: (value: string, name: string) => void) { callback(current, "x-test-auth"); }
    } as unknown as Headers;
    vi.stubGlobal("Headers", undefined);
    const audio = createGameAudio({
      context: context(), request: { headers }, qualityRebuild: { flags: "none" },
      cues: { hit: { id: "hit", asset: "/cue.wav" } }
    });
    current = "changed";
    await audio.unlock();
    const captured = mocks.factory.mock.calls[0]![0] as CapturedEngineOptions;
    expect(captured.request?.headers).toEqual([["x-test-auth", "original"]]);
    await audio.dispose();
  });

  it("copies a foreign header collection without relying on constructor recognition", async () => {
    const engine = soundEngine();
    mocks.factory.mockReturnValue(engine);
    let current = "original";
    const headers = {
      forEach(callback: (value: string, name: string) => void) { callback(current, "x-test-auth"); }
    } as unknown as Headers;
    const audio = createGameAudio({
      context: context(), request: { headers }, qualityRebuild: { flags: "none" },
      cues: { hit: { id: "hit", asset: "/cue.wav" } }
    });
    current = "changed";
    await audio.unlock();
    const captured = mocks.factory.mock.calls[0]![0] as CapturedEngineOptions;
    expect(captured.request?.headers).toEqual([["x-test-auth", "original"]]);
    await audio.dispose();
  });

  it("retains borrowed decoded buffers and snapshots URL objects", async () => {
    const engine = soundEngine();
    mocks.factory.mockReturnValue(engine);
    const buffer = { duration: 1, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer;
    const clip = new AudioClip({ name: "decoded", buffer });
    const url = new URL("https://asset.invalid/original.wav");
    const audio = createGameAudio({
      context: context(), qualityRebuild: { flags: "none" },
      cues: { clip: { id: "clip", asset: clip }, url: { id: "url", asset: url } }
    });
    url.pathname = "/changed.wav";
    await audio.unlock();
    const captured = mocks.factory.mock.calls[0]![0] as CapturedEngineOptions;
    expect(captured.cues.clip!.asset).toMatchObject({ url: "clip:decoded" });
    expect(captured.cues.clip!.asset!.buffer).toBe(buffer);
    expect(captured.cues.url!.asset!.url).toBe("https://asset.invalid/original.wav");
    await audio.dispose();
  });

  it("captures typed identity exposed through asset getters", async () => {
    const engine = soundEngine();
    mocks.factory.mockReturnValue(engine);
    let url = "https://asset.invalid/original.wav";
    let hash = "a".repeat(64);
    class AudioAsset {
      get url() { return url; }
      get id() { return "getter-cue"; }
      get sha256() { return hash; }
      get securityContext() { return "getter-generation"; }
    }
    const audio = createGameAudio({
      context: context(), qualityRebuild: { flags: "none" },
      cues: { hit: { id: "hit", asset: new AudioAsset() } }
    });
    url = "https://asset.invalid/changed.wav";
    hash = "b".repeat(64);
    await audio.unlock();
    const captured = mocks.factory.mock.calls[0]![0] as CapturedEngineOptions;
    expect(captured.cues.hit!.asset).toMatchObject({
      url: "https://asset.invalid/original.wav", id: "getter-cue",
      sha256: "a".repeat(64), securityContext: "getter-generation"
    });
    await audio.dispose();
  });

  it("does not count a pending or cancelled voice as played", async () => {
    const start = deferred<boolean>();
    const pending = voice(start.promise);
    pending.stop.mockImplementation(() => start.resolve(false));
    const engine = soundEngine(pending);
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    await audio.unlock();
    const event = audio.cue("hit");
    expect(audio.evidence.playedCueCount).toBe(0);
    expect(audio.evidence.playingNodes).toEqual([]);
    audio.stopCue("hit", 0);
    expect(pending.stop).toHaveBeenCalledWith(0);
    await event;
    expect(audio.evidence.playedCueCount).toBe(0);
    expect(audio.evidence.suppressedCueCount).toBe(1);
    expect(audio.evidence.playingNodes).toEqual([]);
    await audio.dispose();
  });

  it("counts a deferred voice only after it actually starts", async () => {
    const start = deferred<boolean>();
    const engine = soundEngine(voice(start.promise));
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    await audio.unlock();
    let settled = false;
    const event = audio.cue("hit").then((value) => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(audio.evidence.playedCueCount).toBe(0);
    audio.setOcclusion("hit", 0.7);
    start.resolve(true);
    await event;
    expect(settled).toBe(true);
    expect(audio.evidence.playedCueCount).toBe(1);
    expect(audio.evidence.playingNodes).toHaveLength(1);
    expect(audio.evidence.playingNodes[0]!.occlusion).toBe(0.7);
    await audio.dispose();
  });

  it.each(["dispose", "security-context"] as const)(
    "settles a pending cue when %s invalidates it",
    async (reason) => {
      const start = deferred<boolean>();
      const pending = voice(start.promise);
      pending.stop.mockImplementation(() => start.resolve(false));
      const engine = soundEngine(pending);
      engine.dispose.mockImplementation(() => pending.stop());
      engine.setSecurityContext.mockImplementation(() => pending.stop());
      mocks.factory.mockReturnValue(engine);
      const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
      await audio.unlock();
      const event = audio.cue("hit");
      if (reason === "dispose") await audio.dispose();
      else audio.setSecurityContext("next-generation");
      await event;
      expect(pending.stop).toHaveBeenCalledTimes(1);
      expect(audio.evidence.playedCueCount).toBe(0);
      expect(audio.evidence.suppressedCueCount).toBe(1);
      if (reason !== "dispose") await audio.dispose();
    }
  );

  it("removes and stops a deferred handle if its start promise unexpectedly rejects", async () => {
    const start = deferred<boolean>();
    const pending = voice(start.promise);
    const engine = soundEngine(pending);
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", loop: true, asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    await audio.unlock();
    const event = audio.cue("hit");
    start.reject(new Error("synthetic-private-value"));
    await event;
    expect(pending.stop).toHaveBeenCalledTimes(1);
    expect(audio.evidence.playedCueCount).toBe(0);
    expect(audio.evidence.errors).toEqual(["Game audio cue playback failed."]);
    expect(JSON.stringify(audio.evidence)).not.toContain("synthetic-private-value");
    await audio.cue("hit");
    expect(engine.play).toHaveBeenCalledTimes(2);
    await audio.dispose();
  });

  it("keeps arbitrary playback exceptions out of bounded, copied evidence", async () => {
    const engine = soundEngine();
    engine.play.mockImplementation(() => { throw new Error("https://asset.invalid/cue?token=synthetic-private-value"); });
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    await audio.unlock();
    for (let i = 0; i < 40; i += 1) await audio.cue("hit");
    const evidence = audio.evidence;
    expect(evidence.errors).toHaveLength(32);
    expect(evidence.errors.every((item) => item === "Game audio cue playback failed.")).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("synthetic-private-value");
    (evidence.errors as string[]).splice(0);
    expect(audio.evidence.errors).toHaveLength(32);
    await audio.dispose();
  });

  it("reports asynchronous engine failure without copying its untrusted text", async () => {
    const engine = soundEngine();
    engine.proof.mockReturnValue({ errors: ["https://asset.invalid/cue?token=synthetic-private-value"] });
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    await audio.unlock();
    expect(audio.evidence.errors).toEqual(["Game audio engine reported a failure."]);
    expect(JSON.stringify(audio.evidence)).not.toContain("synthetic-private-value");
    await audio.dispose();
  });

  it("reports an unavailable engine status without guessing its cause", async () => {
    const engine = soundEngine();
    engine.proof.mockImplementation(() => { throw new Error("synthetic-private-value"); });
    mocks.factory.mockReturnValue(engine);
    const audio = createGameAudio({ context: context(), cues: { hit: { id: "hit", asset: "/cue.wav" } }, qualityRebuild: { flags: "none" } });
    await audio.unlock();
    expect(audio.evidence.errors).toEqual(["Game audio status unavailable."]);
    expect(JSON.stringify(audio.evidence)).not.toContain("synthetic-private-value");
    await audio.dispose();
  });
});
