import { describe, expect, it } from "vitest";
import { BPM, CUES, createTurfSound, diffSounds, type FrameState, type TurfCue } from "../../../apps/showcase-splat-turf/src/audio";
import { createFakeContext } from "../audio-synth/mockContext";

const frame = (over: Partial<FrameState> = {}): FrameState => ({
  phase: "playing", cansGrabbed: 0, solventHits: 0, eraserHits: 0, stretches: 0, milestones: 0, combo: 0, ...over
});

describe("splat turf audio", () => {
  it("runs at 112 BPM and has exactly one cue per game event", () => {
    expect(BPM).toBe(112);
    const cues: TurfCue[] = ["can", "solvent", "eraser", "stretch", "finish", "gameover", "start", "milestone", "burst"];
    expect(Object.keys(CUES).sort()).toEqual(cues.sort());
  });

  it("diffSounds maps every sim event to exactly one cue", () => {
    expect(diffSounds(null, frame())).toEqual([]);
    expect(diffSounds(frame({ phase: "splash" }), frame())).toEqual([{ sound: "start", level: 0 }]);
    expect(diffSounds(frame(), frame({ cansGrabbed: 1 }))).toEqual([{ sound: "can", level: 0 }]);
    expect(diffSounds(frame(), frame({ solventHits: 1 }))).toEqual([{ sound: "solvent", level: 0 }]);
    expect(diffSounds(frame(), frame({ eraserHits: 1 }))).toEqual([{ sound: "eraser", level: 0 }]);
    expect(diffSounds(frame(), frame({ stretches: 1, combo: 3 }))).toEqual([{ sound: "stretch", level: 3 }]);
    expect(diffSounds(frame(), frame({ milestones: 1 }))).toEqual([{ sound: "milestone", level: 0 }]);
    expect(diffSounds(frame(), frame({ phase: "bursting" }))).toEqual([{ sound: "burst", level: 0 }]);
    expect(diffSounds(frame({ phase: "bursting" }), frame({ phase: "gameOver" }))).toEqual([{ sound: "gameover", level: 0 }]);
    expect(diffSounds(frame(), frame({ phase: "finished" }))).toEqual([{ sound: "finish", level: 0 }]);
    expect(diffSounds(frame(), frame())).toEqual([]);
  });

  it("stays silent until unlocked, then plays cues", async () => {
    const f = createFakeContext("suspended");
    const sound = createTurfSound({ context: f.ctx });
    sound.play("solvent");
    expect(f.ofKind("osc")).toHaveLength(0);
    await sound.unlock();
    f.ctx.currentTime = 0.5;
    sound.play("stretch", 3);
    expect(f.ofKind("osc").length).toBeGreaterThanOrEqual(1);
    sound.dispose();
  });

  it("keeps the saved mute across unlock and while playing", async () => {
    const f = createFakeContext("suspended");
    const sound = createTurfSound({ context: f.ctx });
    sound.setMuted(true);
    await sound.unlock();
    expect(sound.muted).toBe(true);
    const before = f.ofKind("osc").length;
    sound.play("can");
    expect(f.ofKind("osc").length).toBe(before);
    sound.setMuted(false);
    sound.play("can");
    expect(f.ofKind("osc").length).toBeGreaterThan(before);
    sound.dispose();
  });
});