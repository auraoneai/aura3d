import { describe, expect, it } from "vitest";

import { FrameStats, diffDeviceCounters } from "../../../../packages/rendering/src/quality/FrameStats";
import type { DeviceCounters } from "../../../../packages/rendering/src/contracts/device";

/** Feeds `intervals` ms-spaced begins, continuing the timestamp sequence; returns the next ts. */
function feed(stats: FrameStats, intervals: readonly number[], ts = 0): number {
  for (const interval of intervals) {
    ts += interval;
    stats.begin(ts);
    stats.end();
  }
  return ts;
}

describe("FrameStats (C-28, prd11)", () => {
  it("reports exact nearest-rank percentiles over the last 240 samples", () => {
    const stats = new FrameStats(240);
    // 241 samples with interval i; the ring drops the first (interval 1).
    feed(stats, Array.from({ length: 241 }, (_, i) => i + 1));
    expect(stats.samples).toBe(240);
    const p = stats.percentiles("intervalMs");
    // Live ring = intervals 2..241 sorted ascending; nearest-rank ceil(q*n).
    expect(p.p50).toBe(121);   // rank 120 of [2..241]
    expect(p.p95).toBe(229);   // rank 228
    expect(p.p99).toBe(239);   // rank 238
    expect(p.max).toBe(241);
  });

  it("wraps the ring at capacity and drops the oldest sample", () => {
    const stats = new FrameStats(240);
    feed(stats, [500, ...Array.from({ length: 240 }, () => 10)]);
    expect(stats.samples).toBe(240);
    expect(stats.percentiles("intervalMs").max).toBe(10);
  });

  it("fps() is null before 30 samples and measured after", () => {
    const stats = new FrameStats(240);
    feed(stats, Array.from({ length: 29 }, () => 50));
    expect(stats.fps()).toBeNull();
    // 31 samples total: the first (intervalMs 0) drops out of the 30-sample window.
    feed(stats, Array.from({ length: 2 }, () => 50), 29 * 50);
    expect(stats.fps()).toBe(20);
  });

  it("legacyFps() is 0 before 2 samples, then measured", () => {
    const stats = new FrameStats(240);
    expect(stats.legacyFps()).toBe(0);
    let ts = feed(stats, [50]);
    expect(stats.legacyFps()).toBe(0);
    feed(stats, Array.from({ length: 9 }, () => 50), ts);
    expect(stats.legacyFps()).toBe(20);
  });

  it("scope() measures CPU time and keeps the return value", () => {
    const stats = new FrameStats(240);
    stats.begin(0);
    const value = stats.scope("forward", () => 42);
    const sample = stats.end();
    expect(value).toBe(42);
    expect(sample.scopes.forward).toBeTypeOf("number");
  });

  it("diffDeviceCounters subtracts per-frame fields and forwards live gauges", () => {
    const counters = (drawCalls: number): DeviceCounters => ({
      drawCalls,
      bufferCreates: drawCalls,
      textureUploads: 0,
      readbacks: 0,
      renderTargetsCreated: 0,
      programCompiles: 0,
      liveBuffers: 7,
      liveVertexArrays: 3,
      textureBytes: 100,
      renderTargetBytes: 200
    });
    const delta = diffDeviceCounters(counters(5), counters(9));
    expect(delta.drawCalls).toBe(4);
    expect(delta.liveBuffers).toBe(7);
    expect(delta.renderTargetBytes).toBe(200);
  });
});
