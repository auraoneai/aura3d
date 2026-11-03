import { describe, expect, it } from "vitest";

import { FrameStats } from "../../../packages/rendering/src/quality/FrameStats";
import {
  FrameInspectionTiming, attachFrameInspectionCancel, bindFrameInspectionView, closeFrameInspectionView,
  commitFrameInspectionView, pauseFrameInspectionRange
} from "../../../packages/rendering/src/quality/FrameInspectionTiming";
import { gpuTimingUnavailableReason } from "../../../packages/rendering/src/quality/DeviceProbe";
import { createWebGL2GpuTimingBackend } from "../../../packages/rendering/src/RendererTiming";
import type {
  RendererGpuScopedResult,
  RendererGpuScopedTimingBackend,
  RendererGpuTimingToken
} from "../../../packages/rendering/src/RendererTiming";

/** A single shared query-shaped backend used only by FrameStats. */
class QueryBackend implements RendererGpuScopedTimingBackend {
  readonly supported = true;
  readonly tokens: RendererGpuTimingToken[] = [];
  readonly results: RendererGpuScopedResult[] = [];
  begin(label: string): RendererGpuTimingToken { return this.beginScope(label); }
  end(token: RendererGpuTimingToken): undefined { this.endScope(token); return undefined; }
  beginScope(label: string): RendererGpuTimingToken {
    const token = { label };
    this.tokens.push(token);
    return token;
  }
  endScope(_token: RendererGpuTimingToken): void {}
  poll(): readonly RendererGpuScopedResult[] { return this.results.splice(0); }
  pollWithoutAging(): readonly RendererGpuScopedResult[] { return this.poll(); }
  settle(index: number, durationMs: number | null): void {
    const token = this.tokens[index]!;
    this.results.push({ token, label: token.label, durationMs });
  }
}

/** Minimal WebGL query surface whose results become available on demand. */
class DeferredGl {
  readonly QUERY_RESULT = 0x8866;
  readonly QUERY_RESULT_AVAILABLE = 0x8867;
  readonly timestamp = 0x8e28;
  readonly counterBits = 0x8864;
  readonly disjoint = 0x8fbb;
  readonly queries = new Map<object, number>();
  ready = false;
  private clock = 0;
  private readonly extension = {
    TIME_ELAPSED_EXT: 0x88bf,
    GPU_DISJOINT_EXT: this.disjoint,
    TIMESTAMP_EXT: this.timestamp,
    QUERY_COUNTER_BITS_EXT: this.counterBits,
    queryCounterEXT: (query: object): void => { this.clock += 1_000_000; this.queries.set(query, this.clock); }
  };

  getExtension(name: string): unknown { return name === "EXT_disjoint_timer_query_webgl2" ? this.extension : null; }
  getQuery(target: number, parameter: number): number { return target === this.timestamp && parameter === this.counterBits ? 64 : 0; }
  createQuery(): object { const query = {}; this.queries.set(query, 0); return query; }
  deleteQuery(query: object): void { this.queries.delete(query); }
  beginQuery(): void {}
  endQuery(): void {}
  getParameter(_name: number): boolean { return false; }
  getQueryParameter(query: object, name: number): number | boolean {
    return name === this.QUERY_RESULT_AVAILABLE ? this.ready : this.queries.get(query) ?? 0;
  }
}

