import { describe, expect, it } from "vitest";

import { createWebGL2GpuTimingBackend, isScopedGpuTimingBackend, type RendererGpuScopedTimingBackend } from "../../../../packages/rendering/src/RendererTiming";
import { FrameStats } from "../../../../packages/rendering/src/quality/FrameStats";

const EXT_TIME_ELAPSED = 0x88bf;
const EXT_TIMESTAMP = 0x8e28;
const EXT_DISJOINT = 0x8fbb;

/**
 * Fake WebGL2 timer-query surface. Queries become "available" after
 * `settleAfterPolls` QUERY_RESULT_AVAILABLE probes (a real GPU answers 2-3
 * frames later). `queryCounter` stamps a monotonically increasing fake clock.
 */
class FakeTimerGl {
  readonly QUERY_RESULT = 0x8866;
  readonly QUERY_RESULT_AVAILABLE = 0x8867;
  disjoint = false;
  /** QUERY_RESULT_AVAILABLE reports true on the (settleAfterPolls+1)-th probe. */
  settleAfterPolls = 1;
  private clockNs = 1_000_000;
  private readonly queries = new Map<object, { resultNs: number; pollsLeft: number }>();

  createQuery(): object {
    const query = {};
    this.queries.set(query, { resultNs: 0, pollsLeft: this.settleAfterPolls });
    return query;
  }

  beginQuery(): void {}
  endQuery(): void {}
  deleteQuery(query: object): void { this.queries.delete(query); }

  queryCounter(query: object, _target: number): void {
    this.clockNs += 2_000_000;
    const entry = this.queries.get(query);
    if (entry) entry.resultNs = this.clockNs;
  }

  getQueryParameter(query: object, pname: number): unknown {
    const entry = this.queries.get(query);
    if (!entry) return null;
    if (pname === this.QUERY_RESULT_AVAILABLE) {
      if (entry.pollsLeft > 0) {
        entry.pollsLeft -= 1;
        return false;
      }
      return true;
    }
    return entry.resultNs;
  }

  getParameter(pname: number): unknown {
    if (pname === EXT_DISJOINT) return this.disjoint;
    return null;
  }

  private ext: Record<string, unknown> | null = null;

  getExtension(name: string): unknown {
    if (name !== "EXT_disjoint_timer_query_webgl2") return null;
    this.ext ??= { ...FAKE_EXT, queryCounterEXT: (query: object, target: number) => this.queryCounter(query, target) };
    return this.ext;
  }
}

const FAKE_EXT = { TIME_ELAPSED_EXT: EXT_TIME_ELAPSED, GPU_DISJOINT_EXT: EXT_DISJOINT, TIMESTAMP_EXT: EXT_TIMESTAMP } as unknown as EXTDisjointTimerQueryWebGL2;

function makeBackend(gl = new FakeTimerGl()): { backend: RendererGpuScopedTimingBackend; gl: FakeTimerGl } {
  const backend = createWebGL2GpuTimingBackend(gl as unknown as WebGL2RenderingContext);
  if (!isScopedGpuTimingBackend(backend)) throw new Error("backend is not scoped");
  return { backend, gl };
}

describe("WebGL2 scoped GPU timing (prd11)", () => {
  it("resolves a scope's duration from a TIMESTAMP pair a few polls later", () => {
    const { backend } = makeBackend();
    const token = backend.beginScope("frame");
    backend.endScope(token);
    expect(backend.poll()).toHaveLength(0);          // still in flight
    const results = backend.poll();
    expect(results).toHaveLength(1);
    expect(results[0]!.durationMs).toBeCloseTo(2);   // 2 fake ms between counter stamps
    expect(results[0]!.label).toBe("frame");
  });

  it("settles a disjointed query with durationMs: null", () => {
    const { backend, gl } = makeBackend();
    const token = backend.beginScope("forward");
    backend.endScope(token);
    backend.poll();
    gl.disjoint = true;
    const results = backend.poll();
    expect(results).toHaveLength(1);
    expect(results[0]!.durationMs).toBeNull();
  });

  it("FrameStats writes gpuMs back into the stored sample once the query lands", () => {
    const { backend } = makeBackend();
    const stats = new FrameStats(240, backend);
    stats.begin(0);
    const sample = stats.end();
    expect(sample.gpuMs).toBeNull();                 // not resolved yet
    stats.begin(10);                                 // drains poll #1
    stats.end();
    stats.begin(20);                                 // drains poll #2 → resolves
    stats.end();
    expect(sample.gpuMs).toBeCloseTo(2);
    expect(stats.percentiles("gpuMs").max).toBeCloseTo(2);
  });

  it("FrameStats keeps gpuMs null across a disjoint frame", () => {
    const { backend, gl } = makeBackend();
    const stats = new FrameStats(240, backend);
    stats.begin(0);
    const sample = stats.end();
    // Disjoint begins while frame 1's timestamp pair is still in flight.
    gl.disjoint = true;
    stats.begin(10);   // drain poll #1
    stats.end();
    stats.begin(20);   // drain poll #2 → settles discarded → gpuMs stays null
    stats.end();
    expect(sample.gpuMs).toBeNull();
  });

  it("isScopedGpuTimingBackend narrows the factory result", () => {
    expect(isScopedGpuTimingBackend(createWebGL2GpuTimingBackend(new FakeTimerGl() as unknown as WebGL2RenderingContext))).toBe(true);
    expect(isScopedGpuTimingBackend(undefined)).toBe(false);
  });
});
