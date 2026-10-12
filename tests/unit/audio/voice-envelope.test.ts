import { describe, expect, it } from "vitest";
import {
  ATTACK_S,
  RELEASE_S,
  VoicePool,
  brightnessRatio,
  isHarsh,
  seamlessLoopBuffer
} from "../../../packages/audio/src/game-sound/Voice";
import { mulberry32 } from "../../../packages/audio/src/game-sound/rng";
import { FakeBiquad, FakeContext, FakeGain, FakeNode, FakeSource } from "./fake-context";

/** Minimal AudioBuffer with real sample data. */
const buf = (data: Float32Array, sampleRate = 44_100): AudioBuffer =>
  ({
    length: data.length,
    sampleRate,
    numberOfChannels: 1,
    duration: data.length / sampleRate,
    getChannelData: () => data
  }) as unknown as AudioBuffer;

class BufferContext extends FakeContext {
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const chans = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      duration: length / sampleRate,
      getChannelData: (c: number) => chans[c]
    } as unknown as AudioBuffer;
  }
}

const sine = (hz: number, seconds: number, sr = 44_100, amp = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));

const noise = (n: number, seed = 3) => {
  const rng = mulberry32(seed);
  return Float32Array.from({ length: n }, () => rng() * 2 - 1);
};

const makePool = (ctx: FakeContext, buffer: AudioBuffer) =>
  new VoicePool({ ctx, rng: mulberry32(1), voiceCap: 32, now: () => 0, bufferFor: () => buffer });

describe("voice envelopes (no onset/stop clicks)", () => {
  it("ramps a new voice 0 → target over ATTACK_S", () => {
    const ctx = new BufferContext();
    ctx.currentTime = 2;
    const pool = makePool(ctx, buf(sine(440, 0.2)));
    const rec = pool.allocate("hit", { bus: "sfx", asset: { url: "a.wav" }, gainJitterDb: 0 }, new FakeNode("bus")).record!;
    const calls = (rec.gain as unknown as FakeGain).gain.calls;
    expect(calls[0]).toEqual({ method: "setValueAtTime", args: [0, 2] });
    expect(calls[1].method).toBe("linearRampToValueAtTime");
    expect(calls[1].args[1]).toBeCloseTo(2 + ATTACK_S, 9);
    expect(calls[1].args[0]).toBeCloseTo(rec.targetGain, 9);
  });

  it("release fades to 0 and stops the source RELEASE_S later instead of cutting it", () => {
    const ctx = new BufferContext();
    ctx.currentTime = 1;
    const pool = makePool(ctx, buf(sine(440, 0.2)));
    const rec = pool.allocate("hit", { bus: "sfx", asset: { url: "a.wav" } }, new FakeNode("bus")).record!;
    const stopAt: number[] = [];
    const src = rec.source as unknown as FakeSource;
    const origStop = src.stop.bind(src);
    src.stop = ((when?: number) => {
      stopAt.push(when ?? 0);
      origStop();
    }) as FakeSource["stop"];
    pool.release(rec);
    const calls = (rec.gain as unknown as FakeGain).gain.calls.slice(2);
    expect(calls.map((c) => c.method)).toEqual(["cancelScheduledValues", "setValueAtTime", "linearRampToValueAtTime"]);
    expect(calls[2].args).toEqual([0, 1 + RELEASE_S]);
    expect(stopAt).toEqual([1 + RELEASE_S]);
    expect(pool.liveCount).toBe(0);
  });
});

describe("loop seam repair", () => {
  it("a 55 Hz loop that ends mid-cycle is crossfaded so the wrap is continuous", () => {
    // 4.01 s of 55 Hz: the last sample lands far from the first (the turbo engine.wav defect).
    const data = sine(55, 4.0137);
    const jumpBefore = Math.abs(data[data.length - 1] - data[0]);
    const fixed = seamlessLoopBuffer(new BufferContext(), buf(data));
    const d = (fixed as unknown as { getChannelData(c: number): Float32Array }).getChannelData(0);
    const jumpAfter = Math.abs(d[d.length - 1] - d[0]);
    const maxStep = (2 * Math.PI * 55 * 0.5) / 44_100; // largest per-sample step of the sine
    expect(jumpBefore).toBeGreaterThan(20 * maxStep);
    expect(jumpAfter).toBeLessThan(2 * maxStep);
    expect(d.length).toBeLessThan(data.length);
  });

  it("clean loops are returned unchanged", () => {
    const data = sine(55, 1); // 55 whole cycles
    const b = buf(data);
    expect(seamlessLoopBuffer(new BufferContext(), b)).toBe(b);
  });

  it("the pool plays the repaired copy only for looping voices", () => {
    const ctx = new BufferContext();
    const raw = buf(sine(55, 4.0137));
    const pool = makePool(ctx, raw);
    const loop = pool.allocate("engine", { bus: "sfx", asset: { url: "e.wav" }, loop: true, cooldownMs: 0 }, new FakeNode("bus")).record!;
    const shot = pool.allocate("thud", { bus: "sfx", asset: { url: "e.wav" }, cooldownMs: 0 }, new FakeNode("bus")).record!;
    expect((loop.source as unknown as FakeSource).buffer).not.toBe(raw);
    expect((shot.source as unknown as FakeSource).buffer).toBe(raw);
  });
});

describe("harsh content low-pass", () => {
  it("brightness: low tones well below, white noise well above the threshold", () => {
    expect(brightnessRatio(buf(sine(220, 0.2)))).toBeLessThan(0.01);
    expect(brightnessRatio(buf(sine(1000, 0.2)))).toBeLessThan(0.1);
    expect(brightnessRatio(buf(noise(8820)))).toBeGreaterThan(1.5);
    expect(isHarsh(buf(noise(8820)))).toBe(true);
    expect(isHarsh(buf(sine(440, 0.2)))).toBe(false);
  });

  it("noise bursts route through a low-pass; tonal hits do not", () => {
    const ctx = new BufferContext();
    makePool(ctx, buf(noise(8820))).allocate("swish", { bus: "sfx", asset: { url: "s.wav" } }, new FakeNode("bus"));
    const [lp] = ctx.ofKind<FakeBiquad>("biquad");
    expect(lp).toBeDefined();
    expect(lp.type).toBe("lowpass");
    expect(lp.frequency.value).toBeLessThanOrEqual(8000);
    const tonal = new BufferContext();
    makePool(tonal, buf(sine(440, 0.2))).allocate("chime", { bus: "sfx", asset: { url: "c.wav" } }, new FakeNode("bus"));
    expect(tonal.ofKind("biquad")).toHaveLength(0);
  });
});