describe("frame inspection with existing query-backed FrameStats", () => {
  it("attributes out-of-order view results without creating another query backend", () => {
    const backend = new QueryBackend();
    const stats = new FrameStats(4, backend);
    const poller = stats;
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(7);

    const left = timing.beginView(frame, "left")!;
    stats.begin(10);
    const leftSample = stats.end();
    expect(timing.finishView(left, leftSample, poller)).toBe(true);

    const right = timing.beginView(frame, "right")!;
    stats.begin(20);
    const rightSample = stats.end();
    expect(timing.finishView(right, rightSample, poller)).toBe(true);
    timing.end(frame);

    expect(backend.tokens).toHaveLength(2);
    backend.settle(1, 3);
    expect(timing.snapshot(frame)).toMatchObject({
      wholeFrameGpuTimeMs: null,
      views: [{ viewId: "left", gpuTimeMs: null }, { viewId: "right", gpuTimeMs: 3 }]
    });
    backend.settle(0, 2);
    expect(timing.snapshot(frame)?.views).toEqual([
      { viewId: "left", gpuTimeMs: 2 }, { viewId: "right", gpuTimeMs: 3 }
    ]);
    expect(backend.tokens).toHaveLength(2);
  });

  it("keeps a discarded query null and never substitutes CPU or percentile values", () => {
    const backend = new QueryBackend();
    const stats = new FrameStats(4, backend);
    const poller = stats;
    const timing = new FrameInspectionTiming();
    const first = timing.begin(1);
    const firstView = timing.beginView(first, "main")!;
    stats.begin(10);
    timing.finishView(firstView, stats.end(), poller);
    timing.end(first);
    const second = timing.begin(1);
    const secondView = timing.beginView(second, "main")!;
    stats.begin(20);
    timing.finishView(secondView, stats.end(), poller);
    timing.end(second);

    backend.settle(0, null);
    backend.settle(1, 4);
    expect(timing.snapshot(first)?.views).toEqual([{ viewId: "main", gpuTimeMs: null }]);
    expect(timing.snapshot(second)?.views).toEqual([{ viewId: "main", gpuTimeMs: 4 }]);
    expect(timing.snapshot(second)?.wholeFrameGpuTimeMs).toBeNull();
  });

  it("keeps unsupported timing null even though CPU frame statistics exist", () => {
    const stats = new FrameStats();
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1);
    const view = timing.beginView(frame, 0)!;
    stats.begin(1);
    const sample = stats.end();
    expect(typeof sample.cpuFrameMs).toBe("number");
    expect(timing.finishView(view, sample, stats)).toBe(true);
    timing.end(frame);
    expect(timing.snapshot(frame)?.views).toEqual([{ viewId: 0, gpuTimeMs: null }]);
  });

  it("still collects ready results from a custom backend without the optional non-aging method", () => {
    const delegate = new QueryBackend();
    const backend: RendererGpuScopedTimingBackend = {
      supported: true,
      begin: (label) => delegate.begin(label),
      end: (token) => delegate.end(token),
      beginScope: (label) => delegate.beginScope(label),
      endScope: (token) => delegate.endScope(token),
      poll: () => delegate.poll()
    };
    const stats = new FrameStats(4, backend);
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1), view = timing.beginView(frame, "main")!;
    stats.begin(1);
    expect(timing.finishView(view, stats.end(), stats)).toBe(true);
    timing.end(frame);
    delegate.settle(0, 2.5);
    expect(timing.snapshot(frame)?.views).toEqual([{ viewId: "main", gpuTimeMs: 2.5 }]);
  });

  it("does not expire a pending WebGL query when inspection and percentile getters are polled repeatedly", () => {
    const gl = new DeferredGl();
    const backend = createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext);
    const stats = new FrameStats(4, backend);
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1);
    const view = timing.beginView(frame, "main")!;
    stats.begin(1);
    const sample = stats.end();
    expect(timing.finishView(view, sample, stats)).toBe(true);
    timing.end(frame);
    for (let read = 0; read < 25; read += 1) {
      expect(timing.snapshot(frame)?.views[0]?.gpuTimeMs).toBeNull();
      stats.percentiles("gpuMs");
    }
    expect(gl.queries.size).toBe(2);
    gl.ready = true;
    expect(timing.snapshot(frame)?.views).toEqual([{ viewId: "main", gpuTimeMs: 1 }]);
    expect(gl.queries.size).toBe(0);
  });
});

/**
 * WebGL2 + EXT_disjoint_timer_query_webgl2 without usable timestamps, so every
 * range is a TIME_ELAPSED query. Enforces the spec: beginQuery while another
 * TIME_ELAPSED query is active is an INVALID_OPERATION (thrown here).
 */
