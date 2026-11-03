import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameStats } from "../../../packages/rendering/src/quality/FrameStats";
import type {
  RendererGpuScopedResult,
  RendererGpuScopedTimingBackend,
  RendererGpuTimingToken,
} from "../../../packages/rendering/src/RendererTiming";

interface Token extends RendererGpuTimingToken {
  readonly id: number;
}

/** A query-shaped source double: only explicitly settled tokens produce results. */
class ScopedTimer implements RendererGpuScopedTimingBackend {
  readonly events: string[] = [];
  readonly tokens: Token[] = [];
  readonly ready: RendererGpuScopedResult[] = [];
  throwOnBegin?: string;
  throwOnEnd?: string;
  onBegin?: (token: Token) => void;
  onEnd?: (token: RendererGpuTimingToken) => void;

  constructor(readonly supported = true) {}

  begin(label: string): RendererGpuTimingToken { return this.beginScope(label); }
  end(token: RendererGpuTimingToken, _cpuDurationMs: number): undefined {
    this.endScope(token);
    return undefined;
  }
  beginScope(label: string): Token {
    this.events.push(`begin:${label}`);
    if (label === this.throwOnBegin) throw new Error("query start failed");
    const token = { label, id: this.tokens.length };
    this.tokens.push(token);
    this.onBegin?.(token);
    return token;
  }
  endScope(token: RendererGpuTimingToken): void {
    this.events.push(`end:${token.label}`);
    if (token.label === this.throwOnEnd) throw new Error("query end failed");
    this.onEnd?.(token);
  }
  poll(): readonly RendererGpuScopedResult[] { return this.ready.splice(0); }
  pollWithoutAging(): readonly RendererGpuScopedResult[] { return this.poll(); }
  settle(token: RendererGpuTimingToken, durationMs: number | null): void {
    this.ready.push({ token, label: token.label, durationMs });
  }
}

afterEach(() => vi.restoreAllMocks());

