import { describe, expect, it } from "vitest";
import { gainForTarget, measureLoudness } from "../../../packages/audio/src/game-sound/loudness";

const sine = (freq: number, seconds: number, sampleRate = 48_000, amplitude = 1): Float32Array => {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
};

describe("game-sound loudness (BS.1770)", () => {
  it("measures a full-scale 1 kHz sine near the BS.1770 reference (−3.01 LUFS)", () => {
    const m = measureLoudness({ channels: [sine(1000, 2)], sampleRate: 48_000 });
    // EBU tech 3341: stereo pair of full-scale 1kHz sines = 0 LUFS; mono = −3.01 LUFS.
    expect(m.lufs).toBeGreaterThan(-3.6);
    expect(m.lufs).toBeLessThan(-2.4);
    expect(m.truePeakDb).toBeCloseTo(0, 1);
  });

  it("attenuates loudness linearly for quieter signals", () => {
    const full = measureLoudness({ channels: [sine(1000, 2, 48_000, 1)], sampleRate: 48_000 });
    const half = measureLoudness({ channels: [sine(1000, 2, 48_000, 0.5)], sampleRate: 48_000 });
    expect(full.lufs - half.lufs).toBeCloseTo(6.02, 1);
  });

  it("reports -Infinity lufs for silence and for signals shorter than one block", () => {
    const silent = measureLoudness({ channels: [new Float32Array(48_000)], sampleRate: 48_000 });
    expect(silent.lufs).toBe(Number.NEGATIVE_INFINITY);
    const short = measureLoudness({ channels: [sine(1000, 0.1)], sampleRate: 48_000 });
    expect(short.lufs).toBe(Number.NEGATIVE_INFINITY);
    expect(short.truePeakDb).toBeCloseTo(0, 1);
  });

  it("captures inter-sample true peak above digital peak", () => {
    // Constructed worst case: alternating near-full-scale at Fs/2-adjacent content
    // where the intersample peak exceeds the sample peak.
    const n = 48_000;
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = 0.9 * Math.sin((2 * Math.PI * 12_000 * i) / 48_000 + Math.PI / 4);
    const m = measureLoudness({ channels: [ch], sampleRate: 48_000 });
    expect(m.truePeakDb).toBeGreaterThan(20 * Math.log10(0.9));
    expect(m.truePeakDb).toBeLessThan(0.5);
  });

  it("gainForTarget: one-shots aim at −1 dBTP, loops at −20 LUFS", () => {
    const m = measureLoudness({ channels: [sine(1000, 2)], sampleRate: 48_000 });
    expect(gainForTarget(m, "one-shot")).toBeCloseTo(-1 - m.truePeakDb, 1);
    expect(gainForTarget(m, "loop")).toBeCloseTo(-20 - m.lufs, 1);
    expect(gainForTarget({ lufs: Number.NEGATIVE_INFINITY, truePeakDb: -Infinity, durationSeconds: 0 }, "loop")).toBe(0);
  });
});
