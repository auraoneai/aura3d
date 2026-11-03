import { describe, expect, it } from "vitest";

import { FrameStats } from "../../../packages/rendering/src/quality/FrameStats";
import { FrameInspectionTiming } from "../../../packages/rendering/src/quality/FrameInspectionTiming";
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
