import { describe, expect, it } from "vitest";
import {
  RendererTimingCollector,
  createCpuFallbackGpuTimingBackend,
  createImmediateGpuTimingBackend,
  type RendererGpuTimingBackend,
  type RendererGpuTimingResult,
  type RendererGpuTimingToken
} from "../../../packages/rendering/src";

describe("renderer timing", () => {
  it("records CPU fallback samples when GPU timing is unavailable", () => {
    const now = sequenceClock([10, 12.75]);
    const timing = new RendererTimingCollector({
      now,
      gpuBackend: createCpuFallbackGpuTimingBackend("EXT_disjoint_timer_query_webgl2 unavailable; using CPU timing fallback.")
    });

    timing.measure("postprocess-frame", () => undefined);
    const snapshot = timing.snapshot();

    expect(snapshot).toMatchObject({
      gpuTimingSupported: false,
      cpuFallbackActive: true,
      sampleCount: 1,
      unavailableReason: "EXT_disjoint_timer_query_webgl2 unavailable; using CPU timing fallback."
    });
    expect(snapshot.samples[0]).toMatchObject({
      label: "postprocess-frame",
      durationMs: 2.75,
      cpuDurationMs: 2.75,
      source: "cpu-fallback"
    });
  });

  it("records GPU samples when a GPU timing backend returns a duration", () => {
    const now = sequenceClock([1, 9]);
    const timing = new RendererTimingCollector({
      now,
      gpuBackend: createImmediateGpuTimingBackend(0.625)
    });

    const timer = timing.begin("shadow-map-pass");
    const sample = timer.end();
    const snapshot = timing.snapshot();

    expect(sample).toMatchObject({
      label: "shadow-map-pass",
      durationMs: 0.625,
      cpuDurationMs: 8,
      gpuDurationMs: 0.625,
      source: "gpu"
    });
    expect(snapshot).toMatchObject({
      gpuTimingSupported: true,
      cpuFallbackActive: false,
      sampleCount: 1
    });
    expect(snapshot.unavailableReason).toBeUndefined();
  });

  it("upgrades fallback samples when pending GPU timing results become available", () => {
    const now = sequenceClock([20, 25]);
    const pendingResults: RendererGpuTimingResult[] = [];
    const gpuBackend: RendererGpuTimingBackend = {
      supported: true,
      unavailableReason: "GPU timer query pending; using CPU fallback.",
      begin(label: string): RendererGpuTimingToken {
        return { label };
      },
      end(_token: RendererGpuTimingToken, _cpuDurationMs: number): number | undefined {
        return undefined;
      },
      collectAvailable(): readonly RendererGpuTimingResult[] {
        return pendingResults.splice(0);
      }
    };
    const timing = new RendererTimingCollector({ now, gpuBackend });

    timing.measure("postprocess-pass", () => undefined);
    expect(timing.snapshot().samples[0]).toMatchObject({ source: "cpu-fallback", durationMs: 5 });

    pendingResults.push({ label: "postprocess-pass", durationMs: 0.875 });
    expect(timing.snapshot().samples[0]).toMatchObject({
      source: "gpu",
      durationMs: 0.875,
      gpuDurationMs: 0.875,
      cpuDurationMs: 5
    });
  });
});

function sequenceClock(values: number[]): () => number {
  return () => values.shift() ?? values.at(-1) ?? 0;
}
