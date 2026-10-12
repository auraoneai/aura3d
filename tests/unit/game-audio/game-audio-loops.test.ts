import { describe, expect, it } from "vitest";
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

describe("GameAudio loops follow game state (no stacked drones)", () => {
  it("re-cueing a playing loop does not start a second voice", async () => {
    const { audio, sources } = make();
    await audio.unlock();
    await audio.cue("engine");
    await audio.cue("engine");
    await audio.cue("engine");
    expect(sources().filter((s) => s.loop && s.started.length > 0)).toHaveLength(1);
    // One-shots still retrigger.
    await audio.cue("hit");
    await audio.cue("hit");
    expect(sources().filter((s) => !s.loop && s.started.length > 0)).toHaveLength(2);
  });

  it("setCueLevel glides the loop's gain and rate relative to its authored level; 0 = silent", async () => {
    const { ctx, audio, sources } = make();
    await audio.unlock();
    await audio.cue("engine");
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
    audio.stopCue("engine", 0);
    expect(sources()[0].stopped).toBe(1);
    await audio.cue("engine");
    expect(sources().filter((s) => s.loop && s.started.length > 0)).toHaveLength(2);
  });
});
