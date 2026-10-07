import { describe, expect, it } from "vitest";
import { gainsForRpm } from "../../../packages/audio/src/game-sound/EngineLoop";
import { LoopHandleImpl } from "../../../packages/audio/src/game-sound/LoopHandle";
import { occlusionHz } from "../../../packages/audio/src/game-sound/SpatialVoice";
import type { VoiceRecord } from "../../../packages/audio/src/game-sound/Voice";
import { FakeContext, FakeSource, FakeGain } from "./fake-context";

const fakeRecord = () => {
  const source = new FakeSource();
  const gain = new FakeGain();
  return {
    id: 1,
    cueId: "loop",
    priority: 1,
    startedAt: 0,
    source: source as unknown as VoiceRecord["source"],
    gain: gain as unknown as VoiceRecord["gain"],
    loop: true,
    ended: false
  } as VoiceRecord;
};

describe("LoopHandle (PRD-09 §6.8)", () => {
  it("setRate ramps via setTargetAtTime with τ = rampMs/3", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 2;
    const record = fakeRecord();
    const h = new LoopHandleImpl(ctx, record, undefined, () => {});
    h.setRate(1.5, 300);
    const src = record.source as unknown as FakeSource;
    expect(src.playbackRate.calls[0]).toEqual({ method: "setTargetAtTime", args: [1.5, 2, 0.1] });
    h.setRate(2);
    expect(src.playbackRate.value).toBe(2);
  });

  it("setGain takes dB and converts to linear", () => {
    const ctx = new FakeContext();
    const record = fakeRecord();
    const h = new LoopHandleImpl(ctx, record, undefined, () => {});
    h.setGain(-6);
    expect((record.gain as unknown as FakeGain).gain.value).toBeCloseTo(0.501, 3);
  });

  it("stop(fadeMs) releases after the fade deadline", async () => {
    const ctx = new FakeContext();
    const record = fakeRecord();
    let released = false;
    const h = new LoopHandleImpl(ctx, record, undefined, () => (released = true));
    h.stop(10);
    expect(released).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(released).toBe(true);
  });
});

describe("gainsForRpm (§6.8 equal-power crossfade)", () => {
  it("two layers: full A at low rpm, full B at high rpm, equal power mid", () => {
    expect(gainsForRpm([1500, 4500], 1500)).toEqual([1, 0]);
    expect(gainsForRpm([1500, 4500], 4500)).toEqual([0, 1]);
    const mid = gainsForRpm([1500, 4500], 3000);
    expect(mid[0]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(mid[1]).toBeCloseTo(Math.SQRT1_2, 3);
  });
  it("four layers: only the two neighbors carry gain", () => {
    const g = gainsForRpm([1000, 2000, 3500, 5000], 2750);
    expect(g[0]).toBe(0);
    expect(g[3]).toBe(0);
    expect(g[1] + g[2]).toBeGreaterThan(0.9);
    expect(g[1] ** 2 + g[2] ** 2).toBeCloseTo(1, 3);
  });
  it("clamps below the lowest and above the highest rpm", () => {
    expect(gainsForRpm([1500, 4500], 500)).toEqual([1, 0]);
    expect(gainsForRpm([1500, 4500], 9000)).toEqual([0, 1]);
  });
});

describe("occlusionHz (§6.8)", () => {
  it("maps 0 → 20 kHz, 1 → 900 Hz exponentially", () => {
    expect(occlusionHz(0)).toBe(20_000);
    expect(occlusionHz(1)).toBeCloseTo(900, 0);
    expect(occlusionHz(0.5)).toBeCloseTo(Math.sqrt(20_000 * 900), 0);
  });
});
