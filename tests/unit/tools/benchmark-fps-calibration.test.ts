import { describe, expect, it } from "vitest";
import {
  applyFpsCalibrationToMetrics,
  classifyFpsCalibration,
  summarizeFrameTimes
} from "../../../benchmark/runner/fps-calibration.mjs";

describe("benchmark FPS calibration", () => {
  it("summarizes frame times with p50 FPS and p95 frame time", () => {
    const summary = summarizeFrameTimes([16.7, 16.6, 17, 100, Number.NaN, 16.8]);
    expect(summary.sampleCount).toBe(5);
    expect(summary.p50FrameTimeMs).toBe(16.8);
    expect(summary.p95FrameTimeMs).toBe(100);
    expect(summary.p50Fps).toBeCloseTo(59.52, 1);
  });

  it("passes calibrated browser controls before scene FPS can be trusted", () => {
    const verdict = classifyFpsCalibration({
      emptyRaf: { p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { p50Fps: 60, p95FrameTimeMs: 18 }
    });
    expect(verdict).toMatchObject({ status: "pass", failures: [] });
  });

  it("invalidates scene FPS metrics when browser controls are too slow", () => {
    const calibration = {
      emptyRaf: { p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { p50Fps: 8, p95FrameTimeMs: 140 },
      verdict: classifyFpsCalibration({
        emptyRaf: { p50Fps: 120, p95FrameTimeMs: 8.5 },
        webglControl: { p50Fps: 8, p95FrameTimeMs: 140 }
      })
    };
    const metrics = applyFpsCalibrationToMetrics({ p50Fps: 4, p95FrameTimeMs: 250 }, calibration);

    expect(metrics).toMatchObject({
      p50Fps: null,
      p95FrameTimeMs: null,
      fpsInstrumentationStatus: "invalid"
    });
    expect(metrics.fpsInstrumentationFailures?.join(" ")).toContain("WebGL control");
  });
});
