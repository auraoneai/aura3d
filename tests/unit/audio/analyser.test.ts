/**
 * parity-audio (L9-04 / AU-03) — `AudioAnalyser` round-trip over a fake
 * `AnalyserNode`: `createAudioAnalyser(source, fftSize)` must build the node on
 * the source's context (or an explicit one), connect the source into it, and
 * read back byte frequency/time-domain data like three.js `AudioAnalyser`.
 */
import { describe, expect, it } from "vitest";
import { AudioAnalyser, createAudioAnalyser } from "../../../packages/audio/src";
import { FakeAnalyser, FakeContext, FakeNode } from "./fake-context";

describe("createAudioAnalyser", () => {
  it("creates an analyser on the given context and taps the source", () => {
    const ctx = new FakeContext();
    const source = new FakeNode("source") as unknown as AudioNode;
    const tap = createAudioAnalyser(source, { context: ctx, fftSize: 512 });
    const analyser = ctx.ofKind<FakeAnalyser>("analyser")[0];
    expect(analyser.fftSize).toBe(512);
    expect((source as unknown as FakeNode).connectedTo[0]).toBe(tap.analyser);
    expect(tap.fftSize).toBe(512);
    expect(tap.frequencyBinCount).toBe(256);
  });

  it("accepts a bare fftSize number (the `createAnalyser(source, fftSize)` spelling)", () => {
    const ctx = new FakeContext();
    const tap = createAudioAnalyser(new FakeNode("s") as unknown as AudioNode, 1024, ctx);
    expect(tap.fftSize).toBe(1024);
  });

  it("derives the context from source.context when not passed explicitly", () => {
    const ctx = new FakeContext();
    const source = Object.assign(new FakeNode("source"), { context: ctx }) as unknown as AudioNode;
    const tap = new AudioAnalyser(source, { fftSize: 256 });
    expect(ctx.ofKind<FakeAnalyser>("analyser").length).toBe(1);
    expect(tap.fftSize).toBe(256);
  });

  it("defaults fftSize to the three.js value 2048", () => {
    const ctx = new FakeContext();
    const tap = createAudioAnalyser(new FakeNode("s") as unknown as AudioNode, { context: ctx });
    expect(tap.fftSize).toBe(2048);
  });
});

describe("AudioAnalyser data round trip", () => {
  it("getFrequencyData returns the analyser's byte spectrum; getAverageFrequency is its mean", () => {
    const ctx = new FakeContext();
    const tap = createAudioAnalyser(new FakeNode("s") as unknown as AudioNode, { context: ctx, fftSize: 256 });
    const analyser = ctx.ofKind<FakeAnalyser>("analyser")[0];
    analyser.fillFrequency = (target) => {
      for (let i = 0; i < target.length; i += 1) target[i] = i; // 0..127
    };
    const data = tap.getFrequencyData();
    expect(data.length).toBe(128);
    expect(data[5]).toBe(5);
    // Mean of 0..127 = 63.5
    expect(tap.getAverageFrequency()).toBeCloseTo(63.5, 9);
    // Same backing array each call — no per-frame allocation.
    expect(tap.getFrequencyData()).toBe(data);
  });

  it("getTimeDomainData returns the byte waveform", () => {
    const ctx = new FakeContext();
    const tap = createAudioAnalyser(new FakeNode("s") as unknown as AudioNode, { context: ctx, fftSize: 64 });
    const analyser = ctx.ofKind<FakeAnalyser>("analyser")[0];
    analyser.fillTimeDomain = (target) => target.fill(200);
    const wave = tap.getTimeDomainData();
    expect(wave.length).toBe(64);
    expect(wave[0]).toBe(200);
  });

  it("a silent spectrum averages to 0", () => {
    const ctx = new FakeContext();
    const tap = createAudioAnalyser(new FakeNode("s") as unknown as AudioNode, { context: ctx });
    const analyser = ctx.ofKind<FakeAnalyser>("analyser")[0];
    analyser.fillFrequency = (target) => target.fill(0);
    expect(tap.getAverageFrequency()).toBe(0);
  });
});

describe("AudioAnalyser guards", () => {
  it("throws when no context can supply createAnalyser", () => {
    const source = new FakeNode("s") as unknown as AudioNode;
    expect(() => new AudioAnalyser(source)).toThrow(/createAnalyser/);
    const ctx = new FakeContext();
    (ctx as unknown as { createAnalyser?: unknown }).createAnalyser = undefined; // shadow the prototype method
    expect(() => createAudioAnalyser(source, { context: ctx })).toThrow(/createAnalyser/);
  });

  it("rejects fftSize that is not a power of two in [32, 32768]", () => {
    const ctx = new FakeContext();
    const source = new FakeNode("s") as unknown as AudioNode;
    for (const bad of [0, 12, 100, 33_000, -256, 2 ** 20]) {
      expect(() => createAudioAnalyser(source, { context: ctx, fftSize: bad }), `fftSize=${bad}`).toThrow(/power of two/);
    }
    expect(() => createAudioAnalyser(source, { context: ctx, fftSize: 32_768 })).not.toThrow();
  });
});
