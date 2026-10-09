import { describe, expect, it } from "vitest";
import { createGameSoundEngine } from "@aura3d/audio";

/**
 * PRD-09 C-25 impl suite (16.1-1): real `createGameSoundEngine` behaviours that
 * are deterministic under its headless fallback context — synth cue voices,
 * loop/engine handles, bus mix state in proof(), mute gating, dispose.
 */
const cues = {
  shot: { bus: "sfx" as const, play: () => undefined, priority: 2 },
  bed: {
    bus: "ambience" as const,
    asset: { url: "bed.webm", hash: "h1", license: "cc0", provenance: "sample" as const },
    loop: true
  },
  motor: {
    bus: "sfx" as const,
    asset: { url: "motor.webm", hash: "h2", license: "cc0", provenance: "sample" as const },
    loop: true
  }
};

describe("real engine proof surface", () => {
  it("counts one-shot play() voices and reports cue provenance", () => {
    const e = createGameSoundEngine({ cues });
    e.play("shot");
    const p = e.proof();
    expect(p.voicesPlayed).toBe(1);
    expect(p.synthCues).toBe(1);
    expect(p.assetCues).toBe(2);
    expect(p.limiterEngaged).toBe(false);
    e.dispose();
  });

  it("setBusVolume is observable in proof().buses", () => {
    const e = createGameSoundEngine({ cues });
    e.setBusVolume("sfx", 0.25);
    const buses = (e.proof() as { buses?: Record<string, number> }).buses;
    expect(buses?.sfx).toBe(0.25);
    e.dispose();
  });

  it("loop/engine on asset cues return live handles", () => {
    const e = createGameSoundEngine({ cues });
    const loop = e.loop("bed");
    expect(loop).not.toBeNull();
    loop?.setRate(1.2, 10);
    loop?.setGain(-6, 10);
    loop?.setPosition([1, 2, 3]);
    loop?.stop(0);
    const eng = e.engine({ cue: "motor", rpmRange: [800, 7000], pitchRange: [0.6, 2.2] });
    eng.setRpm(3000);
    eng.setLoad(0.5);
    eng.setPosition([0, 1, 0]);
    eng.stop(0);
    e.dispose();
  });

  it("unknown music tracks throw; setIntensity/stop are safe; dispose idempotent", () => {
    const e = createGameSoundEngine({ cues });
    expect(() => e.music.play("theme", { crossfadeMs: 250 })).toThrow(/Unknown music track/);
    e.music.setIntensity(0.7);
    e.music.stop(100);
    e.dispose();
    expect(() => e.dispose()).not.toThrow();
  });

  it("listener + suspend/resume/unlock round-trip the headless context", async () => {
    const e = createGameSoundEngine({ cues });
    e.setListener({ position: [0, 1.6, 0], forward: [0, 0, -1], up: [0, 1, 0] });
    await e.suspend();
    await e.resume();
    await e.unlock();
    e.dispose();
  });
});
