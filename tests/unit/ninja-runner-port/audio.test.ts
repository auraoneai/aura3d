import { describe, expect, it } from "vitest";
import { GameAudio, melodyStep, midiToHz } from "../../../examples/ninja-runner-port/audio";

describe("ninja-runner-port audio", () => {
  it("midiToHz is equal temperament", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 9);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
  });

  it("the melody is deterministic, in range and moves", () => {
    const run = Array.from({ length: 64 }, (_, i) => melodyStep(i));
    expect(run).toEqual(Array.from({ length: 64 }, (_, i) => melodyStep(i)));
    expect(run.every((n) => Number.isInteger(n) && n >= 0 && n < 12)).toBe(true);
    expect(new Set(run).size).toBeGreaterThan(3);
  });

  it("is a safe no-op without an AudioContext and tracks mute", () => {
    const a = new GameAudio();
    expect(a.supported).toBe(false);
    a.unlock();
    a.play("jump");
    a.update({ form: "base", speed: 18, running: true });
    expect(a.active).toBe(false);
    expect(a.toggleMute()).toBe(true);
    expect(a.muted).toBe(true);
    a.dispose();
  });
});