class TimeElapsedGl {
  readonly QUERY_RESULT = 0x8866;
  readonly QUERY_RESULT_AVAILABLE = 0x8867;
  readonly TIME_ELAPSED_EXT = 0x88bf;
  readonly GPU_DISJOINT_EXT = 0x8fbb;
  readonly created: object[] = [];
  readonly durationsNs = new Map<object, number>();
  active: object | null = null;
  maxActive = 0;
  ready = false;
  disjoint = false;
  constructor(private readonly withExtension = true) {}
  getExtension(name: string): unknown {
    return this.withExtension && name === "EXT_disjoint_timer_query_webgl2"
      ? { TIME_ELAPSED_EXT: this.TIME_ELAPSED_EXT, GPU_DISJOINT_EXT: this.GPU_DISJOINT_EXT }
      : null;
  }
  createQuery(): object { const query = { id: this.created.length }; this.created.push(query); return query; }
  deleteQuery(): void {}
  beginQuery(target: number, query: object): void {
    if (target !== this.TIME_ELAPSED_EXT) throw new Error("unexpected target");
    if (this.active) throw new Error("INVALID_OPERATION: a TIME_ELAPSED query is already active");
    this.active = query;
    this.maxActive = Math.max(this.maxActive, 1);
  }
  endQuery(target: number): void {
    if (target !== this.TIME_ELAPSED_EXT || !this.active) throw new Error("INVALID_OPERATION: no active query");
    this.active = null;
  }
  getParameter(name: number): boolean { return name === this.GPU_DISJOINT_EXT ? this.disjoint : false; }
  getQueryParameter(query: object, name: number): number | boolean {
    if (name === this.QUERY_RESULT_AVAILABLE) return this.ready;
    return this.durationsNs.get(query) ?? 0;
  }
  /** Assign `ms` to the queries in creation order. */
  settle(ms: readonly number[], offset = 0): void {
    ms.forEach((value, index) => this.durationsNs.set(this.created[offset + index]!, value * 1_000_000));
    this.ready = true;
  }
}

function timedView(timing: FrameInspectionTiming, stats: FrameStats, frame: ReturnType<FrameInspectionTiming["begin"]>, viewId: string, cancel = false) {
  // Mirrors the production producer order: Renderer binds the view, the
  // prd11 collect contributor pauses the frame range then starts the view
  // query, and its after-output pass ends it and commits the sample.
  const blackboard = {};
  expect(bindFrameInspectionView(blackboard, timing, frame, viewId)).toBe(true);
  pauseFrameInspectionRange(blackboard);
  const handle = stats.beginTracked(1);
  const binding = attachFrameInspectionCancel(blackboard, () => stats.cancelTracked(handle));
  if (cancel) { closeFrameInspectionView(blackboard); return; }
  const sample = stats.endTracked(handle)!;
  expect(commitFrameInspectionView(blackboard, sample, stats, binding)).toBe(true);
}

