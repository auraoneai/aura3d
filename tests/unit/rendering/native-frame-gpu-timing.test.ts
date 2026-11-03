import { describe, expect, it } from "vitest";

import {
  RendererTimingCollector,
  createWebGL2GpuTimingBackend,
  isScopedGpuTimingBackend,
  type RendererGpuScopedResult,
  type RendererGpuScopedTimingBackend,
  type RendererGpuTimingToken
} from "../../../packages/rendering/src/RendererTiming";
import { FrameGpuTiming } from "../../../packages/rendering/src/quality/FrameGpuTiming";

class ControlledBackend implements RendererGpuScopedTimingBackend {
  readonly supported = true;
  readonly tokens: RendererGpuTimingToken[] = [];
  readonly ended: RendererGpuTimingToken[] = [];
  readonly ready: RendererGpuScopedResult[] = [];
  disposed = false;
  failPoll = false;

  begin(label: string): RendererGpuTimingToken { return this.beginScope(label); }
  end(token: RendererGpuTimingToken): undefined { this.endScope(token); return undefined; }
  beginScope(label: string): RendererGpuTimingToken {
    const token = { label };
    this.tokens.push(token);
    return token;
  }
  endScope(token: RendererGpuTimingToken): void { this.ended.push(token); }
  poll(): readonly RendererGpuScopedResult[] {
    if (this.failPoll) throw new Error("query unavailable");
    return this.ready.splice(0);
  }
  dispose(): void { this.disposed = true; }
  settle(index: number, durationMs: number | null): void {
    const token = this.tokens[index]!;
    this.ready.push({ token, label: token.label, durationMs });
  }
}

class FakeGl {
  readonly QUERY_RESULT = 0x8866;
  readonly QUERY_RESULT_AVAILABLE = 0x8867;
  readonly TIME_ELAPSED = 0x88bf;
  readonly TIMESTAMP = 0x8e28;
  readonly DISJOINT = 0x8fbb;
  readonly COUNTER_BITS = 0x8864;
  readonly queries = new Map<object, number>();
  disjoint = false;
  clearDisjointOnRead = false;
  timestampBits = 64;
  stamps = 0;
  throwOnStamp = 0;
  endCalls = 0;
  private readonly extension = {
    TIME_ELAPSED_EXT: this.TIME_ELAPSED,
    GPU_DISJOINT_EXT: this.DISJOINT,
    TIMESTAMP_EXT: this.TIMESTAMP,
    QUERY_COUNTER_BITS_EXT: this.COUNTER_BITS,
    queryCounterEXT: (query: object): void => {
      this.stamps += 1;
      if (this.stamps === this.throwOnStamp) throw new Error("stamp failed");
      this.queries.set(query, this.stamps * 1_000_000);
    }
  };

  getExtension(name: string): unknown { return name === "EXT_disjoint_timer_query_webgl2" ? this.extension : null; }
  getQuery(target: number, parameter: number): number { return target === this.TIMESTAMP && parameter === this.COUNTER_BITS ? this.timestampBits : 0; }
  createQuery(): object { const query = {}; this.queries.set(query, 0); return query; }
  deleteQuery(query: object): void { this.queries.delete(query); }
  beginQuery(): void {}
  endQuery(): void { this.endCalls += 1; }
  getParameter(name: number): boolean {
    const result = name === this.DISJOINT && this.disjoint;
    if (result && this.clearDisjointOnRead) this.disjoint = false;
    return result;
  }
  getQueryParameter(query: object, name: number): number | boolean {
    return name === this.QUERY_RESULT_AVAILABLE ? this.queries.has(query) : this.queries.get(query) ?? 0;
  }
}

const scopedBackend = (gl: FakeGl) => createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext);

