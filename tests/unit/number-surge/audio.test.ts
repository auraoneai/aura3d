import { describe, expect, it } from "vitest";
import {
  BPM,
  CUES,
  createNumberSurgeSound,
  diffSounds,
  type AudioFrame,
  type Cue
} from "../../../apps/showcase-number-surge/src/audio";
import type { EventCounters } from "../../../apps/showcase-number-surge/src/sim";
import { createFakeContext } from "../audio-synth/mockContext";

const events = (over: Partial<EventCounters> = {}): EventCounters => ({
  pickGood: 0,
  pickBad: 0,
  smash: 0,
  wallFail: 0,
  wallBlock: 0,
  powerup: 0,
  milestone: 0,
  gameover: 0,
  ...over
});

const frame = (over: Partial<EventCounters> = {}, phase: AudioFrame["phase"] = "playing"): AudioFrame => ({
  phase,
  events: events(over)
});

describe("number surge audio", () => {
  it("runs at 128 BPM and has one cue per game event", () => {
    expect(BPM).toBe(128);
    const cues: Cue[] = [
      "pick-good",
      "pick-bad",
      "smash",
      "wall-fail",
      "wall-block",
      "powerup",
      "milestone",
      "gameover",
      "start"
    ];
    expect(Object.keys(CUES).sort()).toEqual(cues.sort());
  });

  it("diffSounds maps every sim event counter to its cue", () => {
    expect(diffSounds(null, frame())).toEqual([]);
    expect(diffSounds(frame({}, "splash"), frame({}, "playing"))).toEqual([{ sound: "start", level: 0 }]);
    expect(diffSounds(frame(), frame({ pickGood: 3 }))).toEqual([{ sound: "pick-good", level: 3 }]);
    expect(diffSounds(frame(), frame({ pickBad: 1 }))).toEqual([{ sound: "pick-bad", level: 0 }]);
    expect(diffSounds(frame(), frame({ smash: 1 }))).toEqual([{ sound: "smash", level: 0 }]);
    expect(diffSounds(frame(), frame({ wallFail: 1 }))).toEqual([{ sound: "wall-fail", level: 0 }]);
    expect(diffSounds(frame(), frame({ wallBlock: 1 }))).toEqual([{ sound: "wall-block", level: 0 }]);
    expect(diffSounds(frame(), frame({ powerup: 1 }))).toEqual([{ sound: "powerup", level: 0 }]);
    expect(diffSounds(frame(), frame({ milestone: 1 }))).toEqual([{ sound: "milestone", level: 0 }]);
    expect(diffSounds(frame(), frame({ gameover: 1 }))).toEqual([{ sound: "gameover", level: 0 }]);
    expect(diffSounds(frame(), frame())).toEqual([]);
  });

  it("stays silent until unlocked, then plays cues", async () => {
    const f = createFakeContext("suspended");
    const sound = createNumberSurgeSound({ context: f.ctx });
    sound.play("pick-bad");
    expect(f.ofKind("osc")).toHaveLength(0);
    await sound.unlock();
    f.ctx.currentTime = 0.5;
    sound.play("pick-good", 3);
    expect(f.ofKind("osc").length).toBeGreaterThanOrEqual(1);
    sound.dispose();
  });

  it("keeps the saved mute state across unlock and while playing", async () => {
    const f = createFakeContext("suspended");
    const sound = createNumberSurgeSound({ context: f.ctx });
    sound.setMuted(true);
    await sound.unlock();
    expect(sound.muted).toBe(true);
    const before = f.ofKind("osc").length;
    sound.play("powerup");
    expect(f.ofKind("osc").length).toBe(before);
    sound.setMuted(false);
    sound.play("powerup");
    expect(f.ofKind("osc").length).toBeGreaterThan(before);
    sound.dispose();
  });
});
