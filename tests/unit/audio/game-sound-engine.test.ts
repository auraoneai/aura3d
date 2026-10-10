import { describe, expect, it } from "vitest";
import { createGameSoundEngine } from "../../../packages/audio/src/game-sound/GameSoundEngine";
import { FakeContext, FakeNode, FakeSource } from "./fake-context";

const asset = (url: string) => ({ url, hash: "x", license: "CC0", provenance: "sample" as const });

const options = (ctx: FakeContext) => ({
  context: ctx,
  seed: 42,
  tier: "high" as const,
  cues: {
    hit: { bus: "sfx" as const, asset: [asset("a.opus.webm"), asset("b.opus.webm")] },
    beep: { bus: "ui" as const, play: () => {} },
    idle: { bus: "sfx" as const, asset: asset("idle.opus.webm") }
  }
});

describe("createGameSoundEngine (PRD-09 §7.5/1733)", () => {
  it("throws the PRD message for a cue with neither asset nor play()", () => {
    const ctx = new FakeContext();
    expect(() =>
      createGameSoundEngine({ context: ctx, cues: { empty: { bus: "sfx" } as never } })
    ).toThrow(
      'Game audio cue "empty" has no asset or play(); synthesized default cues were removed (PRD 09).'
    );
  });

  it("synth cues invoke their play callback instead of the buffer-voice pool", () => {
    const ctx = new FakeContext();
    let played = 0;
    const engine = createGameSoundEngine({
      context: ctx,
      cues: { beep: { bus: "ui", play: () => (played += 1) } }
    });
    engine.unlock();
    const h = engine.play("beep" as never);
    expect(played).toBe(1);
    expect(h).not.toBeNull();
    expect(ctx.ofKind("source").length).toBe(0); // no buffer voice
  });

  it("buffered cue returns a VoiceHandle that stops and repositions", () => {
    const ctx = new FakeContext();
    const engine = createGameSoundEngine(options(ctx));
    const h = engine.play("hit", { position: [1, 0, 0] });
    expect(h).not.toBeNull();
    expect(ctx.ofKind("source").length).toBe(1);
    h!.stop();
    expect((ctx.ofKind("source")[0] as FakeSource).stopped).toBe(1);
    expect(() => h!.setPosition([2, 0, 0])).not.toThrow();
  });

  it("setMuted drops plays and mutes the master bus", () => {
    const ctx = new FakeContext();
    const engine = createGameSoundEngine(options(ctx));
    engine.setMuted(true);
    expect(engine.play("hit")).toBeNull();
    engine.setMuted(false);
    expect(engine.play("hit")).not.toBeNull();
  });

  it("setBusVolume clamps 0..1; duck ramps and restores", async () => {
    const ctx = new FakeContext();
    const engine = createGameSoundEngine(options(ctx));
    engine.setBusVolume("sfx", 0.5);
    const proof1 = engine.proof();
    expect(proof1.buses.sfx).toBe(0.5);
    engine.duck("sfx", 0.25, 10);
    await new Promise((r) => setTimeout(r, 30));
    expect(engine.proof().buses.sfx).toBe(0.5);
  });

  it("proof() reports live state only", () => {
    const ctx = new FakeContext();
    const engine = createGameSoundEngine(options(ctx));
    engine.play("hit");
    const p = engine.proof();
    expect(p.contextState).toBe("running");
    expect(p.voicesPlayed).toBe(1);
    expect(p.liveVoices).toBe(1);
    expect(p.assetCues).toBe(2); // hit (2 variants) + idle
    expect(p.synthCues).toBe(1);
    expect(p.limiterEngaged).toBe(false);
    expect(p.stages).toContain("safetyClip(±0.966)");
    expect(p.tier).toBe("high");
    expect(p.errors).toEqual([]);
  });

  it("loop() returns a LoopHandle; engine({cue,...}) shorthand builds a loop", () => {
    const ctx = new FakeContext();
    const engine = createGameSoundEngine(options(ctx));
    const loop = engine.loop("hit", { fadeInMs: 5 });
    expect(loop).not.toBeNull();
    loop!.setRate(1.2);
    loop!.stop(0);
    const e = engine.engine({ cue: "idle", rpmRange: [800, 5000], pitchRange: [0.7, 1.4] });
    e.setRpm(2000);
    e.stop();
  });

  it("{format} urls resolve through the probe to the fetched variant", async () => {
    const ctx = new FakeContext();
    const fetched: string[] = [];
    const probes: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
      fetched.push(String(url));
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8)
      } as Response;
    }) as typeof fetch;
    try {
      createGameSoundEngine({
        context: ctx,
        probeBase: "/probes/",
        cues: {
          hit: { bus: "sfx", asset: asset("/packs/game-sfx-core/sports.billiard-clack.00.{format}") }
        },
        fetchProbe: async (url) => {
          probes.push(url);
          return new ArrayBuffer(8);
        }
      });
      // The eager cue-asset load resolves the placeholder via the probe.
      await new Promise((r) => setTimeout(r, 20));
      expect(probes).toEqual(["/probes/probe-20ms.opus.webm"]);
      expect(fetched).toEqual(["/packs/game-sfx-core/sports.billiard-clack.00.opus.webm"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("recordMaster returns null without MediaRecorder, taps+untaps the master output when available", async () => {
    const ctx = new FakeContext();
    const engine = createGameSoundEngine(options(ctx));
    // Neither createMediaStreamDestination nor MediaRecorder → null (headless path).
    expect(await engine.recordMaster(0.01)).toBeNull();

    const dest = new FakeNode("media-stream-destination") as FakeNode & { stream: MediaStream };
    dest.stream = {} as MediaStream;
    (ctx as unknown as Record<string, unknown>).createMediaStreamDestination = () => dest;
    class FakeRecorder {
      static isTypeSupported(): boolean {
        return true;
      }
      readonly mimeType = "audio/webm;codecs=opus";
      state: "inactive" | "recording" = "inactive";
      ondataavailable: ((e: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start(): void {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["pcm"]) } as BlobEvent);
      }
      stop(): void {
        this.state = "inactive";
        this.onstop?.();
      }
      constructor(_stream: MediaStream, _opts?: { mimeType?: string }) {}
    }
    const prev = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeRecorder;
    try {
      const blob = await engine.recordMaster(0.01);
      expect(blob).not.toBeNull();
      expect(blob!.type).toContain("webm");
      // Tap released after stop — the chain output no longer feeds `dest`.
      const output = ctx.ofKind("shaper")[0];
      expect(output.connectedTo).not.toContain(dest);
    } finally {
      (globalThis as { MediaRecorder?: unknown }).MediaRecorder = prev;
    }
  });
});
