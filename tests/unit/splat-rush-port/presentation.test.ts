import { describe, expect, it } from "vitest";
import { diffSounds, type FrameState } from "../../../examples/splat-rush-port/audio";
import { flashFor, vignetteOpacity } from "../../../examples/splat-rush-port/fx";

const base: FrameState = {
  phase: "playing", lives: 3, combo: 0, multiplier: 1, score: 0, shieldActive: false,
  rainbowTimer: 0, scoreX2Timer: 0, playerColorIndex: 0, milestone: 750, perfect: false
};
const next = (patch: Partial<FrameState>): FrameState => ({ ...base, ...patch });
const sounds = (prev: FrameState | null, n: FrameState): string[] => diffSounds(prev, n).map((e) => e.sound);

describe("presentation: sound events derived from state changes", () => {
  it("emits nothing for the first frame or an unchanged frame", () => {
    expect(sounds(null, base)).toEqual([]);
    expect(sounds(base, base)).toEqual([]);
  });
  it("start, burst and game over follow the phase", () => {
    expect(sounds(next({ phase: "splash" }), base)).toEqual(["start"]);
    expect(sounds(base, next({ phase: "bursting", lives: 0 }))).toContain("burst");
    expect(sounds(next({ phase: "bursting" }), next({ phase: "gameOver" }))).toEqual(["gameover"]);
  });
  it("a combo increase is a match (perfect when flagged) with the combo as the pitch level", () => {
    expect(diffSounds(base, next({ combo: 1 }))).toEqual([{ sound: "match", level: 1 }]);
    expect(diffSounds(next({ combo: 4 }), next({ combo: 5, perfect: true }))).toEqual([{ sound: "perfect", level: 5 }]);
  });
  it("a lost life is a hit and does not also count as a match", () => {
    expect(sounds(next({ combo: 3 }), next({ combo: 0, lives: 2 }))).toEqual(["hit"]);
  });
  it("a consumed shield is a block", () => {
    expect(sounds(next({ shieldActive: true }), base)).toEqual(["block"]);
  });
  it("gaining rainbow, shield or x2 is a pickup", () => {
    expect(sounds(base, next({ rainbowTimer: 6 }))).toEqual(["pickup"]);
    expect(sounds(base, next({ shieldActive: true }))).toEqual(["pickup"]);
    expect(sounds(base, next({ scoreX2Timer: 8 }))).toEqual(["pickup"]);
  });
  it("a colour change without a hit or a gate is the colour-switch pickup", () => {
    expect(sounds(base, next({ playerColorIndex: 2 }))).toEqual(["switch"]);
  });
  it("is silent between runs", () => {
    expect(sounds(next({ phase: "splash" }), next({ phase: "splash", combo: 3 }))).toEqual([]);
  });
});

describe("presentation: flashes and vignette", () => {
  it("perfect flashes harder than a plain match, hits flash red, game-over has no flash", () => {
    expect(flashFor({ sound: "perfect", level: 3 }, 1)!.strength).toBeGreaterThan(flashFor({ sound: "match", level: 3 }, 1)!.strength);
    expect(flashFor({ sound: "hit", level: 0 }, 2)!.color).toBe("#f0433a");
    expect(flashFor({ sound: "gameover", level: 0 }, 0)).toBeNull();
  });
  it("the vignette is off below x2, pulses above it and never exceeds 0.5", () => {
    expect(vignetteOpacity(1, false, 3)).toBe(0);
    expect(vignetteOpacity(2, false, 0)).toBeGreaterThan(0);
    for (let t = 0; t < 10; t += 0.1) expect(vignetteOpacity(9, true, t)).toBeLessThanOrEqual(0.5);
    expect(vignetteOpacity(1, true, 0)).toBeGreaterThan(0);
  });
});
