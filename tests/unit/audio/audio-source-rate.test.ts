import { describe, expect, it } from "vitest";
import { AudioSource } from "../../../packages/audio/src/AudioSource";
import { PositionalEmitter } from "../../../packages/audio/src/PositionalEmitter";
import type { AudioClip } from "../../../packages/audio/src/AudioClip";
import type { AudioContextLike } from "../../../packages/audio/src/AudioContextManager";
import { FakeContext, FakeSource } from "./fake-context";

const clip = () =>
  ({
    buffer: { duration: 1, length: 48_000, sampleRate: 48_000, numberOfChannels: 1 } as AudioBuffer,
    duration: 1,
    name: "clip"
  }) as unknown as AudioClip;

const asCtx = (ctx: FakeContext) => ctx as unknown as AudioContextLike;

describe("AudioSource.setPlaybackRate (PRD-09 §7.5/1724)", () => {
  it("rejects non-positive / non-finite rates", () => {
    const ctx = new FakeContext();
    const src = new AudioSource({ context: asCtx(ctx), clip: clip() });
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => src.setPlaybackRate(bad)).toThrow(RangeError);
    }
  });

  it("idle source stores the rate; play() applies it to the new node", () => {
    const ctx = new FakeContext();
    const src = new AudioSource({ context: asCtx(ctx), clip: clip() });
    src.setPlaybackRate(1.5);
    src.play();
    const node = ctx.ofKind<FakeSource>("source")[0];
    expect(node.playbackRate.value).toBe(1.5);
    expect(src.playbackRate).toBe(1.5);
  });

  it("playing source ramps via setTargetAtTime (τ = rampMs/3 s)", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 0.25;
    const src = new AudioSource({ context: asCtx(ctx), clip: clip() });
    src.play();
    src.setPlaybackRate(1.2, 60);
    const node = ctx.ofKind<FakeSource>("source")[0];
    expect(node.playbackRate.calls[0]).toEqual({
      method: "setTargetAtTime",
      args: [1.2, 0.25, 0.02]
    });
  });

  it("rampMs=0 assigns the param directly", () => {
    const ctx = new FakeContext();
    const src = new AudioSource({ context: asCtx(ctx), clip: clip() });
    src.play();
    src.setPlaybackRate(0.8);
    const node = ctx.ofKind<FakeSource>("source")[0];
    expect(node.playbackRate.calls.length).toBe(0);
    expect(node.playbackRate.value).toBe(0.8);
  });
});

describe("PositionalEmitter doppler → playbackRate (PRD-09 1725)", () => {
  it("two update() passes with different closing speeds produce two ramped rates", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 1;
    const emitter = new PositionalEmitter({
      context: asCtx(ctx),
      clip: clip(),
      position: { x: 10, y: 0, z: 0 },
      velocity: { x: -50, y: 0, z: 0 },
      doppler: { enabled: true }
    });
    emitter.play();
    const e1 = emitter.update({ x: 0, y: 0, z: 0 });
    expect(e1.dopplerShift).toBeGreaterThan(1); // closing → pitch up
    emitter.setVelocity({ x: -10, y: 0, z: 0 });
    const e2 = emitter.update({ x: 0, y: 0, z: 0 });
    expect(e2.dopplerShift).toBeLessThan(e1.dopplerShift);
    const node = ctx.ofKind<FakeSource>("source")[0];
    const ramps = node.playbackRate.calls.filter((c) => c.method === "setTargetAtTime");
    expect(ramps.length).toBe(2);
    expect(ramps[0].args[0]).toBeCloseTo(e1.dopplerShift, 6);
    expect(ramps[1].args[0]).toBeCloseTo(e2.dopplerShift, 6);
    // 50 ms ramp → τ = 50/3000 s, applied at the context clock.
    expect(ramps[0].args[2]).toBeCloseTo(50 / 3000, 9);
  });
});
