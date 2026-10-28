import { describe, expect, it } from "vitest";
import { BooleanKeyframeTrack, NumberKeyframeTrack, StringKeyframeTrack } from "../../../packages/animation/src/index";

// three's DiscreteInterpolant: a key's value applies from its own time, including exactly at that time.
describe("step tracks sample the key's own value at the key's time", () => {
  it("number track with step interpolation", () => {
    const track = NumberKeyframeTrack(".x", [0, 1, 2], [10, 20, 30], "step");
    expect(track.sample(0.99)).toBe(10);
    expect(track.sample(1)).toBe(20);
    expect(track.sample(1.5)).toBe(20);
    expect(track.sample(2)).toBe(30);
  });

  it("boolean and string tracks", () => {
    const flags = BooleanKeyframeTrack(".v", [0, 0.5, 1], [true, false, true]);
    expect([0.25, 0.5, 0.75, 1].map((t) => flags.sample(t))).toEqual([true, false, false, true]);
    const names = StringKeyframeTrack(".n", [0, 0.5, 1], ["a", "b", "c"]);
    expect([0.25, 0.5, 0.75, 1].map((t) => names.sample(t))).toEqual(["a", "b", "b", "c"]);
  });

  it("linear tracks are unchanged", () => {
    const track = NumberKeyframeTrack(".x", [0, 1], [0, 10]);
    expect(track.sample(0.5)).toBe(5);
    expect(track.sample(1)).toBe(10);
  });
});
