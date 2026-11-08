import { describe, expect, it } from "vitest";
import {
  BPM,
  CUES,
  createPolaritySound,
  diffSounds,
  frameStateOf,
  type FrameState,
  type PolaritySound
} from "../../../apps/showcase-polarity-orbs/src/audio";
import { PolarityOrbsSim } from "../../../apps/showcase-polarity-orbs/src/sim";
import { createFakeContext } from "../audio-synth/mockContext";

const frame = (over: Partial<FrameState> = {}): FrameState => ({
  phase: "playing",
  lives: 3,
  combo: 0,
  mult: 1,
  score: 0,
  flips: 0,
  orbsCollected: 0,
  wrongs: 0,
  shieldBlocks: 0,
  powerupsTaken: 0,
  milestones: 0,
  ...over
});

describe("polarity orbs audio", () => {
  it("runs at 126 BPM and defines every game cue", () => {
    expect(BPM).toBe(126);
    const expected: PolaritySound[] = [
      "flip",
      "collect",
      "wrong",
      "powerup",
      "milestone",
      "gameover",
      "start",
      "block",
      "burst"
    ];
    expect(Object.keys(CUES).sort()).toEqual([...expected].sort());
  });

  it("diffSounds maps every sim sound event to its cue", () => {
    const sim = new PolarityOrbsSim(7);
    expect(frameStateOf(sim.o).phase).toBe("splash");
    expect(diffSounds(null, frame())).toEqual([]);
    expect(diffSounds(frame({ phase: "splash" }), frame({ phase: "playing" }))).toEqual([{ sound: "start", level: 0 }]);
    expect(diffSounds(frame(), frame({ flips: 1 }))).toEqual([{ sound: "flip", level: 0 }]);
    expect(diffSounds(frame(), frame({ orbsCollected: 1, combo: 4 }))).toEqual([{ sound: "collect", level: 4 }]);
    expect(diffSounds(frame(), frame({ wrongs: 1, lives: 2 }))).toEqual([{ sound: "wrong", level: 0 }]);
    expect(diffSounds(frame(), frame({ shieldBlocks: 1 }))).toEqual([{ sound: "block", level: 0 }]);
    expect(diffSounds(frame(), frame({ powerupsTaken: 1 }))).toEqual([{ sound: "powerup", level: 0 }]);
    expect(diffSounds(frame(), frame({ milestones: 1 }))).toEqual([{ sound: "milestone", level: 0 }]);
    expect(diffSounds(frame(), frame({ phase: "bursting" }))).toEqual([{ sound: "burst", level: 0 }]);
    expect(diffSounds(frame({ phase: "bursting" }), frame({ phase: "gameOver" }))).toEqual([{ sound: "gameover", level: 0 }]);
    expect(diffSounds(frame(), frame())).toEqual([]);
  });

  it("stays silent until unlocked, then plays cues", async () => {
    const f = createFakeContext("suspended");
    const sound = createPolaritySound({ context: f.ctx });
    sound.play("flip", 0);
    expect(f.ofKind("osc")).toHaveLength(0);
    await sound.unlock();
    f.ctx.currentTime = 0.5;
    sound.play("collect", 3);
    expect(f.ofKind("osc").length).toBeGreaterThanOrEqual(1);
    sound.dispose();
  });

  it("keeps the saved mute state across unlock and while playing", async () => {
    const f = createFakeContext("suspended");
    const sound = createPolaritySound({ context: f.ctx });
    sound.setMuted(true);
    await sound.unlock();
    expect(sound.muted).toBe(true);
    const before = f.ofKind("osc").length;
    sound.play("flip", 0);
    expect(f.ofKind("osc").length).toBe(before);
    sound.setMuted(false);
    sound.play("flip", 0);
    expect(f.ofKind("osc").length).toBeGreaterThan(before);
    sound.dispose();
  });
});
