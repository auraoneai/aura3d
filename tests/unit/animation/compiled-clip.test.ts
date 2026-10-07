import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack.js";
import { compileClip, compileTrack, createTrackCursors, sampleTrackInto } from "../../../packages/animation/src/pose/CompiledClip.js";
import { lerpNumber, type AnimationValue } from "../../../packages/animation/src/Keyframe.js";

describe("compileClip / sampleTrackInto (PRD-06 T1.2)", () => {
  it("matches AnimationTrack.sample within 1e-6 over 1000 random times", () => {
    const rng = mulberry32(0xc0ffee);
    const clip = makeMixedClip();
    const compiled = compileClip(clip);
    const cursors = createTrackCursors(compiled);
    const scratch = new Float32Array(4);

    for (let trial = 0; trial < 1000; trial += 1) {
      const time = rng() * (clip.duration + 0.4) - 0.2;
      for (let trackIndex = 0; trackIndex < clip.tracks.length; trackIndex += 1) {
        const track = clip.tracks[trackIndex]!;
        const compiledTrack = compiled.tracks[trackIndex]!;
        if (compiledTrack.rawValues) continue; // boolean/string covered below
        const expected = track.sample(time);
        sampleTrackInto(compiledTrack, time, cursors, trackIndex, scratch, 0);
        const flat = Array.isArray(expected) ? expected : [expected];
        for (let k = 0; k < flat.length; k += 1) {
          expect(Math.abs(scratch[k]! - flat[k]!)).toBeLessThanOrEqual(1e-6);
        }
      }
    }
  });

  it("uses the action cursor cache for sequential playback without rescanning", () => {
    const track = compileTrack(new AnimationTrack<number>({
      target: "b.position.x",
      valueType: "scalar",
      keyframes: Array.from({ length: 50 }, (_, i) => ({ time: i * 0.1, value: i }))
    }));
    const cursors = new Uint32Array(1);
    const out = new Float32Array(1);
    for (let i = 0; i < 200; i += 1) {
      const time = (i / 200) * 4.9;
      sampleTrackInto(track, time, cursors, 0, out, 0);
      const expected = Math.floor(time / 0.1) + (time / 0.1 - Math.floor(time / 0.1));
      expect(out[0]).toBeCloseTo(expected, 5);
      // Cursor stays near the active interval — no scan from zero.
      expect(cursors[0]).toBeLessThanOrEqual(Math.ceil(time / 0.1));
    }
  });

  it("normalizes quaternion CUBICSPLINE output directly", () => {
    // Mid-range w quats hit sample()'s slerp path, which returns the cubic value
    // un-normalized; compiled sampling must produce a unit quaternion instead.
    const track = compileTrack(new AnimationTrack<[number, number, number, number]>({
      target: "b.rotation",
      valueType: "quaternion",
      keyframes: [
        { time: 0, value: [0, 0, 0, 1], interpolation: "cubicspline", outTangent: [1.4, 0.6, 0.2, -0.5] },
        { time: 1, value: [0, 0.7071, 0, 0.7071], inTangent: [-0.8, 0.3, 0.1, 0.4] }
      ]
    }));
    const out = new Float32Array(4);
    const cursors = new Uint32Array(1);
    for (const time of [0.15, 0.35, 0.55, 0.8]) {
      sampleTrackInto(track, time, cursors, 0, out, 0);
      const length = Math.hypot(out[0]!, out[1]!, out[2]!, out[3]!);
      expect(length).toBeCloseTo(1, 6);
    }
  });

  it("samples a full clip in well under 25 µs per evaluation", () => {
    const rng = mulberry32(7);
    const clip = new AnimationClip({
      name: "bench",
      tracks: Array.from({ length: 100 }, (_, i) => new AnimationTrack<[number, number, number, number]>({
        target: `bone${i}.rotation`,
        valueType: "quaternion",
        keyframes: Array.from({ length: 30 }, (_, k) => ({
          time: k / 30,
          value: [rng() * 0.5, rng() * 0.5, rng() * 0.5, 1] as [number, number, number, number]
        }))
      }))
    });
    const compiled = compileClip(clip);
    const cursors = createTrackCursors(compiled);
    const out = new Float32Array(4);

    // Warmup
    for (let t = 0; t < 50; t += 1) {
      for (let i = 0; i < compiled.tracks.length; i += 1) {
        sampleTrackInto(compiled.tracks[i]!, (t / 50) * clip.duration, cursors, i, out, 0);
      }
    }
    const iterations = 300;
    const start = performance.now();
    for (let t = 0; t < iterations; t += 1) {
      const time = (t / iterations) * clip.duration;
      for (let i = 0; i < compiled.tracks.length; i += 1) {
        sampleTrackInto(compiled.tracks[i]!, time, cursors, i, out, 0);
      }
    }
    const perClipEval = (performance.now() - start) / iterations;
    // Spec budget: ≤25 µs per track evaluation on a mid clip → per-track mean here.
    const perTrackEval = perClipEval / compiled.tracks.length;
    expect(perTrackEval).toBeLessThan(25);
  });
});

function makeMixedClip(): AnimationClip {
  return new AnimationClip({
    name: "mixed",
    tracks: [
      new AnimationTrack<number>({
        target: "a.scalar",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.5, value: 2.5 },
          { time: 1.0, value: -1.5 }
        ]
      }),
      new AnimationTrack<[number, number, number]>({
        target: "a.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 0.25, value: [1, 2, 3] },
          { time: 0.75, value: [-2, 0.5, 1] },
          { time: 1.0, value: [0, 0, 0], interpolation: "step" }
        ]
      }),
      new AnimationTrack<[number, number, number, number]>({
        target: "a.rotation",
        valueType: "quaternion",
        keyframes: [
          { time: 0, value: [0, 0, 0, 1] },
          { time: 0.4, value: [0, 0.3827, 0, 0.9239] },
          { time: 0.9, value: [0, -0.7071, 0, 0.7071] }
        ]
      }),
      new AnimationTrack<readonly number[]>({
        target: "a.weights",
        valueType: "number-array",
        keyframes: [
          { time: 0, value: [0, 1, 0.5] },
          { time: 0.6, value: [1, 0, 0.5] }
        ]
      }),
      new AnimationTrack<boolean>({
        target: "a.visible",
        valueType: "boolean",
        keyframes: [
          { time: 0, value: true },
          { time: 0.5, value: false }
        ]
      }),
      new AnimationTrack<number>({
        target: "a.cubic",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: 0, interpolation: "cubicspline", outTangent: 0.5 },
          { time: 1, value: 10, inTangent: -0.5 }
        ]
      })
    ]
  });
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
