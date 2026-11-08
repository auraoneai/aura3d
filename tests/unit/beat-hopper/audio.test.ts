import { describe, expect, it } from "vitest";
import {
  ARP_STEPS, BASS_STEPS, BeatHopperSound, CUES, diffSounds, musicLevel, type BeatSound, type FrameState
} from "../../../apps/showcase-beat-hopper/src/audio";
import { CONFIG } from "../../../apps/showcase-beat-hopper/src/sim";
import { createFakeContext } from "../audio-synth/mockContext";

const frame = (over: Partial<FrameState> = {}): FrameState => ({
  phase: "playing",
  beatIndex: 0,
  pose: "grounded",
  combo: 0,
  mult: 1,
  perfect: 0,
  good: 0,
  miss: 0,
  milestones: 0,
  ...over
});

describe("beat-hopper audio", () => {
  it("runs at 132 BPM with 8-step bass/arp patterns and one cue per game event", () => {
    expect(CONFIG.BPM).toBe(132);
    expect(BASS_STEPS).toHaveLength(8);
    expect(ARP_STEPS).toHaveLength(8);
    const cues: BeatSound[] = ["hop", "duck", "perfect", "good", "miss", "milestone", "gameover", "start"];
    expect(Object.keys(CUES).sort()).toEqual(cues.sort());
  });

  it("diffSounds maps every sim event to its cue", () => {
    expect(diffSounds(null, frame())).toEqual([]);
    expect(diffSounds(frame({ phase: "splash" }), frame())).toEqual([{ sound: "start", level: 0 }]);
    expect(diffSounds(frame(), frame({ pose: "air" }))).toEqual([{ sound: "hop", level: 0 }]);
    expect(diffSounds(frame(), frame({ pose: "duck" }))).toEqual([{ sound: "duck", level: 0 }]);
    expect(diffSounds(frame(), frame({ perfect: 1, combo: 4 }))).toEqual([{ sound: "perfect", level: 4 }]);
    expect(diffSounds(frame(), frame({ good: 1, combo: 2 }))).toEqual([{ sound: "good", level: 2 }]);
    expect(diffSounds(frame(), frame({ miss: 1 }))).toEqual([{ sound: "miss", level: 0 }]);
    expect(diffSounds(frame(), frame({ milestones: 1 }))).toEqual([{ sound: "milestone", level: 0 }]);
    expect(diffSounds(frame({ phase: "bursting" }), frame({ phase: "gameOver" }))).toEqual([{ sound: "gameover", level: 0 }]);
    expect(diffSounds(frame(), frame())).toEqual([]);
  });

  it("stays silent until unlocked, then plays cues", async () => {
    const f = createFakeContext("suspended");
    const sound = new BeatHopperSound({ context: f.ctx });
    sound.play("hop");
    expect(f.ofKind("osc")).toHaveLength(0);
    await sound.unlock();
    f.ctx.currentTime = 0.2;
    sound.play("perfect", 3);
    expect(f.ofKind("osc").length).toBeGreaterThanOrEqual(2);
    sound.dispose();
  });

  it("persists mute state across unlock and suppresses voices while muted", async () => {
    const f = createFakeContext("suspended");
    const sound = new BeatHopperSound({ context: f.ctx });
    sound.setMuted(true);
    await sound.unlock();
    expect(sound.muted).toBe(true);
    const before = f.ofKind("osc").length;
    sound.play("hop");
    expect(f.ofKind("osc").length).toBe(before);
    sound.setMuted(false);
    sound.play("hop");
    expect(f.ofKind("osc").length).toBeGreaterThan(before);
    sound.dispose();
  });

  it("schedules 8-step music from sim beatIndex diffs and scales intensity with multiplier", async () => {
    expect(musicLevel(1)).toBeCloseTo(0.035, 9);
    expect(musicLevel(5)).toBeCloseTo(0.035 * 5, 9);
    const f = createFakeContext("suspended");
    const sound = new BeatHopperSound({ context: f.ctx });
    sound.onFrame(null, frame({ beatIndex: 0 }));
    expect(sound.beatsScheduled).toBe(0);
    await sound.unlock();
    sound.onFrame(frame({ beatIndex: 0 }), frame({ beatIndex: 1, mult: 1 }));
    expect(sound.beatsScheduled).toBe(1);
    const oscAtMult1 = f.ofKind("osc").length;
    sound.onFrame(frame({ beatIndex: 1, mult: 1 }), frame({ beatIndex: 2, mult: 5 }));
    expect(sound.beatsScheduled).toBe(2);
    // At mult 5, 4 voices are scheduled per beat (bass + arp + octave + fifth).
    expect(f.ofKind("osc").length - oscAtMult1).toBe(4);
    // Restarting resets beatIndex to 0 without scheduling a burst.
    sound.onFrame(frame({ beatIndex: 2, mult: 5 }), frame({ beatIndex: 0, mult: 1 }));
    expect(sound.beatsScheduled).toBe(3);
    sound.dispose();
  });
});
