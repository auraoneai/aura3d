import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameAudio, type GameAudioContextLike } from "../../../packages/engine/src";
import { FakeContext, type FakeGain, type FakeSource } from "../audio/fake-context";

const make = () => {
  const ctx = new FakeContext();
  const audio = createGameAudio({
    createContext: () => ctx as unknown as GameAudioContextLike,
    cues: {
      engine: { id: "engine", asset: "engine.wav", loop: true, volume: 0.5 },
      hit: { id: "hit", asset: "hit.wav" }
    }
  });
  const sources = () => ctx.ofKind<FakeSource>("source");
  return { ctx, audio, sources };
};

// Loops wait for their buffer: serve every asset fetch with bytes the fake decoder accepts.
beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response(new ArrayBuffer(16)));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("GameAudio loops follow game state (no stacked drones)", () => {
  it("re-cueing a playing loop does not start a second voice", async () => {
    const { audio, sources } = make();
    await audio.unlock();
    await audio.cue("engine");
    await settle();
    await audio.cue("engine");
    await settle();
    await audio.cue("engine");
    await settle();
    expect(sources().filter((s) => s.loop && s.started.length > 0)).toHaveLength(1);
    // One-shots still retrigger.
    await audio.cue("hit");
    await settle();
    await audio.cue("hit");
    await settle();
    expect(sources().filter((s) => !s.loop && s.started.length > 0)).toHaveLength(2);
  });

  it("setCueLevel glides the loop's gain and rate relative to its authored level; 0 = silent", async () => {
    const { ctx, audio, sources } = make();
    await audio.unlock();
    await audio.cue("engine");
    await settle();
    const loop = sources().find((s) => s.loop)!;
    const gain = loop.connectedTo[0] as unknown as FakeGain;
    const baseRate = loop.playbackRate.value;
    audio.setCueLevel("engine", { volume: 0, rate: 1.5 });
    expect(gain.gain.value).toBe(0);
    expect(loop.playbackRate.value).toBeCloseTo(baseRate * 1.5, 9);
    audio.setCueLevel("engine", { volume: 1 });
    // Back to the authored 0.5 volume (± the pool's 1.5 dB gain jitter).
    expect(gain.gain.value).toBeGreaterThan(0.5 * 0.84);
    expect(gain.gain.value).toBeLessThan(0.5 * 1.19);
    expect(ctx.ofKind("source").length).toBe(1);
  });

  it("stopCue ends the loop, after which cue() can start it again", async () => {
    const { audio, sources } = make();
    await audio.unlock();
    await audio.cue("engine");
    await settle();
    audio.stopCue("engine", 0);
    expect(sources()[0].stopped).toBe(1);
    await audio.cue("engine");
    await settle();
    expect(sources().filter((s) => s.loop && s.started.length > 0)).toHaveLength(2);
  });

  it("route-local bus volumes scale only their own cues (no last-write-wins on sfx)", async () => {
    const ctx = new FakeContext();
    const audio = createGameAudio({
      createContext: () => ctx as unknown as GameAudioContextLike,
      buses: [{ id: "engine", volume: 0.5 }, { id: "stem", volume: 0 }],
      cues: {
        engine: { id: "engine", asset: "e.wav", loop: true, bus: "engine" },
        stem: { id: "stem", asset: "s.wav", loop: true, bus: "stem" },
        shot: { id: "shot", asset: "x.wav", bus: "sfx" }
      }
    });
    await audio.unlock();
    await audio.cue("engine");
    await settle();
    await audio.cue("stem");
    await settle();
    await audio.cue("shot");
    await settle();
    const voiceGain = (i: number) => (ctx.ofKind<FakeSource>("source")[i].connectedTo[0] as unknown as FakeGain).gain.value;
    const [engine, stem, shot] = [voiceGain(0), voiceGain(1), voiceGain(2)];
    expect(engine).toBeGreaterThan(0.5 * 0.84);
    expect(engine).toBeLessThan(0.5 * 1.19);
    expect(stem).toBeLessThan(0.001);
    expect(shot).toBeGreaterThan(0.84); // sfx bus untouched by the "stem" = 0 write
    // A per-frame write to a route bus moves only that bus's voices.
    audio.setBusVolume("stem", 1);
    expect(voiceGain(1)).toBeGreaterThan(0.84);
    expect(voiceGain(2)).toBe(shot);
    // The shared engine sfx bus gain was never written by route-local ids.
    const sfxBusGains = ctx.ofKind<FakeGain>("gain").map((g) => g.gain.value);
    expect(sfxBusGains).not.toContain(0);
  });

  it("a loop cued before its buffer decoded starts once the buffer is ready (not as a silent buffer-less source)", async () => {
    const { audio, sources } = make();
    await audio.unlock();
    await audio.cue("engine");
    expect(sources().filter((s) => s.loop)).toHaveLength(0);
    audio.setCueLevel("engine", { volume: 0.25 });
    await settle();
    const loops = sources().filter((s) => s.loop && s.started.length > 0);
    expect(loops).toHaveLength(1);
    expect(loops[0].buffer).not.toBeNull();
  });
});
