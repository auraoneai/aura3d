import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDeviceTimer, NATIVE_WORKLOADS, nativeWorkload, summarizeSamples } from "../../../tools/performance/native-workloads";
import { validateReport, type EngineSummary } from "../../../tools/production-path-benchmark/index";
import { PRODUCTION_PATH_BENCHMARK_SCENE } from "../../../tools/production-path-benchmark/scene";

const workloadSource = readFileSync("tools/performance/native-workloads.ts", "utf8");
const benchmarkSource = readFileSync("tools/production-path-benchmark/index.ts", "utf8");

describe("native production workload definitions", () => {
  it("defines a distinct fixed workload for each required rendering and lifecycle scenario", () => {
    const ids = NATIVE_WORKLOADS.map((workload) => workload.id);
    expect(ids).toEqual(["primitive", "product", "instances", "animation", "game-loop", "effects", "asset-import"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const workload of NATIVE_WORKLOADS) {
      expect(nativeWorkload(workload.id)).toBe(workload);
      expect(workload.revision).toBe(1);
      expect(Number.isSafeInteger(workload.seed)).toBe(true);
      expect(workload.look).toBe("product-studio");
      expect(workload.quality).toBe("production");
      expect(workload.viewport).toEqual({ width: 640, height: 360, dpr: 1 });
      expect(workload.backend).toBe("webgl2");
      expect(workload.warmupFrames).toBeGreaterThan(0);
      expect(workload.timedFrames).toBeGreaterThanOrEqual(300);
    }
    expect(() => nativeWorkload("unknown" as never)).toThrow(/Unknown native performance workload/);
  });

  it("pins the bytes, licensing and provenance of every referenced workload asset", () => {
    for (const workload of NATIVE_WORKLOADS) {
      if (!workload.asset) continue;
      const asset = workload.asset;
      expect(asset.url).toMatch(/^\/(?!\/)/);
      expect(asset.url).not.toContain("..");
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.license.length).toBeGreaterThan(0);
      expect(asset.provenance.length).toBeGreaterThan(0);
      const digest = createHash("sha256").update(readFileSync(asset.url.slice(1))).digest("hex");
      expect(digest, workload.id).toBe(asset.sha256);
    }
    expect(NATIVE_WORKLOADS.filter((workload) => workload.asset).map((workload) => workload.id))
      .toEqual(["product", "animation", "asset-import"]);
  });

  it("computes p50, p95 and p99 from samples without mutating them or accepting no-data", () => {
    const samples = [5, 1, 4, 2, 3];
    expect(summarizeSamples(samples)).toEqual({ p50: 3, p95: 5, p99: 5, count: 5 });
    expect(samples).toEqual([5, 1, 4, 2, 3]);
    expect(summarizeSamples([])).toBeNull();
    expect(summarizeSamples([1, Number.NaN])).toBeNull();
    expect(summarizeSamples([1, Infinity])).toBeNull();
    expect(summarizeSamples([1, -1])).toBeNull();
  });

  it("separates CPU timing from available and non-disjoint GPU timer results", () => {
    expect(workloadSource).toContain("cpuWall: summarizeSamples(cpuWallTimes)");
    expect(workloadSource).toContain("summary: reason ? null : summarizeSamples(samples)");
    expect(workloadSource).not.toMatch(/gpu(?:TimerQuery)?(?:Ms)?\s*[:=]\s*cpu/i);
    expect(workloadSource).not.toMatch(/(?:cpuFrameMs|gpuTimerQueryMs|steadyStateFrameMs):\s*\d/);
  });

  it("labels unsupported, disjoint and lost device timers unavailable", async () => {
    const unsupported = timerContext({ extension: false });
    const first = createDeviceTimer(unsupported.gl);
    expect(first.begin()).toBeNull();
    expect(await first.finish(1)).toEqual({ summary: null, unavailable: "EXT_disjoint_timer_query_webgl2 unavailable" });

    const disjoint = timerContext({ disjoint: true });
    const second = createDeviceTimer(disjoint.gl);
    expect(second.begin()).toBeNull();
    expect(await second.finish(1)).toEqual({ summary: null, unavailable: "GPU timer became disjoint" });

    const lost = timerContext({ lost: true });
    const third = createDeviceTimer(lost.gl);
    expect(third.begin()).toBeNull();
    expect(await third.finish(1)).toEqual({ summary: null, unavailable: "WebGL2 context lost" });
  });

  it("reports a genuine completed query in milliseconds and releases it", async () => {
    const context = timerContext({ available: false, nanoseconds: 2_500_000 });
    const timer = createDeviceTimer(context.gl);
    const scope = timer.begin();
    expect(scope).not.toBeNull();
    timer.end(scope);
    setTimeout(() => { context.state.available = true; }, 1);
    expect(await timer.finish(1)).toEqual({
      summary: { p50: 2.5, p95: 2.5, p99: 2.5, count: 1 },
      unavailable: null
    });
    expect(context.deleteQuery).toHaveBeenCalledWith(context.query);
    expect(context.deleteQuery).toHaveBeenCalledTimes(1);
  });

  it("marks delayed results unavailable after the deadline and releases pending queries", async () => {
    const context = timerContext({ available: false });
    const timer = createDeviceTimer(context.gl);
    const scope = timer.begin();
    timer.end(scope);
    const now = vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(5001);
    try {
      expect(await timer.finish(1)).toEqual({ summary: null, unavailable: "GPU query results did not become available before the deadline" });
      expect(context.deleteQuery).toHaveBeenCalledWith(context.query);
    } finally {
      now.mockRestore();
    }
  });

  it("discards results on disjoint, lost context and invalid device values", async () => {
    const disjoint = timerContext({ available: true, nanoseconds: 1_000_000, disjointOnResult: true });
    const a = createDeviceTimer(disjoint.gl);
    a.end(a.begin());
    expect(await a.finish(1)).toEqual({ summary: null, unavailable: "GPU timer became disjoint" });
    expect(disjoint.deleteQuery).toHaveBeenCalledWith(disjoint.query);

    const lost = timerContext({ available: false });
    const b = createDeviceTimer(lost.gl);
    b.end(b.begin());
    lost.state.lost = true;
    expect((await b.finish(1)).summary).toBeNull();
    expect(lost.deleteQuery).toHaveBeenCalledWith(lost.query);

    const invalid = timerContext({ available: true, nanoseconds: NaN });
    const c = createDeviceTimer(invalid.gl);
    c.end(c.begin());
    expect(await c.finish(1)).toEqual({ summary: null, unavailable: "GPU timer returned an invalid value" });
    expect(invalid.deleteQuery).toHaveBeenCalledWith(invalid.query);
  });

  it("never reports an earlier successful sample as a complete run after a later disjoint event", async () => {
    const context = timerContext({ available: true, nanoseconds: 1_000_000 });
    const timer = createDeviceTimer(context.gl);
    timer.end(timer.begin());
    context.state.available = false;
    timer.end(timer.begin());
    context.state.disjoint = true;
    expect(await timer.finish(2)).toEqual({ summary: null, unavailable: "GPU timer became disjoint" });
    expect(context.deleteQuery).toHaveBeenCalledTimes(2);
  });

  it("rejects overlapping timer scopes and releases the original query", async () => {
    const context = timerContext({ available: false });
    const timer = createDeviceTimer(context.gl);
    const first = timer.begin();
    expect(first).not.toBeNull();
    expect(timer.begin()).toBeNull();
    timer.end(first);
    expect(await timer.finish(2)).toEqual({ summary: null, unavailable: "A GPU elapsed-time query is already active" });
    expect(context.deleteQuery).toHaveBeenCalledWith(context.query);
  });

  it("requires a native draw and records resource disposal without running a browser", () => {
    expect(workloadSource).toContain('import("@aura3d/engine")');
    expect(workloadSource).toContain("first.drawCalls <= 0");
    expect(workloadSource).toContain("liveBeforeDispose");
    expect(workloadSource).toContain("liveAfterDispose");
    expect(workloadSource).toContain("resources.restore()");
    expect(workloadSource).not.toMatch(/@aura3d\/[a-z-]+\/src\//);
    expect(workloadSource).not.toMatch(/getContext\(["']2d["']\)/);
  });
});

describe("production-path benchmark (native reference workload)", () => {
  it("bundles only the public native entry point and no other engine", () => {
    expect(benchmarkSource).toContain('from "@aura3d/engine"');
    expect(benchmarkSource).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']/);
    expect(benchmarkSource).not.toMatch(/\bTHREE\./);
    expect(benchmarkSource).not.toMatch(/threejsBundleSource|WebGLRenderer/);
    expect(benchmarkSource).not.toMatch(/@aura3d\/[a-z-]+\/src\//);
    // Executable lines only: the header comment quotes the replaced instrument's literal on purpose.
    const executable = benchmarkSource.split("\n").filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line)).join("\n");
    expect(executable).not.toMatch(/(?:cpuFrameMs|gpuTimerQueryMs|steadyStateFrameMs):\s*\d/);
  });

  it("accepts a complete native report", () => {
    expect(validateReport(nativeReport())).toEqual({ pass: true, failures: [] });
  });

  it("recomputes native checks instead of trusting the recorded pass flag", () => {
    const blank = nativeReport({ sessions: nativeSessions().map((session) => ({ ...session, nonBlankPixels: 0 })) });
    expect(validateReport(blank).failures.some((failure) => failure.startsWith("aura3d:drew-something"))).toBe(true);

    const short = nativeReport({ sessions: nativeSessions().slice(0, 2) });
    expect(validateReport(short).failures.some((failure) => failure.startsWith("aura3d:sessions"))).toBe(true);

    const noDraws = nativeReport({ sessions: nativeSessions().map((session) => ({ ...session, drawnObjectCount: 0 })) });
    expect(validateReport(noDraws).failures.some((failure) => failure.startsWith("aura3d:draw-calls"))).toBe(true);

    expect(validateReport({ ...nativeReport(), pass: false }).pass).toBe(false);
    expect(validateReport({ ...nativeReport(), aura3d: undefined }).pass).toBe(false);
    expect(validateReport(null).pass).toBe(false);
  });

  it("rejects a report measured against a different workload", () => {
    const stale = { ...nativeReport(), scene: { ...PRODUCTION_PATH_BENCHMARK_SCENE, measuredFrames: 1 } };
    expect(validateReport(stale).failures.some((failure) => failure.startsWith("scene:"))).toBe(true);
  });
});

function nativeSessions(): EngineSummary["sessions"][number][] {
  const frames = { min: 1, median: 2, p95: 3, max: 4, stddev: 0.5, sampleCount: PRODUCTION_PATH_BENCHMARK_SCENE.measuredFrames };
  return [1, 2, 3].map((session) => ({
    session,
    engine: "aura3d" as const,
    cpuFrameSubmissionMs: frames,
    rafIntervalMs: frames,
    gpuTimerQueryMs: null,
    gpuTimerQueryUnavailableReason: "EXT_disjoint_timer_query_webgl2 unavailable",
    firstFrameCompileMs: 10,
    runtimeStartupToFirstFrameMs: 50,
    startupFrameNonBlankPixels: 20_000,
    steadyStateFrameMs: 2,
    wallClockFrameMs: 16,
    browserReportedMemoryMb: null,
    drawnObjectCount: 512,
    nonBlankPixels: 20_000,
    realWebGL2: true
  }));
}

function nativeReport(overrides: Partial<EngineSummary> = {}) {
  const sessions = overrides.sessions ?? nativeSessions();
  const startup = { min: 50, median: 50, p95: 50, max: 50, stddev: 0, sampleCount: sessions.length };
  const aura3d: EngineSummary = {
    engine: "aura3d",
    bundleBytes: 1,
    steadyStateFrameMs: 2,
    steadyStateFrameMsPerSession: sessions.map(() => 2),
    steadyStateVarianceMs: 0,
    cpuFrameSubmissionMs: startup,
    rafIntervalMs: startup,
    gpuTimerQueryMs: null,
    gpuTimerQueryUnavailableReason: "EXT_disjoint_timer_query_webgl2 unavailable",
    firstFrameCompileMs: 10,
    runtimeStartupToFirstFrameMs: startup,
    wallClockFrameMs: 16,
    browserReportedMemoryMb: null,
    ...overrides,
    sessions
  };
  return { schema: "a3d-production-path-benchmark", pass: true, scene: PRODUCTION_PATH_BENCHMARK_SCENE, aura3d };
}

function timerContext(options: { extension?: boolean; disjoint?: boolean; lost?: boolean; available?: boolean; nanoseconds?: number; disjointOnResult?: boolean }) {
  const query = {} as WebGLQuery;
  const deleteQuery = vi.fn();
  let current: WebGLQuery | null = null;
  const state = { available: options.available ?? false, lost: options.lost ?? false, disjoint: options.disjoint ?? false };
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => options.extension === false ? null : { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 },
    getParameter: () => state.disjoint,
    getQuery: () => current,
    isContextLost: () => state.lost,
    createQuery: () => query,
    beginQuery: vi.fn((_target: number, value: WebGLQuery) => { current = value; }),
    endQuery: vi.fn(() => { current = null; }),
    getQueryParameter: (_query: WebGLQuery, name: number) => {
      if (name === 1) return state.available;
      if (options.disjointOnResult) state.disjoint = true;
      return options.nanoseconds ?? 0;
    },
    deleteQuery
  } as unknown as WebGL2RenderingContext;
  return { gl, query, state, deleteQuery };
}
