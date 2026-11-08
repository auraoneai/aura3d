import { describe, expect, it } from "vitest";
import {
  BPM,
  CUE_NAMES,
  CUES,
  createShapeSound,
  diffSounds,
  type CueName,
  type FrameState
} from "../../../apps/showcase-shape-shift-sprint/src/audio";
import { createFakeContext } from "../audio-synth/mockContext";

const frame = (over: Partial<FrameState> = {}): FrameState => ({
  phase: "playing",
  lives: 3,
  combo: 0,
  score: 0,
  shapeIndex: 0,
  shieldActive: false,
  wildcardTimer: 0,
  scoreX2Timer: 0,
  milestone: 0,
  perfect: false,
  ...over
});

describe("shape shift sprint audio", () => {
  it("runs at 124 BPM and defines every game cue", () => {
    expect(BPM).toBe(124);
    const expected: CueName[] = ["match", "perfect", "morph", "hit", "shield", "wildcard", "x2", "milestone", "gameover"];
    expect([...CUE_NAMES].sort()).toEqual([...expected].sort());
    expect(Object.keys(CUES).sort()).toEqual([...expected].sort());
  });

  it("diffSounds maps every sim event to its cue", () => {
    expect(diffSounds(null, frame())).toEqual([]);
    expect(diffSounds(frame(), frame({ combo: 2, perfect: false }))).toEqual([{ sound: "match", level: 2 }]);
    expect(diffSounds(frame(), frame({ combo: 3, perfect: true }))).toEqual([{ sound: "perfect", level: 3 }]);
    expect(diffSounds(frame(), frame({ shapeIndex: 2 }))).toEqual([{ sound: "morph", level: 2 }]);
    expect(diffSounds(frame(), frame({ lives: 2 }))).toEqual([{ sound: "hit", level: 0 }]);
    expect(diffSounds(frame(), frame({ shieldActive: true }))).toEqual([{ sound: "shield", level: 0 }]);
    expect(diffSounds(frame({ shieldActive: true }), frame({ shieldActive: false }))).toEqual([{ sound: "shield", level: 1 }]);
    expect(diffSounds(frame(), frame({ wildcardTimer: 5 }))).toEqual([{ sound: "wildcard", level: 0 }]);
    expect(diffSounds(frame(), frame({ scoreX2Timer: 7 }))).toEqual([{ sound: "x2", level: 0 }]);
    expect(diffSounds(frame(), frame({ milestone: 1 }))).toEqual([{ sound: "milestone", level: 0 }]);
    expect(diffSounds(frame(), frame({ phase: "bursting" }))).toEqual([{ sound: "gameover", level: 0 }]);
    expect(diffSounds(frame(), frame())).toEqual([]);
  });

  it("stays silent until unlocked, then plays cues", async () => {
    const f = createFakeContext("suspended");
    const sound = createShapeSound({ context: f.ctx });
    sound.play("match", 1);
    expect(f.ofKind("osc")).toHaveLength(0);
    await sound.unlock();
    f.ctx.currentTime = 0.5;
    sound.play("perfect", 3);
    expect(f.ofKind("osc").length).toBeGreaterThanOrEqual(1);
    sound.dispose();
  });

  it("keeps the saved mute state across unlock and while playing", async () => {
    const f = createFakeContext("suspended");
    const sound = createShapeSound({ context: f.ctx });
    sound.setMuted(true);
    await sound.unlock();
    expect(sound.muted).toBe(true);
    const before = f.ofKind("osc").length;
    sound.play("morph", 1);
    expect(f.ofKind("osc").length).toBe(before);
    sound.setMuted(false);
    sound.play("morph", 1);
    expect(f.ofKind("osc").length).toBeGreaterThan(before);
    sound.dispose();
  });
});
