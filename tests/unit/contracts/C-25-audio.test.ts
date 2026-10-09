import { describe, expect, it } from "vitest";
import { createGameSoundEngine as stubEngine } from "@aura3d/audio/contracts";
import { createGameSoundEngine as realEngine } from "@aura3d/audio";

/**
 * C-25 game-sound contract (16.1-1): stub and real behaviour suites. No slot is
 * registered on main yet, so the suites address both factories directly —
 * `@aura3d/audio/contracts` (PR-0a silent stub) and `@aura3d/audio` (real
 * engine, which falls back to its headless context under Node).
 */
describe("stub", () => {
  it("play returns a handle and counts voices until muted", () => {
    const e = stubEngine({ cues: { hit: { bus: "sfx" } } });
    expect(e.play("hit")).not.toBeNull();
    expect(e.proof().voicesPlayed).toBe(1);
    e.setMuted(true);
    expect(e.play("hit")).toBeNull();
    expect(e.proof().voicesPlayed).toBe(1);
    e.setMuted(false);
    e.play("hit");
    expect(e.proof().voicesPlayed).toBe(2);
  });

  it("proof reports the silent PR-0a surface", () => {
    const e = stubEngine({ cues: {} });
    const p = e.proof();
    expect(p.contextState).toBe("none");
    expect(p.assetCues).toBe(0);
    expect(p.synthCues).toBe(0);
    expect(p.limiterEngaged).toBe(false);
  });

  it("loop/engine/music/bus calls are safe no-ops", async () => {
    const e = stubEngine({ cues: { bed: { bus: "ambience", loop: true } } });
    expect(e.loop("bed")).not.toBeNull();
    expect(e.engine({ cue: "bed", rpmRange: [0, 8000], pitchRange: [0.5, 2] })).not.toBeNull();
    e.music.play("theme");
    e.setBusVolume("sfx", 0.5);
    e.duck("sfx", 0.3, 50);
    e.setListener({ position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0] });
    await e.suspend();
    await e.resume();
    await e.unlock();
    e.dispose();
  });
});

describe("real", () => {
  const synthCues = {
    blip: { bus: "sfx" as const, play: () => undefined },
    bed: { bus: "ambience" as const, play: () => undefined, loop: true }
  };

  it("rejects cues with neither asset nor play()", () => {
    expect(() =>
      realEngine({ cues: { bad: { bus: "sfx" } } })
    ).toThrow(/no asset or play/i);
  });

  it("plays a synth cue, counts the voice, and reports provenance", () => {
    const e = realEngine({ cues: synthCues });
    expect(e.proof().contextState).toBe("running");
    const h = e.play("blip");
    expect(h).not.toBeNull();
    const p = e.proof();
    expect(p.voicesPlayed).toBe(1);
    expect(p.synthCues).toBe(2);
    expect(p.assetCues).toBe(0);
    h?.stop(0);
    e.dispose();
  });

  it("muted engine returns null and holds the voice count", () => {
    const e = realEngine({ cues: synthCues });
    e.setMuted(true);
    expect(e.play("blip")).toBeNull();
    expect(e.proof().voicesPlayed).toBe(0);
    e.dispose();
  });
});
