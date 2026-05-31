import { describe, expect, it } from "vitest";
import {
  applyFpsCalibrationToMetrics,
  classifyFpsCalibration,
  classifySceneFpsSample,
  runFpsCalibration,
  summarizeFrameTimes
} from "../../../benchmark/runner/fps-calibration.mjs";

describe("benchmark FPS calibration", () => {
  it("summarizes frame times with p50 FPS and p95 frame time", () => {
    const summary = summarizeFrameTimes([16.7, 16.6, 17, 100, Number.NaN, 16.8]);
    expect(summary.sampleCount).toBe(5);
    expect(summary.minFrameTimeMs).toBe(16.6);
    expect(summary.maxFrameTimeMs).toBe(100);
    expect(summary.p50FrameTimeMs).toBe(16.8);
    expect(summary.p95FrameTimeMs).toBe(100);
    expect(summary.p50Fps).toBeCloseTo(59.52, 1);
    expect(summary.timedOut).toBe(false);
  });

  it("passes calibrated browser controls before scene FPS can be trusted", () => {
    const verdict = classifyFpsCalibration({
      emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { sampleCount: 180, p50Fps: 60, p95FrameTimeMs: 18 }
    });
    expect(verdict).toMatchObject({ status: "pass", failures: [] });
  });

  it("invalidates calibration when controls do not collect enough samples", () => {
    const verdict = classifyFpsCalibration({
      emptyRaf: { sampleCount: 2, p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { sampleCount: 1, p50Fps: 120, p95FrameTimeMs: 8.5 }
    });

    expect(verdict.status).toBe("invalid");
    expect(verdict.failures.join(" ")).toContain("sample count");
  });

  it("invalidates calibration when sampling times out", () => {
    const verdict = classifyFpsCalibration({
      emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5, timedOut: true },
      webglControl: { sampleCount: 180, p50Fps: 60, p95FrameTimeMs: 18, timedOut: true }
    });

    expect(verdict.status).toBe("invalid");
    expect(verdict.failures.join(" ")).toContain("timed out");
  });

  it("invalidates scene FPS metrics when browser controls are too slow", () => {
    const calibration = {
      emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { sampleCount: 180, p50Fps: 8, p95FrameTimeMs: 140 },
      verdict: classifyFpsCalibration({
        emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
        webglControl: { sampleCount: 180, p50Fps: 8, p95FrameTimeMs: 140 }
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

  it("marks scene FPS metrics as pass when calibration passes", () => {
    const calibration = {
      emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { sampleCount: 180, p50Fps: 60, p95FrameTimeMs: 18 },
      verdict: classifyFpsCalibration({
        emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
        webglControl: { sampleCount: 180, p50Fps: 60, p95FrameTimeMs: 18 }
      })
    };

    const metrics = applyFpsCalibrationToMetrics({
      p50Fps: 58,
      p95FrameTimeMs: 22,
      fpsSample: { sampleCount: 180, p50Fps: 58, p95FrameTimeMs: 22, timedOut: false },
      fpsInstrumentationStatus: "not-run",
      fpsInstrumentationFailures: ["stale failure"]
    }, calibration);

    expect(metrics).toMatchObject({
      p50Fps: 58,
      p95FrameTimeMs: 22,
      fpsInstrumentationStatus: "pass",
      fpsInstrumentationFailures: []
    });
  });

  it("invalidates scene FPS metrics when scene sampling never ran", () => {
    const calibration = {
      emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
      webglControl: { sampleCount: 180, p50Fps: 60, p95FrameTimeMs: 18 },
      verdict: classifyFpsCalibration({
        emptyRaf: { sampleCount: 180, p50Fps: 120, p95FrameTimeMs: 8.5 },
        webglControl: { sampleCount: 180, p50Fps: 60, p95FrameTimeMs: 18 }
      })
    };

    const metrics = applyFpsCalibrationToMetrics({ p50Fps: 120, p95FrameTimeMs: 9 }, calibration);

    expect(metrics).toMatchObject({
      p50Fps: null,
      p95FrameTimeMs: null,
      fpsInstrumentationStatus: "invalid"
    });
    expect(metrics.fpsInstrumentationFailures?.join(" ")).toContain("scene FPS sampling did not run");
  });

  it("invalidates scene FPS metrics when scene sampling times out", () => {
    const verdict = classifySceneFpsSample({ sampleCount: 5, p50Fps: 12, p95FrameTimeMs: 160, timedOut: true } as never);

    expect(verdict.status).toBe("invalid");
    expect(verdict.failures.join(" ")).toContain("scene FPS sampling timed out");
  });

  it("returns an invalid verdict instead of throwing when a control page fails", async () => {
    const emptyPage = createCalibrationPage({
      evaluateResult: { frameTimes: Array.from({ length: 180 }, () => 16.7), timedOut: false }
    });
    const webglPage = createCalibrationPage({
      waitForFunctionError: new Error("missing webgl2")
    });
    const pages = [emptyPage, webglPage];
    const browser = {
      newPage: async () => {
        const page = pages.shift();
        if (!page) throw new Error("unexpected page request");
        return page;
      }
    };

    const result = await runFpsCalibration(browser as unknown as Parameters<typeof runFpsCalibration>[0]);

    expect(result.verdict.status).toBe("invalid");
    expect(result.verdict.failures.join(" ")).toContain("WebGL control calibration failed");
    expect(result.webglControl.sampleCount).toBe(0);
    expect(emptyPage.closed).toBe(true);
    expect(webglPage.closed).toBe(true);
  });
});

function createCalibrationPage(options: {
  readonly evaluateResult?: { readonly frameTimes: readonly number[]; readonly timedOut: boolean };
  readonly waitForFunctionError?: Error;
}) {
  const page = {
    closed: false,
    on: () => undefined,
    setContent: async () => undefined,
    waitForTimeout: async () => undefined,
    waitForFunction: async () => {
      if (options.waitForFunctionError) throw options.waitForFunctionError;
      return undefined;
    },
    evaluate: async () => options.evaluateResult ?? { frameTimes: [], timedOut: true },
    close: async () => {
      page.closed = true;
    }
  };
  return page;
}