describe("frame GPU scope boundaries", () => {
  it("brackets only each callback and combines repeated labels after all queries settle", () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    stats.begin(now);
    expect(stats.scope("forward", () => { backend.events.push("work:first"); now += 4; return 17; })).toBe(17);
    now += 100; // Work outside the measured scope must not extend its GPU query.
    stats.scope("forward", () => { backend.events.push("work:second"); now += 6; });
    const sample = stats.end();
    expect(backend.events).toEqual([
      "begin:frame", "begin:forward", "work:first", "end:forward",
      "begin:forward", "work:second", "end:forward", "end:frame",
    ]);
    expect(sample.scopes.forward).toBe(10);
    backend.settle(backend.tokens[2]!, 3);
    stats.percentiles("gpuMs");
    expect(sample.scopes.forward).toBe(10); // No partial GPU total.
    backend.settle(backend.tokens[1]!, 2);
    backend.settle(backend.tokens[0]!, 12);
    stats.percentiles("gpuMs");
    expect(sample.scopes.forward).toBe(5);
    expect(sample.gpuMs).toBe(12);
  });

  it("ends nested scopes inside-out and keeps a scope named frame distinct from the whole frame", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    stats.begin(0);
    stats.scope("frame", () => stats.scope("inner", () => backend.events.push("work")));
    const sample = stats.end();
    expect(backend.events).toEqual([
      "begin:frame", "begin:frame", "begin:inner", "work", "end:inner", "end:frame", "end:frame",
    ]);
    backend.settle(backend.tokens[0]!, 9);
    backend.settle(backend.tokens[1]!, 4);
    backend.settle(backend.tokens[2]!, 1);
    stats.percentiles("gpuMs");
    expect(sample.gpuMs).toBe(9);
    expect(sample.scopes.frame).toBe(4);
    expect(sample.scopes.inner).toBe(1);
  });

  it("keeps CPU scope totals and a null GPU frame when any result is disjoint or invalid", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    stats.begin(now);
    stats.scope("forward", () => { now += 4; });
    stats.scope("forward", () => { now += 6; });
    stats.scope("shadow", () => { now += 3; });
    stats.scope("post", () => { now += 2; });
    const sample = stats.end();
    backend.settle(backend.tokens[0]!, Number.NaN);
    backend.settle(backend.tokens[1]!, 2);
    backend.settle(backend.tokens[2]!, null);
    backend.settle(backend.tokens[3]!, -1);
    backend.settle(backend.tokens[4]!, Number.POSITIVE_INFINITY);
    stats.percentiles("gpuMs");
    expect(sample.gpuMs).toBeNull();
    expect(sample.scopes.forward).toBe(10);
    expect(sample.scopes.shadow).toBe(3);
    expect(sample.scopes.post).toBe(2);
  });

  it("preserves callback errors and CPU timing when a GPU scope cannot end", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const backend = new ScopedTimer();
    backend.throwOnEnd = "forward";
    const stats = new FrameStats(8, backend);
    const original = new Error("render failed");
    stats.begin(now);
    let thrown: unknown;
    try { stats.scope("forward", () => { now += 7; throw original; }); } catch (error) { thrown = error; }
    expect(thrown).toBe(original);
    const sample = stats.end();
    expect(sample.scopes.forward).toBe(7);
    expect(backend.events).toEqual(["begin:frame", "begin:forward", "end:forward", "end:frame"]);
  });

  it("does not report an incomplete GPU sum when a repeated scope fails to start", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    stats.begin(now);
    stats.scope("forward", () => { now += 4; });
    backend.throwOnBegin = "forward";
    stats.scope("forward", () => { now += 6; });
    const sample = stats.end();
    backend.settle(backend.tokens[1]!, 2);
    stats.percentiles("gpuMs");
    expect(sample.scopes.forward).toBe(10);
  });

  it("does not consume a current-frame query while inspecting older results", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    stats.begin(0);
    const previous = stats.end();
    stats.begin(1);
    stats.scope("forward", () => undefined);
    backend.settle(backend.tokens[0]!, 9);
    backend.settle(backend.tokens[2]!, 4);
    stats.percentiles("gpuMs");
    expect(previous.gpuMs).toBeNull();
    const current = stats.end();
    expect(previous.gpuMs).toBe(9);
    expect(current.scopes.forward).toBe(4);
  });

  it("does not use an unsupported backend or manufacture GPU time from CPU time", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const backend = new ScopedTimer(false);
    const stats = new FrameStats(8, backend);
    stats.begin(now);
    stats.scope("forward", () => { now += 5; });
    const sample = stats.end();
    expect(backend.events).toEqual([]);
    expect(sample.scopes.forward).toBe(5);
    expect(sample.gpuMs).toBeNull();
  });

  it("ends and discards an abandoned frame before starting the next one", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    stats.begin(0);
    stats.scope("old", () => undefined);
    stats.begin(10);
    stats.scope("new", () => undefined);
    const sample = stats.end();
    backend.settle(backend.tokens[0]!, 100);
    backend.settle(backend.tokens[1]!, 100);
    backend.settle(backend.tokens[2]!, 8);
    backend.settle(backend.tokens[3]!, 3);
    stats.percentiles("gpuMs");
    expect(sample.gpuMs).toBe(8);
    expect(sample.scopes).not.toHaveProperty("old");
    expect(sample.scopes.new).toBe(3);
  });

  it("drops stale pending results without attributing them to later frames", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(2, backend);
    stats.begin(0);
    const oldest = stats.end();
    for (let frame = 1; frame < 1025; frame += 1) {
      stats.begin(frame);
      stats.end();
    }
    stats.begin(1025);
    const newest = stats.end();
    backend.settle(backend.tokens[0]!, 20);
    backend.settle(backend.tokens.at(-1)!, 2);
    stats.percentiles("gpuMs");
    expect(oldest.gpuMs).toBeNull();
    expect(newest.gpuMs).toBe(2);
  });

  it("keeps CPU fallback for an over-budget scope group while retaining the frame query", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const backend = new ScopedTimer();
    const stats = new FrameStats(2, backend);
    stats.begin(now);
    for (let index = 0; index < 1024; index += 1) stats.scope("forward", () => { now += 1; });
    const sample = stats.end();
    backend.settle(backend.tokens[0]!, 20);
    backend.settle(backend.tokens.at(-1)!, 2);
    stats.percentiles("gpuMs");
    expect(sample.gpuMs).toBe(20);
    expect(sample.scopes.forward).toBe(1024);
  });

  it("ignores overwritten, duplicate, and foreign tracked handles", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const other = new FrameStats(8, new ScopedTimer());
    const old = stats.beginTracked(0);
    const current = stats.beginTracked(1);
    const foreign = other.beginTracked(2);
    expect(stats.endTracked(old)).toBeNull();
    stats.cancelTracked(old);
    stats.cancelTracked(foreign);
    expect(stats.endTracked(foreign)).toBeNull();
    const sample = stats.endTracked(current);
    expect(sample).not.toBeNull();
    expect(stats.endTracked(current)).toBeNull();
    stats.cancelTracked(current);
    expect(stats.samples).toBe(1);
    expect(backend.events).toEqual(["begin:frame", "end:frame", "begin:frame", "end:frame"]);
    expect(other.endTracked(foreign)).not.toBeNull();
  });

  it("cancels the represented frame, retires its queries, and records no sample", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const handle = stats.beginTracked(0);
    stats.scope("forward", () => undefined);
    stats.cancelTracked(handle);
    stats.cancelTracked(handle);
    expect(stats.samples).toBe(0);
    expect(stats.endTracked(handle)).toBeNull();
    expect(backend.events).toEqual(["begin:frame", "begin:forward", "end:forward", "end:frame"]);
    backend.settle(backend.tokens[0]!, 99);
    backend.settle(backend.tokens[1]!, 88);
    stats.pollGpuResults();
    expect(backend.ready).toHaveLength(0);
    const next = stats.beginTracked(1);
    const sample = stats.endTracked(next);
    backend.settle(backend.tokens[2]!, 3);
    stats.pollGpuResults();
    expect(sample?.gpuMs).toBe(3);
    expect(stats.samples).toBe(1);
  });

  it("polls delayed tracked-frame results by their original token", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const first = stats.beginTracked(0);
    const sample = stats.endTracked(first);
    const second = stats.beginTracked(1);
    const nextSample = stats.endTracked(second);
    backend.settle(backend.tokens[1]!, 4);
    stats.pollGpuResults();
    expect(sample?.gpuMs).toBeNull();
    expect(nextSample?.gpuMs).toBe(4);
    backend.settle(backend.tokens[0]!, 9);
    stats.pollGpuResults();
    expect(sample?.gpuMs).toBe(9);
    expect(nextSample?.gpuMs).toBe(4);
  });

  it("does not clear a frame started reentrantly while the previous frame ends", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const first = stats.beginTracked(0);
    let second: object | undefined;
    backend.onEnd = (token) => {
      if (token === backend.tokens[0]) {
        backend.onEnd = undefined;
        second = stats.beginTracked(1);
      }
    };
    const firstSample = stats.endTracked(first);
    expect(firstSample).not.toBeNull();
    expect(second).toBeDefined();
    expect(stats.endTracked(first)).toBeNull();
    expect(stats.endTracked(second!)).not.toBeNull();
    expect(stats.samples).toBe(2);
  });

  it("does not cancel a frame started reentrantly while the previous frame is cancelled", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const first = stats.beginTracked(0);
    let second: object | undefined;
    backend.onEnd = (token) => {
      if (token === backend.tokens[0]) {
        backend.onEnd = undefined;
        second = stats.beginTracked(1);
      }
    };
    stats.cancelTracked(first);
    expect(stats.samples).toBe(0);
    expect(stats.endTracked(first)).toBeNull();
    expect(stats.endTracked(second!)).not.toBeNull();
    expect(stats.samples).toBe(1);
  });

  it("retires a scope cancelled inside its callback without recording a frame", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const handle = stats.beginTracked(0);
    stats.scope("forward", () => stats.cancelTracked(handle));
    backend.settle(backend.tokens[0]!, 9);
    backend.settle(backend.tokens[1]!, 4);
    stats.pollGpuResults();
    expect(backend.ready).toHaveLength(0);
    expect(stats.samples).toBe(0);
    expect(stats.endTracked(handle)).toBeNull();
  });

  it("does not attach a reentrantly ended scope to the newer tracked frame", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const first = stats.beginTracked(0);
    let second: object | undefined;
    backend.onEnd = (token) => {
      if (token.label === "forward") {
        backend.onEnd = undefined;
        second = stats.beginTracked(1);
      }
    };
    stats.scope("forward", () => undefined);
    expect(stats.endTracked(first)).toBeNull();
    const sample = stats.endTracked(second!);
    expect(sample?.scopes).not.toHaveProperty("forward");
    backend.settle(backend.tokens[1]!, 99);
    backend.settle(backend.tokens[2]!, 4);
    stats.pollGpuResults();
    expect(sample?.gpuMs).toBe(4);
    expect(sample?.scopes).not.toHaveProperty("forward");
  });

  it("returns its own stale identity when the backend reenters begin", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    let inner: object | undefined;
    backend.onBegin = (token) => {
      if (token.id === 0) {
        backend.onBegin = undefined;
        inner = stats.beginTracked(1);
      }
    };
    const returned = stats.beginTracked(0);
    expect(returned).not.toBe(inner);
    expect(stats.endTracked(returned)).toBeNull();
    expect(stats.endTracked(inner!)).not.toBeNull();
    expect(backend.events).toEqual(["begin:frame", "begin:frame", "end:frame", "end:frame"]);
  });

  it("leaves a newer frame intact when abandoning an older query reenters begin", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    const first = stats.beginTracked(0);
    let inner: object | undefined;
    backend.onEnd = (token) => {
      if (token === backend.tokens[0]) {
        backend.onEnd = undefined;
        inner = stats.beginTracked(2);
      }
    };
    const outer = stats.beginTracked(1);
    expect(stats.endTracked(first)).toBeNull();
    expect(stats.endTracked(outer)).toBeNull();
    expect(stats.endTracked(inner!)).not.toBeNull();
    expect(stats.samples).toBe(1);
  });

  it("returns an inert handle when a backend callback ends the frame during begin", () => {
    const backend = new ScopedTimer();
    const stats = new FrameStats(8, backend);
    backend.onBegin = (token) => {
      if (token.id === 0) {
        backend.onBegin = undefined;
        stats.end();
      }
    };
    const handle = stats.beginTracked(0);
    expect(handle).toEqual({});
    expect(stats.endTracked(handle)).toBeNull();
    stats.cancelTracked(handle);
    const next = stats.beginTracked(1);
    expect(stats.endTracked(next)).not.toBeNull();
  });
});
