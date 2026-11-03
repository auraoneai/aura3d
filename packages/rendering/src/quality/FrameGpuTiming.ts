import {
  isScopedGpuTimingBackend,
  type RendererGpuScopedTimingBackend,
  type RendererGpuTimingBackend,
  type RendererGpuTimingToken
} from "../RendererTiming";

export type FrameGpuTimingStatus = "unavailable" | "pending" | "measured" | "discarded";

/** An opaque capture identity. Frame numbers may be reused after a failed frame. */
export interface FrameGpuCapture {
  readonly frameNumber: number;
}

export interface FrameGpuTimingSample {
  readonly frameNumber: number;
  readonly status: FrameGpuTimingStatus;
  /** A measured GPU duration only; CPU durations are never substituted. */
  readonly gpuTimeMs: number | null;
  readonly reason?: string;
}

interface CaptureState {
  readonly handle: FrameGpuCapture;
  readonly backend: RendererGpuScopedTimingBackend | null;
  readonly token: RendererGpuTimingToken | null;
  readonly generation: number;
  status: FrameGpuTimingStatus;
  gpuTimeMs: number | null;
  reason?: string;
  ended: boolean;
  retained: boolean;
}

/**
 * Captures real GPU query results for renderer frames. Each capture is matched
 * by backend token identity, rather than by its label or the most recent frame.
 *
 * This object owns the scoped backend supplied to it. Do not share that backend
 * with another independent poller: polling drains its result queue. To share a
 * device's existing timing backend, first provide a dispatcher that routes each
 * result to its token owner. Backends without `dispose` remain responsible for
 * releasing their own query resources after this recorder is invalidated.
 */
export class FrameGpuTiming {
  private backend: RendererGpuScopedTimingBackend | null;
  private readonly capacity: number;
  private readonly records: CaptureState[] = [];
  private readonly byHandle = new WeakMap<FrameGpuCapture, CaptureState>();
  private readonly byToken = new Map<RendererGpuTimingToken, CaptureState>();
  private generation = 0;
  private disposed = false;

  constructor(backend?: RendererGpuTimingBackend | null, capacity = 120) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) {
      throw new RangeError("Frame GPU timing capacity must be an integer from 1 to 4096.");
    }
    this.capacity = capacity;
    this.backend = backend?.supported && isScopedGpuTimingBackend(backend) ? backend : null;
  }

  /** Call immediately before submitting the GPU work belonging to this frame. */
  begin(frameNumber: number): FrameGpuCapture {
    if (this.disposed) throw new Error("Frame GPU timing has been disposed.");
    if (!Number.isSafeInteger(frameNumber) || frameNumber < 0) {
      throw new RangeError("Frame number must be a non-negative safe integer.");
    }
    const backend = this.backend;
    let token: RendererGpuTimingToken | null = null;
    if (backend) {
      try { token = backend.beginScope("renderer-frame"); } catch { /* Timing must not prevent rendering. */ }
    }
    const handle = Object.freeze({ frameNumber });
    const state: CaptureState = {
      handle, backend, token, generation: this.generation,
      status: token ? "pending" : "unavailable", gpuTimeMs: null,
      ...(token ? {} : { reason: backend ? "GPU query could not start." : "GPU timing is unavailable." }),
      ended: false, retained: true
    };
    this.byHandle.set(handle, state);
    if (token) this.byToken.set(token, state);
    this.records.push(state);
    while (this.records.length > this.capacity) {
      const evicted = this.records.shift()!;
      evicted.retained = false;
      if (evicted.token) this.byToken.delete(evicted.token);
    }
    return handle;
  }

  /** Call in the frame's finally block, including when rendering throws. */
  end(handle: FrameGpuCapture): void {
    const state = this.byHandle.get(handle);
    if (!state || state.ended) return;
    state.ended = true;
    if (!state.token || !state.backend || state.generation !== this.generation) return;
    try {
      state.backend.endScope(state.token);
    } catch {
      this.byToken.delete(state.token);
      state.status = "discarded";
      state.reason = "GPU query could not finish.";
    }
  }

  /** Harvest delayed results. Query failures disable timing without failing a frame. */
  poll(): void {
    if (this.disposed || !this.backend) return;
    let results;
    try { results = this.backend.poll(); }
    catch {
      this.invalidate("GPU timing query failed.");
      return;
    }
    for (const result of results) {
      const state = this.byToken.get(result.token);
      if (!state || !state.ended || state.generation !== this.generation) continue;
      this.byToken.delete(result.token);
      const duration = result.durationMs;
      if (duration === null || !Number.isFinite(duration) || duration < 0) {
        state.status = "discarded";
        state.reason = "GPU timing result was discarded or invalid.";
      } else {
        state.status = "measured";
        state.gpuTimeMs = duration;
        delete state.reason;
      }
    }
  }

  /** Read a retained capture; results may arrive several frames later. */
  sample(handle: FrameGpuCapture): FrameGpuTimingSample | null {
    const state = this.byHandle.get(handle);
    if (!state?.retained) return null;
    return {
      frameNumber: state.handle.frameNumber,
      status: state.status,
      gpuTimeMs: state.gpuTimeMs,
      ...(state.reason ? { reason: state.reason } : {})
    };
  }

  /** Invalidate outstanding queries on a real device loss or backend replacement. */
  invalidate(reason = "GPU device was lost."): void {
    this.generation += 1;
    const backend = this.backend;
    this.backend = null;
    for (const state of this.records) {
      if (state.status !== "pending") continue;
      state.status = "discarded";
      state.gpuTimeMs = null;
      state.reason = reason;
    }
    this.byToken.clear();
    try { backend?.dispose?.(); } catch { /* Lost devices may reject cleanup. */ }
  }

  /** Supply a newly created backend after device restoration. */
  restore(backend?: RendererGpuTimingBackend | null): void {
    if (this.disposed) throw new Error("Frame GPU timing has been disposed.");
    this.invalidate("GPU timing backend was replaced.");
    this.backend = backend?.supported && isScopedGpuTimingBackend(backend) ? backend : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.invalidate("GPU timing was disposed.");
    this.disposed = true;
  }
}