describe("whole-frame GPU timing from consecutive view and non-view ranges (S5-WP17-01)", () => {
  it("never nests TIME_ELAPSED queries and reports a frame total covering every view", () => {
    const gl = new TimeElapsedGl();
    const stats = new FrameStats(8, createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext));
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1, stats, "unused");
    timedView(timing, stats, frame, "left");
    timedView(timing, stats, frame, "right");
    timing.end(frame);

    expect(gl.active).toBeNull();
    expect(gl.maxActive).toBe(1);
    // range, left, range, right, range
    expect(gl.created).toHaveLength(5);
    expect(timing.snapshot(frame)).toMatchObject({ wholeFrameGpuTimeMs: null, wholeFrameGpuStatus: "pending" });

    gl.settle([0.5, 2, 0.25, 3, 1]);
    const snapshot = timing.snapshot(frame)!;
    expect(snapshot.views).toEqual([{ viewId: "left", gpuTimeMs: 2 }, { viewId: "right", gpuTimeMs: 3 }]);
    expect(snapshot.wholeFrameGpuStatus).toBe("measured");
    expect(snapshot.wholeFrameGpuTimeMs).toBeCloseTo(6.75, 9);
    const viewSum = snapshot.views.reduce((sum, view) => sum + view.gpuTimeMs!, 0);
    expect(snapshot.wholeFrameGpuTimeMs!).toBeGreaterThanOrEqual(viewSum);
    expect(snapshot.wholeFrameGpuReason).toBeUndefined();
  });

  it("times a frame with no timed view as one range", () => {
    const gl = new TimeElapsedGl();
    const stats = new FrameStats(8, createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext));
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1, stats, "unused");
    // A bound view whose timing contributor never ran is covered by the frame range.
    expect(bindFrameInspectionView({}, timing, frame, "single")).toBe(true);
    timing.end(frame);
    expect(gl.created).toHaveLength(1);
    gl.settle([4]);
    expect(timing.snapshot(frame)).toMatchObject({ wholeFrameGpuTimeMs: 4, wholeFrameGpuStatus: "measured",
      views: [{ viewId: "single", gpuTimeMs: null }] });
  });

  it("discards a frame whose queries were invalidated by GPU_DISJOINT_EXT and measures the next one", () => {
    const gl = new TimeElapsedGl();
    const stats = new FrameStats(8, createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext));
    const timing = new FrameInspectionTiming();
    const first = timing.begin(1, stats, "unused");
    timedView(timing, stats, first, "main");
    timing.end(first);
    gl.settle([1, 2, 1]);
    gl.disjoint = true;
    const discarded = timing.snapshot(first)!;
    expect(discarded.wholeFrameGpuTimeMs).toBeNull();
    expect(discarded.wholeFrameGpuStatus).toBe("discarded");
    expect(discarded.wholeFrameGpuReason).toMatch(/GPU_DISJOINT_EXT/);
    expect(discarded.views).toEqual([{ viewId: "main", gpuTimeMs: null }]);

    gl.disjoint = false;
    gl.ready = false;
    const second = timing.begin(2, stats, "unused");
    timedView(timing, stats, second, "main");
    timing.end(second);
    gl.settle([0.5, 1.5, 0.5], 3);
    expect(timing.snapshot(second)).toMatchObject({ wholeFrameGpuTimeMs: 2.5, wholeFrameGpuStatus: "measured",
      views: [{ viewId: "main", gpuTimeMs: 1.5 }] });
    // The discarded frame never becomes measured later.
    expect(timing.snapshot(first)?.wholeFrameGpuTimeMs).toBeNull();
    expect(gl.maxActive).toBe(1);
  });

  it("does not report a frame total when a view query was cancelled mid-frame", () => {
    const gl = new TimeElapsedGl();
    const stats = new FrameStats(8, createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext));
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1, stats, "unused");
    timedView(timing, stats, frame, "main", true);
    timing.end(frame);
    expect(gl.active).toBeNull();
    gl.settle([1, 1, 1]);
    expect(timing.snapshot(frame)).toMatchObject({ wholeFrameGpuTimeMs: null, wholeFrameGpuStatus: "discarded",
      wholeFrameGpuReason: expect.stringMatching(/cancelled/) });
  });

  it("reports null with an explicit reason when EXT_disjoint_timer_query_webgl2 is absent", () => {
    const gl = new TimeElapsedGl(false);
    const stats = new FrameStats(8, createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext));
    expect(stats.gpuTimingSupported).toBe(false);
    const device = { info: { backend: "webgl2" } } as unknown as Parameters<typeof gpuTimingUnavailableReason>[0];
    const reason = gpuTimingUnavailableReason(device);
    expect(reason).toBe("EXT_disjoint_timer_query_webgl2 unavailable");
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(1, stats, reason);
    timedView(timing, stats, frame, "main");
    timing.end(frame);
    expect(gl.created).toHaveLength(0);
    expect(timing.snapshot(frame)).toMatchObject({ wholeFrameGpuTimeMs: null, wholeFrameGpuStatus: "unavailable",
      wholeFrameGpuReason: "EXT_disjoint_timer_query_webgl2 unavailable", views: [{ viewId: "main", gpuTimeMs: null }] });
    const webgpu = { info: { backend: "webgpu" } } as unknown as Parameters<typeof gpuTimingUnavailableReason>[0];
    expect(gpuTimingUnavailableReason(webgpu)).toMatch(/WebGPU timestamp-query/);
  });
});
