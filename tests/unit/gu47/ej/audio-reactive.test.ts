/**
 * GU47 WP-10 (E-J) optional item: `audioReactive`, an allocation-free juice
 * binding on `AudioAnalyser` (band envelope, attack/release, range mapping,
 * reduced motion).
 */
import { describe, expect, it } from "vitest";
import { AudioAnalyser } from "@aura3d/audio";
import { audioReactive, type AudioReactiveSource } from "../../../../packages/game/src/juice/audioReactive.js";

/** A spectrum source that reuses one buffer, like `AudioAnalyser`, and counts reads. */
function spectrum(bins: number): { source: AudioReactiveSource; data: Uint8Array; reads: () => number } {
  const data = new Uint8Array(bins);
  let reads = 0;
  return { source: { getFrequencyData: () => { reads += 1; return data; } }, data, reads: () => reads };
}

/** Minimal Web Audio fakes: `createAnalyser` fills the byte spectrum from `levels`. */
function fakeAnalyserGraph(levels: Uint8Array) {
  const analyserNode = {
    fftSize: 0,
    get frequencyBinCount() { return this.fftSize / 2; },
    minDecibels: -100,
    maxDecibels: -30,
    smoothingTimeConstant: 0.8,
    getByteFrequencyData(out: Uint8Array) { out.set(levels.subarray(0, out.length)); },
    getByteTimeDomainData(out: Uint8Array) { out.fill(128); },
    disconnect() {}
  };
  const context = { createAnalyser: () => analyserNode };
  const source = { context, connect: () => undefined };
  return { source: source as unknown as AudioNode, analyserNode };
}

describe("GU47 WP-10 audioReactive", () => {
  it("drives a value from a real AudioAnalyser band (bass band of a 64-bin spectrum)", () => {
    const levels = new Uint8Array(64);
    levels.fill(255, 0, 8); // energy only in the lowest eighth
    const { source } = fakeAnalyserGraph(levels);
    const analyser = new AudioAnalyser(source, { fftSize: 128 });
    const bass = audioReactive(analyser, { band: [0, 0.125], attack: 0, release: 0, floor: 0 });
    const treble = audioReactive(analyser, { band: [0.5, 1], attack: 0, release: 0, floor: 0 });
    expect(bass.update(1 / 60)).toBe(1);
    expect(treble.update(1 / 60)).toBe(0);
  });

  it("removes the noise floor, applies gain and clamps to 0..1", () => {
    const { source, data } = spectrum(16);
    const binding = audioReactive(source, { attack: 0, release: 0, floor: 0.2, gain: 2 });
    data.fill(Math.round(0.2 * 255));
    expect(binding.update(0.016)).toBeCloseTo(0, 2);
    data.fill(Math.round(0.4 * 255));
    expect(binding.update(0.016)).toBeCloseTo(0.5, 2); // (0.4 - 0.2) / 0.8 * 2
    data.fill(255);
    expect(binding.update(0.016)).toBe(1);
  });

  it("rises with the attack constant, falls with the release constant, and holds on dt 0", () => {
    const { source, data } = spectrum(8);
    const binding = audioReactive(source, { attack: 0.1, release: 0.5, floor: 0 });
    data.fill(255);
    expect(binding.update(0.1)).toBeCloseTo(1 - Math.exp(-1), 5);
    const peak = binding.level;
    expect(binding.update(0)).toBe(peak);
    data.fill(0);
    expect(binding.update(0.1)).toBeCloseTo(peak * Math.exp(-0.2), 5);
    expect(binding.update(Number.NaN)).toBeCloseTo(peak * Math.exp(-0.2), 5);
  });

  it("maps the envelope onto range and hands every value to apply", () => {
    const { source, data } = spectrum(4);
    const applied: number[] = [];
    const binding = audioReactive(source, { attack: 0, release: 0, floor: 0, range: [0.5, 3], apply: (v) => applied.push(v) });
    expect(binding.value).toBe(0.5);
    data.fill(255);
    expect(binding.update(0.016)).toBe(3);
    data.fill(0);
    binding.update(0.016);
    expect(applied).toEqual([3, 0.5]);
  });

  it("rests at range[0] without reading the analyser under reduced motion, and reset drops to rest", () => {
    const { source, data, reads } = spectrum(4);
    let reduced = false;
    const binding = audioReactive(source, { attack: 0, release: 0, floor: 0, range: [1, 2], reducedMotion: () => reduced });
    data.fill(255);
    expect(binding.update(0.016)).toBe(2);
    reduced = true;
    expect(binding.update(0.016)).toBe(1);
    expect(binding.level).toBe(0);
    expect(reads()).toBe(1);
    reduced = false;
    binding.update(0.016);
    binding.reset();
    expect([binding.value, binding.level]).toEqual([1, 0]);
  });

  it("reads the analyser's reused buffer once per update and never writes to it", () => {
    const { source, data, reads } = spectrum(32);
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 37) % 256;
    const before = Uint8Array.from(data);
    const binding = audioReactive(source, { band: [0.25, 0.75] });
    for (let i = 0; i < 1000; i += 1) expect(typeof binding.update(1 / 60)).toBe("number");
    expect(reads()).toBe(1000);
    expect(data).toEqual(before);
  });

  it("handles an empty spectrum and rejects an empty band", () => {
    const { source } = spectrum(0);
    expect(audioReactive(source, { attack: 0 }).update(0.016)).toBe(0);
    expect(() => audioReactive(source, { band: [0.5, 0.5] })).toThrow(RangeError);
    expect(() => audioReactive(source, { band: [0.8, 0.2] })).toThrow(RangeError);
  });
});
