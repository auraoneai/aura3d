import { describe, expect, it } from "vitest";
import { SplatSound } from "../../../examples/splat-rush-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

describe("Splat Rush audio on the synth cue kit", () => {
  it("stays silent until unlocked, then starts the music and plays cues", async () => {
    const f = createFakeContext("suspended");
    const sound = new SplatSound({ context: f.ctx });
    sound.play("hit");
    expect(f.ofKind("osc")).toHaveLength(0);
    await sound.unlock();
    f.ctx.currentTime = 0.5;
    sound.play("perfect", 3);
    expect(f.ofKind("osc").length).toBeGreaterThanOrEqual(2);
    expect(f.ofKind("source").length).toBe(1);
    sound.dispose();
  });

  it("keeps the saved mute across the unlock and while playing", async () => {
    const f = createFakeContext("suspended");
    const sound = new SplatSound({ context: f.ctx });
    sound.muted = true;
    await sound.unlock();
    expect(sound.muted).toBe(true);
    const before = f.ofKind("osc").length;
    sound.play("match", 2);
    expect(f.ofKind("osc").length).toBe(before);
    sound.setMuted(false);
    sound.play("match", 2);
    expect(f.ofKind("osc").length).toBe(before + 1);
    sound.dispose();
  });
});
