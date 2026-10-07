import { describe, expect, it } from "vitest";
import { MusicControllerImpl } from "../../../packages/audio/src/game-sound/MusicController";
import { syncListener, type ListenerLike } from "../../../packages/audio/src/game-sound/listenerSync";
import { FakeContext, FakeNode, FakeSource, fakeParam } from "./fake-context";

const buf = () => ({ duration: 10, length: 480_000, sampleRate: 48_000, numberOfChannels: 1 }) as AudioBuffer;

describe("MusicController (PRD-09 §6.8)", () => {
  it("multi-stem tracks start every stem on one identical `when`", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 3;
    const mc = new MusicControllerImpl({
      ctx,
      output: new FakeNode("music-bus"),
      tracks: {
        theme: { stems: [{ url: "a" }, { url: "b" }, { url: "c" }], bpm: 120, loop: true }
      },
      bufferFor: buf
    });
    mc.play("theme", { crossfadeMs: 0 });
    const sources = ctx.ofKind<FakeSource>("source");
    expect(sources.length).toBe(3);
    expect(sources.map((s) => s.started[0].when)).toEqual([3.05, 3.05, 3.05]);
  });

  it("stinger quantize='bar' at 120 bpm schedules on the next bar boundary", () => {
    const ctx = new FakeContext();
    const mc = new MusicControllerImpl({
      ctx,
      output: new FakeNode("music-bus"),
      tracks: { theme: { stems: [{ url: "a" }, { url: "b" }], bpm: 120 } },
      bufferFor: buf
    });
    mc.play("theme", { crossfadeMs: 0 });
    // Track started at t=0 (currentTime 0 + 0.05 offset), bpm 120 → bar = 2.0 s.
    // At elapsed 2.6 s (1.3 bars) the next bar is 4.0 s → delay 1.4 s.
    ctx.currentTime = 2.6;
    expect(mc.stingerDelay("bar")).toBeCloseTo(1.45, 6);
    // At exactly a bar boundary the NEXT bar is chosen (stingers never replay the current bar).
    ctx.currentTime = 4.05;
    expect(mc.stingerDelay("bar")).toBeCloseTo(2.0, 6);
  });

  it("single-stem track uses one media element source when available", () => {
    const ctx = new FakeContext();
    const element = { loop: false, play: () => Promise.resolve(), pause: () => {} } as unknown as HTMLMediaElement;
    const mediaSource = new FakeNode("media-source");
    ctx.createMediaElementSource = () => mediaSource as unknown as MediaElementAudioSourceNode;
    const mc = new MusicControllerImpl({
      ctx,
      output: new FakeNode("music-bus"),
      tracks: { theme: { stems: [{ url: "song" }], bpm: 100 } },
      bufferFor: buf,
      createMediaElement: () => element
    });
    mc.play("theme", { crossfadeMs: 0 });
    expect(ctx.ofKind("source").length).toBe(0);
    expect(mediaSource.connectedTo.length).toBe(1);
  });

  it("setDucked applies −9 dB + lowpass 1.2 kHz and restores", () => {
    const ctx = new FakeContext();
    const mc = new MusicControllerImpl({
      ctx,
      output: new FakeNode("music-bus"),
      tracks: { theme: { stems: [{ url: "a" }, { url: "b" }] } },
      bufferFor: buf
    });
    mc.play("theme", { crossfadeMs: 0 });
    mc.setDucked(true);
    const gain = ctx.ofKind<{ gain: { value: number } }>("gain")[0];
    expect(gain.gain.value).toBeCloseTo(Math.pow(10, -9 / 20), 3);
    const filter = ctx.ofKind<{ frequency: { value: number } }>("biquad")[0];
    expect(filter.frequency.value).toBe(1200);
    mc.setDucked(false);
    expect(filter.frequency.value).toBe(20_000);
  });
});

describe("syncListener (PRD-09 §6.8/1728)", () => {
  const pose = {
    position: [1, 2, 3] as const,
    forward: [0, 0, -1] as const,
    up: [0, 1, 0] as const
  };

  it("ramps positionX…upZ AudioParams when they exist", () => {
    const px = fakeParam(0);
    const fz = fakeParam(-1);
    const uy = fakeParam(1);
    const listener: ListenerLike = {
      positionX: px, positionY: fakeParam(0), positionZ: fakeParam(0),
      forwardX: fakeParam(0), forwardY: fakeParam(0), forwardZ: fz,
      upX: fakeParam(0), upY: uy, upZ: fakeParam(0)
    };
    expect(syncListener(listener, 1.5, pose)).toBe("audioparam");
    expect(px.calls[0]).toEqual({ method: "setTargetAtTime", args: [1, 1.5, 0.02] });
    expect(fz.calls[0].args[0]).toBe(-1);
    expect(uy.calls[0].args[0]).toBe(1);
  });

  it("falls back to setPosition/setOrientation (Firefox)", () => {
    let pos: number[] = [];
    let ori: number[] = [];
    const listener: ListenerLike = {
      setPosition: (x, y, z) => (pos = [x, y, z]),
      setOrientation: (fx, fy, fz, ux, uy, uz) => (ori = [fx, fy, fz, ux, uy, uz])
    };
    expect(syncListener(listener, 0, pose)).toBe("legacy");
    expect(pos).toEqual([1, 2, 3]);
    expect(ori).toEqual([0, 0, -1, 0, 1, 0]);
  });
});