describe("frame GPU query timing", () => {
  it("attributes delayed out-of-order results to capture identity, even when frame numbers repeat", () => {
    const backend = new ControlledBackend();
    const timing = new FrameGpuTiming(backend);
    const first = timing.begin(7);
    timing.end(first);
    const second = timing.begin(7);
    timing.end(second);
    backend.settle(1, 3.5);
    timing.poll();
    expect(timing.sample(first)).toMatchObject({ frameNumber: 7, status: "pending", gpuTimeMs: null });
    expect(timing.sample(second)).toEqual({ frameNumber: 7, status: "measured", gpuTimeMs: 3.5 });
    backend.settle(0, 1.25);
    timing.poll();
    expect(timing.sample(first)).toEqual({ frameNumber: 7, status: "measured", gpuTimeMs: 1.25 });
    timing.dispose();
    expect(backend.disposed).toBe(true);
  });

  it("leaves unsupported, discarded, and invalid GPU values null rather than reporting CPU time", () => {
    const unsupported = new FrameGpuTiming();
    const noGpu = unsupported.begin(1);
    unsupported.end(noGpu);
    expect(unsupported.sample(noGpu)).toMatchObject({ status: "unavailable", gpuTimeMs: null });
    const backend = new ControlledBackend();
    const timing = new FrameGpuTiming(backend);
    const handles = [2, 3, 4].map((frame) => timing.begin(frame));
    handles.forEach((handle) => timing.end(handle));
    backend.settle(0, null);
    backend.settle(1, Number.NaN);
    backend.settle(2, -1);
    timing.poll();
    for (const handle of handles) expect(timing.sample(handle)).toMatchObject({ status: "discarded", gpuTimeMs: null });
  });

  it("discards real backend results on disjoint without leaking query handles", () => {
    const gl = new FakeGl();
    const timing = new FrameGpuTiming(scopedBackend(gl));
    const frame = timing.begin(1);
    timing.end(frame);
    expect(gl.queries.size).toBe(2);
    gl.disjoint = true;
    timing.poll();
    expect(timing.sample(frame)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    expect(gl.queries.size).toBe(0);
  });

  it("discards reversed timestamp pairs and negative elapsed results instead of reporting zero", () => {
    const timestampGl = new FakeGl();
    const timestampTiming = new FrameGpuTiming(scopedBackend(timestampGl));
    const timestamps = timestampTiming.begin(1);
    timestampTiming.end(timestamps);
    const [start, end] = [...timestampGl.queries.keys()];
    timestampGl.queries.set(start!, 5_000_000);
    timestampGl.queries.set(end!, 4_000_000);
    timestampTiming.poll();
    expect(timestampTiming.sample(timestamps)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    expect(timestampGl.queries.size).toBe(0);

    const elapsedGl = new FakeGl();
    elapsedGl.timestampBits = 0;
    const elapsedTiming = new FrameGpuTiming(scopedBackend(elapsedGl));
    const elapsed = elapsedTiming.begin(2);
    elapsedTiming.end(elapsed);
    const query = [...elapsedGl.queries.keys()][0]!;
    elapsedGl.queries.set(query, -1);
    elapsedTiming.poll();
    expect(elapsedTiming.sample(elapsed)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    expect(elapsedGl.queries.size).toBe(0);
  });

  it("releases active and pending queries on device loss, and accepts a fresh restored backend", () => {
    const gl = new FakeGl();
    const timing = new FrameGpuTiming(scopedBackend(gl));
    const pending = timing.begin(1);
    timing.end(pending);
    const active = timing.begin(2);
    expect(gl.queries.size).toBe(3);
    timing.invalidate();
    expect(gl.queries.size).toBe(0);
    expect(timing.sample(pending)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    expect(timing.sample(active)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    timing.end(active);
    const replacement = new ControlledBackend();
    timing.restore(replacement);
    const next = timing.begin(3);
    timing.end(next);
    replacement.settle(0, 2.75);
    timing.poll();
    expect(timing.sample(next)).toEqual({ frameNumber: 3, status: "measured", gpuTimeMs: 2.75 });
    timing.dispose();
    expect(() => timing.begin(4)).toThrow(/disposed/);
  });

  it("ends and deletes an active elapsed-time query when its owning recorder is disposed", () => {
    const gl = new FakeGl();
    gl.timestampBits = 0;
    const timing = new FrameGpuTiming(scopedBackend(gl));
    const active = timing.begin(1);
    expect(gl.queries.size).toBe(1);
    timing.dispose();
    expect(gl.endCalls).toBe(1);
    expect(gl.queries.size).toBe(0);
    expect(timing.sample(active)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    timing.end(active);
    expect(gl.endCalls).toBe(1);
  });

  it("bounds retained frames and ignores a late result for an evicted capture", () => {
    const backend = new ControlledBackend();
    const timing = new FrameGpuTiming(backend, 2);
    const first = timing.begin(1); timing.end(first);
    const second = timing.begin(2); timing.end(second);
    const third = timing.begin(3); timing.end(third);
    backend.settle(0, 9);
    backend.settle(2, 4);
    timing.poll();
    expect(timing.sample(first)).toBeNull();
    expect(timing.sample(second)).toMatchObject({ status: "pending", gpuTimeMs: null });
    expect(timing.sample(third)).toMatchObject({ status: "measured", gpuTimeMs: 4 });
  });

  it("does not fail rendering if query polling or finishing fails", () => {
    const backend = new ControlledBackend();
    const timing = new FrameGpuTiming(backend);
    const frame = timing.begin(1);
    timing.end(frame);
    timing.end(frame);
    expect(backend.ended).toHaveLength(1);
    backend.failPoll = true;
    expect(() => timing.poll()).not.toThrow();
    expect(timing.sample(frame)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    expect(backend.disposed).toBe(true);
    const gl = new FakeGl();
    gl.throwOnStamp = 2;
    const frameTiming = new FrameGpuTiming(scopedBackend(gl));
    const broken = frameTiming.begin(2);
    expect(() => frameTiming.end(broken)).not.toThrow();
    expect(frameTiming.sample(broken)).toMatchObject({ status: "discarded", gpuTimeMs: null });
    expect(gl.queries.size).toBe(0);
    const failingStartGl = new FakeGl();
    failingStartGl.throwOnStamp = 1;
    const failingStart = new FrameGpuTiming(scopedBackend(failingStartGl));
    const noQuery = failingStart.begin(3);
    expect(failingStart.sample(noQuery)).toMatchObject({ status: "unavailable", gpuTimeMs: null });
    expect(failingStartGl.queries.size).toBe(0);
  });

  it("settles an evicted backend query as discarded instead of losing its token", () => {
    const gl = new FakeGl();
    const backend = scopedBackend(gl);
    if (!isScopedGpuTimingBackend(backend)) throw new Error("Expected a scoped backend");
    const tokens = Array.from({ length: 65 }, () => {
      const token = backend.beginScope("frame");
      backend.endScope(token);
      return token;
    });
    const results = backend.poll();
    expect(results).toHaveLength(65);
    expect(results.find((result) => result.token === tokens[0])?.durationMs).toBeNull();
    expect(results.find((result) => result.token === tokens[1])?.durationMs).toBe(1);
    expect(gl.queries.size).toBe(0);
  });

  it.each(["frame-first", "scope-first"])("invalidates both query queues when a disjoint flag clears on read: %s", (order) => {
    const gl = new FakeGl();
    gl.clearDisjointOnRead = true;
    const backend = scopedBackend(gl);
    if (!isScopedGpuTimingBackend(backend)) throw new Error("Expected a scoped backend");
    const frame = backend.begin("frame");
    backend.end(frame, 0);
    const scope = backend.beginScope("forward");
    backend.endScope(scope);
    gl.disjoint = true;
    let frames: ReturnType<NonNullable<typeof backend.collectAvailable>>;
    let scopes: ReturnType<typeof backend.poll>;
    if (order === "frame-first") {
      frames = backend.collectAvailable!();
      scopes = backend.poll();
    } else {
      scopes = backend.poll();
      frames = backend.collectAvailable!();
    }
    expect(frames).toEqual([]);
    expect(backend.drainDiscarded?.()).toEqual([frame]);
    expect(scopes).toEqual([{ token: scope, label: "forward", durationMs: null }]);
    expect(gl.queries.size).toBe(0);
  });

  it("discards a scope that remains open while a disjoint flag is observed", () => {
    const gl = new FakeGl();
    gl.clearDisjointOnRead = true;
    const backend = scopedBackend(gl);
    if (!isScopedGpuTimingBackend(backend)) throw new Error("Expected a scoped backend");
    const active = backend.beginScope("forward");
    gl.disjoint = true;
    expect(backend.poll()).toEqual([]);
    backend.endScope(active);
    expect(backend.poll()).toEqual([{ token: active, label: "forward", durationMs: null }]);
    expect(gl.queries.size).toBe(0);
  });

  it("discards an elapsed frame query that remains open across a disjoint event", () => {
    const gl = new FakeGl();
    gl.clearDisjointOnRead = true;
    const backend = scopedBackend(gl);
    if (!isScopedGpuTimingBackend(backend)) throw new Error("Expected a scoped backend");
    const active = backend.begin("frame");
    gl.disjoint = true;
    expect(backend.poll()).toEqual([]);
    backend.end(active, 0);
    expect(backend.collectAvailable?.()).toEqual([]);
    expect(backend.drainDiscarded?.()).toEqual([active]);
    expect(gl.queries.size).toBe(0);
  });

  it("reports pending scoped tokens as discarded when the backend is disposed", () => {
    const gl = new FakeGl();
    const backend = scopedBackend(gl);
    if (!isScopedGpuTimingBackend(backend)) throw new Error("Expected a scoped backend");
    const first = backend.beginScope("frame");
    backend.endScope(first);
    const active = backend.beginScope("forward");
    backend.dispose?.();
    expect(gl.queries.size).toBe(0);
    expect(backend.poll()).toEqual([
      { token: active, label: "forward", durationMs: null },
      { token: first, label: "frame", durationMs: null }
    ]);
    expect(backend.poll()).toEqual([]);
    expect(() => backend.beginScope("next")).toThrow(/disposed/);
  });
});

describe("GPU timing collector attribution", () => {
  it("uses token identity for repeated labels and rejects invalid GPU measurements", () => {
    const tokens: RendererGpuTimingToken[] = [];
    const ready: Array<{ label: string; token: RendererGpuTimingToken; durationMs: number }> = [];
    const collector = new RendererTimingCollector({ now: (() => { let n = 0; return () => ++n; })(), gpuBackend: {
      supported: true,
      begin(label) { const token = { label }; tokens.push(token); return token; },
      end() { return undefined; },
      collectAvailable() { return ready.splice(0); }
    } });
    collector.measure("frame", () => undefined);
    collector.measure("frame", () => undefined);
    ready.push({ label: "frame", token: tokens[1]!, durationMs: 4 });
    let samples = collector.snapshot().samples;
    expect(samples[0]!.source).toBe("cpu-fallback");
    expect(samples[1]).toMatchObject({ source: "gpu", gpuDurationMs: 4 });
    ready.push({ label: "frame", token: tokens[0]!, durationMs: -5 });
    samples = collector.snapshot().samples;
    expect(samples[0]!.source).toBe("cpu-fallback");
  });
});
