import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack.js";
import { isClipAdditive, makeClipAdditive } from "../../../packages/animation/src/pose/makeClipAdditive.js";
import type { Quat } from "../../../packages/animation/src/Keyframe.js";

function expectArrayClose(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 6));
}

describe("additive conversion", () => {
  it("subtracts the sampled reference for translation, color, scale and arbitrary width arrays", () => {
    const tracks = [
      new AnimationTrack({ target: "node.position", valueType: "vector3", keyframes: [{ time: 0, value: [1, 2, 3] }, { time: 1, value: [5, 0, 7] }] }),
      new AnimationTrack({ target: "node.scale", valueType: "vector3", keyframes: [{ time: 0, value: [1, 1, 1] }, { time: 1, value: [2, 3, 4] }] }),
      new AnimationTrack({ target: "node.color", valueType: "color", keyframes: [{ time: 0, value: [0.1, 0.2, 0.3] }, { time: 1, value: [0.7, 0.5, 0.4] }] }),
      new AnimationTrack({ target: "node.weights", valueType: "number-array", valueSize: 2, keyframes: [{ time: 0, value: [0.25, 0.5] }, { time: 1, value: [0.75, 0] }] })
    ];
    const source = new AnimationClip({ name: "poses", tracks });
    const result = makeClipAdditive(source);
    expectArrayClose(result.tracks[0]!.sample(1) as number[], [4, -2, 4]);
    expectArrayClose(result.tracks[1]!.sample(1) as number[], [1, 2, 3]);
    expectArrayClose(result.tracks[2]!.sample(1) as number[], [0.6, 0.3, 0.1]);
    expectArrayClose(result.tracks[3]!.sample(1) as number[], [0.5, -0.5]);
  });

  it("uses an explicit reference and transforms quaternion values by the inverse reference", () => {
    const h = Math.SQRT1_2;
    const track = new AnimationTrack<Quat>({ target: "bone.rotation", valueType: "quaternion", keyframes: [
      { time: 0, value: [0, 0, 0, 1] }, { time: 1, value: [0, h, 0, h] }
    ] });
    const clip = new AnimationClip({ name: "turn", tracks: [track] });
    const result = makeClipAdditive(clip, { clip, time: 1 });
    expectArrayClose(result.tracks[0]!.sample(0) as number[], [0, -h, 0, h]);
    expectArrayClose(result.tracks[0]!.sample(1) as number[], [0, 0, 0, 1]);
  });

  it.each(["cubicspline", "smooth", "bezier"] as const)("preserves %s scalar curves relative to the reference", (mode) => {
    const source = new AnimationClip({ name: "curve", tracks: [new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 2, interpolation: mode, outTangent: mode === "bezier" ? 5 : 3 },
      { time: 2, value: 4, inTangent: mode === "bezier" ? 1 : -2 }
    ] })] });
    const additive = makeClipAdditive(source);
    for (const time of [0, 0.2, 0.6, 1, 1.5, 2]) {
      expect(additive.tracks[0]!.sample(time)).toBeCloseTo((source.tracks[0]!.sample(time) as number) - 2, 6);
    }
  });

  it("rotates quaternion spline derivatives rather than normalizing them", () => {
    const h = Math.SQRT1_2;
    const source = new AnimationClip({ name: "rotation", tracks: [new AnimationTrack<Quat>({ target: "bone.q", valueType: "quaternion", keyframes: [
      { time: 0, value: [0, h, 0, h], interpolation: "cubicspline", outTangent: [2, 0, 0, 0] },
      { time: 1, value: [h, 0, 0, h], inTangent: [0, 0, 3, 0] }
    ] })] });
    const additive = makeClipAdditive(source);
    expectArrayClose(additive.tracks[0]!.keyframes[0]!.outTangent as number[], [2 * h, 0, 2 * h, 0]);
    expectArrayClose(additive.tracks[0]!.keyframes[1]!.inTangent as number[], [-3 * h, 0, 3 * h, 0]);
    for (const time of [0.2, 0.5, 0.8]) {
      const [x, y, z, w] = source.tracks[0]!.sample(time) as Quat;
      expectArrayClose(additive.tracks[0]!.sample(time) as number[], [h * (x - z), h * (y - w), h * (x + z), h * (w + y)]);
    }
  });

  it("passes discrete values through, preserves events and uses own first key for a missing reference target", () => {
    const source = new AnimationClip({ name: "states", tracks: [
      new AnimationTrack({ target: "flag", valueType: "boolean", keyframes: [{ time: 0, value: false }, { time: 1, value: true }] }),
      new AnimationTrack({ target: "label", valueType: "string", keyframes: [{ time: 0, value: "idle" }, { time: 1, value: "run" }] }),
      new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [{ time: 0, value: 3 }, { time: 1, value: 8 }] })
    ], events: [{ name: "step", time: 0.5 }] });
    const empty = new AnimationClip({ name: "bind", tracks: [] });
    const result = makeClipAdditive(source, { clip: empty, time: 0 });
    expect(isClipAdditive(result)).toBe(true);
    expect(isClipAdditive(source)).toBe(false);
    expect(result.events).toEqual([{ name: "step", time: 0.5 }]);
    expect(result.tracks[0]!.sample(1)).toBe(true);
    expect(result.tracks[1]!.sample(1)).toBe("run");
    expect(result.tracks[2]!.sample(1)).toBe(5);
  });

  it("rejects mismatched reference channels and non-finite reference time", () => {
    const source = new AnimationClip({ name: "source", tracks: [new AnimationTrack({ target: "x", valueType: "number-array", keyframes: [{ time: 0, value: [1, 2] }] })] });
    const mismatched = new AnimationClip({ name: "reference", tracks: [new AnimationTrack({ target: "x", valueType: "number-array", keyframes: [{ time: 0, value: [1, 2, 3] }] })] });
    expect(() => makeClipAdditive(source, { clip: mismatched })).toThrow(/ANIMATION_REFERENCE_INCOMPATIBLE/);
    expect(() => makeClipAdditive(source, NaN)).toThrow(/ANIMATION_REFERENCE_INVALID/);
  });
});
