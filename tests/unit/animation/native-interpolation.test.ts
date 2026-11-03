import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationMixer } from "../../../packages/animation/src/AnimationMixer.js";
import { AnimationTrack, VectorKeyframeTrack } from "../../../packages/animation/src/AnimationTrack.js";
import { arraySlice, convertArray, getKeyframeOrder, isTypedArray, merge, optimize, sortedArray, subclip, trimClip } from "../../../packages/animation/src/AnimationUtils.js";
import { compileClip, compileTrack, sampleTrackInto, sampleTrackRaw } from "../../../packages/animation/src/pose/CompiledClip.js";
import { decompileCompiledClip } from "../../../packages/animation/src/pose/Retarget.js";
import type { AnimationValue, InterpolationMode } from "../../../packages/animation/src/Keyframe.js";

function near(actual: AnimationValue, expected: AnimationValue, precision = 5): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as readonly number[]).length).toBe(expected.length);
    expected.forEach((value, i) => expect((actual as readonly number[])[i]).toBeCloseTo(value, precision));
  } else if (typeof expected === "number") {
    expect(actual as number).toBeCloseTo(expected, precision);
  } else expect(actual).toBe(expected);
}

describe("native interpolation", () => {
  it("sorts flat value groups stably and validates invalid permutations", () => {
    expect(arraySlice(new Float32Array([1, 2, 3, 4]), 1, 3)).toEqual([2, 3]);
    expect(convertArray(new Float32Array([1, 2]))).toEqual([1, 2]);
    expect(isTypedArray(new Float32Array(1))).toBe(true);
    expect(isTypedArray(new DataView(new ArrayBuffer(4)))).toBe(false);
    expect(getKeyframeOrder([2, 1, 2, 1])).toEqual([1, 3, 0, 2]);
    expect(Array.from(sortedArray(new Float32Array([10, 11, 20, 21]), 2, [1, 0]))).toEqual([20, 21, 10, 11]);
    expect(() => sortedArray([1, 2, 3, 4], 2, [0, 0])).toThrow(/permutation/);
  });

  it("computes smooth derivatives from time-spaced neighbors and one-sided endpoints", () => {
    const track = new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: "smooth" },
      { time: 1, value: 2, interpolation: "smooth" },
      { time: 3, value: 2 }
    ] });
    expect(track.sample(0)).toBe(0);
    expect(track.sample(0.5)).toBeCloseTo(7 / 6, 8);
    expect(track.sample(2)).toBeCloseTo(13 / 6, 8);
    expect(track.sample(3)).toBe(2);
  });

  it("uses absolute Bézier controls and glTF derivatives as separate modes", () => {
    const track = (mode: "bezier" | "cubicspline") => new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: mode, outTangent: 6 },
      { time: 2, value: 10, inTangent: 3 }
    ] });
    expect(track("bezier").sample(0.5)).toBeCloseTo(3.109375, 8);
    expect(track("cubicspline").sample(0.5)).toBeCloseTo(2.96875, 8);
    expect(track("bezier").sample(0)).toBe(0);
    expect(track("bezier").sample(2)).toBe(10);
  });

  it("accepts explicit vector widths, serializes the width and validates malformed values eagerly", () => {
    const two = VectorKeyframeTrack("node.uv", [0, 1], [0, 2, 2, 4], "linear", 2);
    expect(two.valueSize).toBe(2);
    expect(two.sample(0.25)).toEqual([0.5, 2.5]);
    expect(AnimationTrack.fromJSON(two.toJSON()).sample(0.25)).toEqual([0.5, 2.5]);
    expect(VectorKeyframeTrack("node.one", [0, 1], [0, 2], "linear", 1).sample(0.5)).toEqual([1]);
    expect(() => new AnimationTrack({ target: "x", valueType: "number-array", valueSize: 2, keyframes: [{ time: 0, value: [1, 2] }, { time: 1, value: [1] }] })).toThrow(/2 finite components/);
    expect(() => new AnimationTrack({ target: "x", valueType: "vector3", keyframes: [{ time: 0, value: [1, 2, Infinity] }] })).toThrow(/finite components/);
    expect(() => new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [{ time: 0, value: 0, interpolation: "bezier" }, { time: 1, value: 1 }] })).toThrow(/outTangent/);
    try {
      new AnimationTrack({ target: "x", valueType: "boolean", keyframes: [{ time: 0, value: false, interpolation: "smooth" }, { time: 1, value: true }] });
      throw new Error("expected unsupported interpolation to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "ANIMATION_INTERPOLATION_UNSUPPORTED", field: "keyframes[0].interpolation" });
    }
    try {
      new AnimationTrack({ target: "x", valueType: "boolean", keyframes: [{ time: 0, value: false, outTangent: true }] });
      throw new Error("expected a discrete tangent to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "ANIMATION_TANGENT_UNSUPPORTED", field: "keyframes[0].outTangent" });
    }
  });

  it("matches compiled playback for color, one-component arrays and all curve modes in either sampling direction", () => {
    const tracks = [
      new AnimationTrack({ target: "node.color", valueType: "color", keyframes: [{ time: 0, value: [1, 0, 0] }, { time: 1, value: [0, 0, 1] }] }),
      VectorKeyframeTrack("node.weight", [0, 1], [0, 2], "linear", 1),
      ...(["smooth", "cubicspline", "bezier"] as const).map((mode) => new AnimationTrack({ target: mode, valueType: "number-array", valueSize: 2, keyframes: [
        { time: 0, value: [0, 3], interpolation: mode, outTangent: [2, -1] },
        { time: 1, value: [1, 4], inTangent: [-1, 2] }
      ] })),
      new AnimationTrack({ target: "node.rotation", valueType: "quaternion", keyframes: [
        { time: 0, value: [0, 0, 0, 1], interpolation: "cubicspline", outTangent: [1, 1, 0, 0] },
        { time: 1, value: [0, 0.707106781, 0, 0.707106781], inTangent: [0, 1, 0, -0.5] }
      ] })
    ];
    for (const track of tracks) {
      const compiled = compileTrack(track);
      const cursor = new Uint32Array(1);
      const output = new Float32Array(compiled.stride);
      for (const time of [0, 0.1, 0.33, 0.75, 1, 0.6, 0.2, 0]) {
        sampleTrackInto(compiled, time, cursor, 0, output, 0);
        near(compiled.valueType === "scalar" ? output[0]! : [...output], track.sample(time));
        near(sampleTrackRaw(compiled, time, cursor, 0), track.sample(time));
      }
    }
    const steps = compileTrack(new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 2, interpolation: "step" }, { time: 1, value: 3, interpolation: "step" }, { time: 2, value: 4 }
    ] }));
    const out = new Float32Array(1);
    sampleTrackInto(steps, 1, new Uint32Array(1), 0, out, 0);
    expect(out[0]).toBe(3);
    const closelySpaced = compileTrack(new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: "step" }, { time: 1, value: 1, interpolation: "step" },
      { time: 1 + 1e-9, value: 2, interpolation: "step" }, { time: 2, value: 3 }
    ] }));
    const cursor = new Uint32Array(1);
    sampleTrackInto(closelySpaced, 1 + 0.5e-9, cursor, 0, out, 0);
    expect(out[0]).toBe(1);
    sampleTrackInto(closelySpaced, 1 + 1e-9, cursor, 0, out, 0);
    expect(out[0]).toBe(2);
    expect(() => sampleTrackInto(closelySpaced, NaN, cursor, 0, out, 0)).toThrow(/finite/);
  });

  it.each(["step", "linear", "smooth", "cubicspline", "bezier"] as InterpolationMode[])("preserves %s through serialization, optimization and exact trimming", (mode) => {
    const source = new AnimationClip({ name: "curve", duration: 4, tracks: [new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: mode, outTangent: 3 },
      { time: 1, value: 2, interpolation: mode, inTangent: -1, outTangent: 4 },
      { time: 3, value: 1, interpolation: mode, inTangent: 2, outTangent: -2 },
      { time: 4, value: 3, inTangent: 5 }
    ] })] });
    const restored = AnimationClip.fromJSON(source.toJSON());
    const optimized = optimize(restored);
    const cut = trimClip(optimized, 0.3, 3.7);
    for (let i = 0; i <= 34; i++) {
      const time = 0.3 + i * 0.1;
      near(restored.tracks[0]!.sample(time), source.tracks[0]!.sample(time));
      near(optimized.tracks[0]!.sample(time), source.tracks[0]!.sample(time));
      near(cut.tracks[0]!.sample(time - 0.3), source.tracks[0]!.sample(time));
    }
    expect(restored.tracks[0]!.keyframes[1]!.outTangent).toBe(4);
  });

  it("preserves automatic smooth tangents when frame subclips discard neighboring keys", () => {
    const source = new AnimationClip({ name: "source", tracks: [new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: "smooth" }, { time: 1, value: 4, interpolation: "smooth" },
      { time: 2, value: 1, interpolation: "smooth" }, { time: 3, value: 2 }
    ] })] });
    const cut = subclip(source, "middle", 1, 3, 1);
    for (const t of [0, 0.2, 0.5, 0.8, 1]) near(cut.tracks[0]!.sample(t), source.tracks[0]!.sample(t + 1));
  });

  it("trims quaternion curves and holds values outside the track range", () => {
    const source = new AnimationClip({ name: "rot", duration: 3, tracks: [new AnimationTrack({ target: "q", valueType: "quaternion", keyframes: [
      { time: 0.5, value: [0, 0, 0, 1], interpolation: "bezier", outTangent: [0.5, 0.2, 0.3, 1] },
      { time: 2.5, value: [0, 0.707106781, 0, 0.707106781], inTangent: [-0.2, 0.7, 0.1, 0.8] }
    ] })] });
    const cut = trimClip(source, 0.8, 2.3);
    for (const t of [0, 0.1, 0.4, 0.75, 1.2, 1.5]) near(cut.tracks[0]!.sample(t), source.tracks[0]!.sample(t + 0.8));
    const held = trimClip(source, 0, 3);
    near(held.tracks[0]!.sample(0.25), source.tracks[0]!.sample(0.25));
    near(held.tracks[0]!.sample(2.75), source.tracks[0]!.sample(2.75));
  });

  it("retains both incoming and outgoing tangents at a merged clip boundary", () => {
    const left = new AnimationClip({ name: "left", tracks: [new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: "cubicspline", outTangent: 1 }, { time: 1, value: 1, inTangent: 2 }
    ] })] });
    const right = new AnimationClip({ name: "right", tracks: [new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [
      { time: 0, value: 1, interpolation: "bezier", outTangent: 4 }, { time: 1, value: 2, inTangent: -1 }
    ] })] });
    const joined = merge([left, right]);
    expect(joined.tracks[0]!.keyframes[1]!.inTangent).toBe(2);
    expect(joined.tracks[0]!.keyframes[1]!.outTangent).toBe(4);
    for (const t of [0, 0.2, 0.8, 1]) near(joined.tracks[0]!.sample(t), left.tracks[0]!.sample(t));
    for (const t of [0, 0.3, 0.7, 1]) near(joined.tracks[0]!.sample(t + 1), right.tracks[0]!.sample(t));
  });

  it("plays curve samples through the mixer during a timed crossfade and reverse playback", () => {
    const curve = new AnimationClip({ name: "curve", tracks: [new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 0, interpolation: "bezier", outTangent: 6 }, { time: 2, value: 10, inTangent: 3 }
    ] })] });
    const constant = new AnimationClip({ name: "constant", duration: 2, tracks: [new AnimationTrack({ target: "node.x", valueType: "scalar", keyframes: [
      { time: 0, value: 8 }, { time: 2, value: 8 }
    ] })] });
    let applied: AnimationValue | undefined;
    const mixer = new AnimationMixer({ setAnimationValue: (_target, value) => { applied = value; } });
    const from = mixer.play(curve);
    const to = mixer.play(constant).setWeight(0);
    mixer.crossFade(from, to, 1);
    mixer.update(0.5);
    expect(from.weight).toBeCloseTo(0.5);
    expect(to.weight).toBeCloseTo(0.5);
    expect(applied).toBeCloseTo((3.109375 + 8) / 2);
    mixer.setTimeScale(-1);
    mixer.update(0.25);
    expect(from.time).toBeCloseTo(0.25);
    expect(to.time).toBeCloseTo(0.25);
    expect(applied).toBeCloseTo((curve.tracks[0]!.sample(0.25) as number) * 0.25 + 8 * 0.75);
  });

  it("keeps a subclip long enough for retained events after the last selected key", () => {
    const clip = new AnimationClip({ name: "events", duration: 4, tracks: [new AnimationTrack({ target: "x", valueType: "scalar", keyframes: [
      { time: 0, value: 1 }, { time: 1, value: 2 }, { time: 3, value: 4 }
    ] })], events: [{ name: "event", time: 2.5 }] });
    const part = subclip(clip, "middle", 1, 3, 1);
    expect(part.duration).toBe(1.5);
    expect(part.events).toEqual([{ name: "event", time: 1.5 }]);
    expect(part.tracks[0]!.sample(1.5)).toBe(2);
  });

  it("decompiles scalar, discrete, arbitrary-width and curved compiled clips with authored metadata", () => {
    const original = new AnimationClip({ name: "mixed", duration: 2, tracks: [
      new AnimationTrack({ target: "scalar", valueType: "scalar", keyframes: [
        { time: 0, value: 1 + 2 ** -30, interpolation: "cubicspline", outTangent: 3 + 2 ** -30 },
        { time: 1, value: 2, interpolation: "smooth", inTangent: -1 },
        { time: 2, value: 4 }
      ] }),
      new AnimationTrack({ target: "color", valueType: "color", keyframes: [
        { time: 0, value: [0, 1, 2], interpolation: "bezier", outTangent: [1, 2, 3] },
        { time: 2, value: [3, 2, 1], inTangent: [-1, 0, 1] }
      ] }),
      new AnimationTrack({ target: "width1", valueType: "number-array", valueSize: 1, keyframes: [
        { time: 0, value: [0], interpolation: "step" },
        { time: 1, value: [1], interpolation: "linear", outTangent: [4] },
        { time: 1 + 1e-9, value: [2] }
      ] }),
      new AnimationTrack({ target: "flag", valueType: "boolean", keyframes: [{ time: 0, value: false }, { time: 1, value: true }] }),
      new AnimationTrack({ target: "state", valueType: "string", keyframes: [{ time: 0, value: "idle" }, { time: 1, value: "run" }] })
    ], events: [{ name: "marker", time: 1, payload: { n: 1 } }] });
    const decompiled = decompileCompiledClip("recovered", compileClip(original));
    expect(decompiled.events).toEqual(original.events);
    expect(decompiled.tracks[0]!.keyframes[0]!.value).toBe(1 + 2 ** -30);
    expect(decompiled.tracks[0]!.keyframes[0]!.outTangent).toBe(3 + 2 ** -30);
    expect(decompiled.tracks[2]!.valueSize).toBe(1);
    expect(decompiled.tracks[2]!.keyframes[2]!.time).toBe(1 + 1e-9);
    expect(decompiled.tracks[2]!.keyframes[1]!.interpolation).toBe("linear");
    expect(decompiled.tracks[2]!.keyframes[1]!.outTangent).toEqual([4]);
    expect(decompiled.tracks[0]!.keyframes[1]!.outTangent).toBeUndefined();
    for (let i = 0; i < original.tracks.length; i++) {
      for (const t of [0, 0.1, 0.5, 1, 1 + 1e-9, 1.3, 2]) near(decompiled.tracks[i]!.sample(t), original.tracks[i]!.sample(t));
    }
  });
});
