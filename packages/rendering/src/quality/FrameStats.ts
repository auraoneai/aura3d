/**
 * PRD 11 Phase 0 — real `frameStatsSlot` provider (C-28).
 *
 * A fixed-capacity ring of per-frame samples. CPU fields are measured directly;
 * GPU fields arrive 2-3 frames later from a scoped `RendererGpuTimingBackend`
 * (TIMESTAMP_EXT query pairs in `RendererTiming.ts`) and are written back into
 * the stored sample when `poll()` returns them. `gpuMs` stays `null` when no
 * timer backend exists or a query is discarded after `GPU_DISJOINT_EXT`.
 *
 * `fps()` is the strict measured value (`null` before 30 samples, CONTRACTS
 * C-28). `legacyFps()` reproduces the pre-QR engine estimator (`0` before 2
 * samples) so lane 15's diagnostics/overlay can swap to it via Q-15-1 without
 * reproducing the formula.
 */

import type { DeviceCounters, FrameStatsLike, FrameStatsSample } from "../contracts/device";
import {
  isScopedGpuTimingBackend,
  type RendererGpuScopedTimingBackend,
  type RendererGpuTimingBackend,
  type RendererGpuTimingToken
} from "../RendererTiming";

export type FrameStatsPercentileField = "intervalMs" | "cpuFrameMs" | "cpuSubmitMs" | "gpuMs";
export interface FrameStatsPercentiles { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number; }

interface MutableFrameStatsSample {
  intervalMs: number;
  cpuFrameMs: number;
  cpuSubmitMs: number;
  gpuMs: number | null;
  scopes: Record<string, number>;
}

interface GpuScopeAggregate {
  readonly sample: MutableFrameStatsSample;
  readonly name: string;
  remaining: number;
  durationMs: number;
  valid: boolean;
}

type PendingGpuScope =
  | { readonly token: RendererGpuTimingToken; readonly kind: "frame"; readonly sample: MutableFrameStatsSample }
  | { readonly token: RendererGpuTimingToken; readonly kind: "scope"; readonly aggregate: GpuScopeAggregate }
  | { readonly token: RendererGpuTimingToken; readonly kind: "discard" };

// A driver or custom backend may never return a result, or may discard a query
// without reporting its token. Do not retain frame samples indefinitely.
const MAX_PENDING_GPU_SCOPES = 1024;
// Reserve one slot for the enclosing frame query when its scopes are queued.
const MAX_COMPLETED_GPU_SCOPES_PER_FRAME = MAX_PENDING_GPU_SCOPES - 1;

export class FrameStats implements FrameStatsLike {
  private readonly ring: (MutableFrameStatsSample | undefined)[];
  private writeIndex = 0;
  private sampleCountValue = 0;
  private lastBeginTs: number | null = null;
  private frameStart = 0;
  private submitStart = 0;
  private cpuScopes: Record<string, number> = Object.create(null) as Record<string, number>;
  private completedScopes: { readonly name: string; readonly token: RendererGpuTimingToken }[] = [];
  private readonly failedGpuScopes = new Set<string>();
  private pendingGpu: PendingGpuScope[] = [];
  private frameToken: RendererGpuTimingToken | null = null;
  private readonly gpu: RendererGpuScopedTimingBackend | null;
  private frameActive = false;
  private frameGeneration = 0;
  private frameIdentity: object | null = null;
  private requestedTrackedIdentity: object | null = null;

  constructor(capacity = 240, gpu?: RendererGpuTimingBackend) {
    this.ring = new Array<MutableFrameStatsSample | undefined>(Math.max(1, Math.floor(capacity)));
    this.gpu = gpu?.supported && isScopedGpuTimingBackend(gpu) ? gpu : null;
  }

  /** Number of live samples in the ring (≤ capacity). Test/diagnostic surface; not in FrameStatsLike. */
  get samples(): number {
    return this.sampleCountValue;
  }

  begin(ts: number): void {
    // Claim this invocation's requested identity before invoking a backend:
    // callbacks may synchronously begin a different tracked frame.
    const identity = this.requestedTrackedIdentity ?? Object.freeze({});
    this.requestedTrackedIdentity = null;
    const generationAtEntry = this.frameGeneration;
    this.abandonFrame();
    if (this.frameGeneration !== generationAtEntry) return;
    this.drainGpu();
    // A backend callback may have started a newer frame. Leave it intact and
    // let this invocation's identity remain inert.
    if (this.frameGeneration !== generationAtEntry) return;
    this.frameStart = ts;
    this.submitStart = ts;
    this.cpuScopes = Object.create(null) as Record<string, number>;
    this.completedScopes = [];
    this.failedGpuScopes.clear();
    this.frameToken = null;
    this.frameActive = true;
    this.frameGeneration += 1;
    this.frameIdentity = identity;
    if (this.gpu) {
      try {
        const token = this.gpu.beginScope("frame");
        if (this.frameActive && this.frameIdentity === identity) {
          this.frameToken = token;
        } else {
          // A reentrant begin/end replaced this frame while the backend was
          // starting its query. Retire the old query without recording it.
          this.enqueueGpu({ token, kind: "discard" });
          try { this.gpu.endScope(token); } catch { /* Backend may already be lost. */ }
        }
      } catch {
        // Do not clear the token of a newer frame started by the backend.
        if (this.frameIdentity === identity) this.frameToken = null;
      }
    }
  }

  /** Start a frame and return its opaque identity for a matching end/cancel. */
  beginTracked(ts: number): object {
    const identity = Object.freeze({});
    const previous = this.requestedTrackedIdentity;
    this.requestedTrackedIdentity = identity;
    try { this.begin(ts); } finally { this.requestedTrackedIdentity = previous; }
    // The handle is inert if reentrant work replaced or ended this frame.
    return identity;
  }

  /** End only the frame represented by this identity. Stale handles are inert. */
  endTracked(handle: object): FrameStatsSample | null {
    if (!this.frameActive || this.frameIdentity !== handle) return null;
    return this.end();
  }

  /** Discard only the represented active frame, including its GPU query. */
  cancelTracked(handle: object): void {
    if (!this.frameActive || this.frameIdentity !== handle) return;
    this.abandonFrame();
    this.drainGpu();
  }

  /** Poll delayed GPU results without changing the active frame. */
  pollGpuResults(): void {
    this.drainGpu(true);
  }

  end(): FrameStatsSample {
    // Detach before external backend calls. Those calls may synchronously
    // begin another frame; cleanup below must not clear that newer state.
    const frameStart = this.frameStart;
    const submitStart = this.submitStart;
    const scopes = this.cpuScopes;
    const completedScopes = this.completedScopes;
    const failedGpuScopes = new Set(this.failedGpuScopes);
    const frameToken = this.frameToken;
    this.completedScopes = [];
    this.failedGpuScopes.clear();
    this.frameToken = null;
    this.frameActive = false;
    this.frameIdentity = null;
    const now = nowMs();
    const intervalMs = this.lastBeginTs === null ? 0 : frameStart - this.lastBeginTs;
    this.lastBeginTs = frameStart;
    const sample: MutableFrameStatsSample = {
      intervalMs,
      cpuFrameMs: now - frameStart,
      cpuSubmitMs: now - submitStart,
      gpuMs: null,
      scopes: { ...scopes }
    };
    // Repeated scopes with the same name are reported as one sum. Keep the CPU
    // total until every corresponding GPU token has settled successfully; a
    // partial or disjoint sum would be misleading.
    const aggregates = new Map<string, GpuScopeAggregate>();
    for (const scope of completedScopes) {
      let aggregate = aggregates.get(scope.name);
      if (!aggregate) {
        aggregate = { sample, name: scope.name, remaining: 0, durationMs: 0, valid: !failedGpuScopes.has(scope.name) };
        aggregates.set(scope.name, aggregate);
      }
      aggregate.remaining += 1;
    }
    for (const scope of completedScopes) {
      this.enqueueGpu({ token: scope.token, kind: "scope", aggregate: aggregates.get(scope.name)! });
    }
    this.pushSample(sample);
    if (this.gpu && frameToken) {
      // Register before calling the backend so a reentrant poll cannot consume
      // a result before it has a sample to attach to.
      const pending: PendingGpuScope = { token: frameToken, kind: "frame", sample };
      this.enqueueGpu(pending);
      try {
        this.gpu.endScope(frameToken);
      } catch {
        this.removePendingGpu(pending);
        sample.gpuMs = null;
        // GPU clock vanished mid-frame; the sample stays cpu-only.
      }
    }
    this.drainGpu();
    return sample;
  }

  scope<T>(name: string, fn: () => T): T {
    const start = nowMs();
    const generation = this.frameGeneration;
    const activeAtStart = this.frameActive;
    const token = activeAtStart ? this.tryBeginScope(name) : null;
    if (activeAtStart && this.gpu && !token && this.frameActive && this.frameGeneration === generation) {
      this.failedGpuScopes.add(name);
    }
    try {
      return fn();
    } finally {
      const sameFrame = this.frameActive && this.frameGeneration === generation;
      const sameUnframedContext = !activeAtStart && !this.frameActive && this.frameGeneration === generation;
      if (sameFrame || sameUnframedContext) this.cpuScopes[name] = (this.cpuScopes[name] ?? 0) + (nowMs() - start);
      if (token && this.gpu) {
        try {
          // Stamp the end next to the work itself, not at the end of the
          // enclosing frame. In particular, later passes must not inflate it.
          this.gpu.endScope(token);
          // endScope itself may reenter begin(), so check identity again after
          // the external call rather than using the pre-call snapshot.
          if (this.frameActive && this.frameGeneration === generation) {
            this.completedScopes.push({ name, token });
            if (this.completedScopes.length > MAX_COMPLETED_GPU_SCOPES_PER_FRAME) {
              const dropped = this.completedScopes.shift()!;
              // The eventual total for this name is incomplete; keep CPU.
              this.failedGpuScopes.add(dropped.name);
              this.enqueueGpu({ token: dropped.token, kind: "discard" });
            }
          } else {
            this.enqueueGpu({ token, kind: "discard" });
          }
        } catch {
          // Diagnostics never replace the callback's return value or error.
          if (this.frameActive && this.frameGeneration === generation) this.failedGpuScopes.add(name);
        }
      }
    }
  }

  percentiles(field: FrameStatsPercentileField): FrameStatsPercentiles {
    this.drainGpu(true);
    const values = this.orderedSamples()
      .map((sample) => sample[field])
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, max: 0 };
    }
    const rank = (q: number): number => values[Math.min(values.length - 1, Math.ceil(q * values.length) - 1)]!;
    return { p50: rank(0.5), p95: rank(0.95), p99: rank(0.99), max: values[values.length - 1]! };
  }

  /** Measured fps: `1000 / mean(intervalMs)` over the newest 30 samples; `null` before 30 samples exist. */
  fps(): number | null {
    if (this.sampleCountValue < 30) return null;
    const recent = this.orderedSamples().slice(-30);
    const mean = recent.reduce((sum, sample) => sum + sample.intervalMs, 0) / recent.length;
    return mean > 0 ? 1000 / mean : null;
  }

  /**
   * Pre-QR estimator semantics (Q-15-1): `1000 / mean(intervalMs)` over every
   * non-zero interval in the ring, `0` before the second sample. Kept separate
   * from `fps()` so callers pick honest-vs-legacy explicitly.
   */
  legacyFps(): number {
    if (this.sampleCountValue < 2) return 0;
    const intervals = this.orderedSamples()
      .map((sample) => sample.intervalMs)
      .filter((interval) => interval > 0);
    if (intervals.length === 0) return 0;
    const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    return mean > 0 ? 1000 / mean : 0;
  }

  private tryBeginScope(name: string): RendererGpuTimingToken | null {
    if (!this.gpu) return null;
    try {
      return this.gpu.beginScope(name);
    } catch {
      return null;
    }
  }

  /** Close an abandoned frame so an elapsed-query backend can start another. */
  private abandonFrame(): void {
    if (!this.frameActive) return;
    const completedScopes = this.completedScopes;
    const frameToken = this.frameToken;
    this.completedScopes = [];
    this.failedGpuScopes.clear();
    this.frameToken = null;
    this.frameActive = false;
    this.frameIdentity = null;
    for (const scope of completedScopes) this.enqueueGpu({ token: scope.token, kind: "discard" });
    if (this.gpu && frameToken) {
      const pending: PendingGpuScope = { token: frameToken, kind: "discard" };
      this.enqueueGpu(pending);
      try {
        this.gpu.endScope(frameToken);
      } catch {
        this.removePendingGpu(pending);
        // A lost backend may reject cleanup; the abandoned sample is dropped.
      }
    }
  }

  private removePendingGpu(pending: PendingGpuScope): void {
    const index = this.pendingGpu.indexOf(pending);
    if (index >= 0) this.pendingGpu.splice(index, 1);
  }

  private enqueueGpu(pending: PendingGpuScope): void {
    this.pendingGpu.push(pending);
    if (this.pendingGpu.length > MAX_PENDING_GPU_SCOPES) {
      this.settleGpu(this.pendingGpu.shift()!, null);
    }
  }

  private settleGpu(pending: PendingGpuScope, value: number | null | undefined): void {
    const valid = typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (pending.kind === "frame") {
      if (valid) pending.sample.gpuMs = value;
      return;
    }
    if (pending.kind !== "scope") return;
    const aggregate = pending.aggregate;
    if (valid) {
      aggregate.durationMs += value;
      if (!Number.isFinite(aggregate.durationMs)) aggregate.valid = false;
    } else {
      aggregate.valid = false;
    }
    aggregate.remaining -= 1;
    if (aggregate.remaining === 0 && aggregate.valid) {
      aggregate.sample.scopes[aggregate.name] = aggregate.durationMs;
    }
  }

  private pushSample(sample: MutableFrameStatsSample): void {
    this.ring[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.ring.length;
    if (this.sampleCountValue < this.ring.length) {
      this.sampleCountValue += 1;
    }
  }

  private orderedSamples(): MutableFrameStatsSample[] {
    const out: MutableFrameStatsSample[] = [];
    for (let index = 0; index < this.sampleCountValue; index += 1) {
      // Oldest first: when the ring is full the oldest slot is `writeIndex`.
      const slot = (this.writeIndex + this.ring.length - this.sampleCountValue + index) % this.ring.length;
      const sample = this.ring[slot];
      if (sample) out.push(sample);
    }
    return out;
  }

  private drainGpu(observeOnly = false): void {
    if (!this.gpu || this.pendingGpu.length === 0) return;
    // A just-closed scope belongs to the current frame, but its sample does
    // not exist until end(). Polling now could consume that token's result
    // before it can be associated with the sample.
    if (this.frameActive && this.completedScopes.length > 0) return;
    let results: readonly { token: RendererGpuTimingToken; durationMs: number | null }[];
    try {
      // Diagnostics may be read many times between rendered frames. Use a
      // backend's non-aging observation path when available; custom backends
      // retain their previous polling behavior and do not delay ready results.
      results = observeOnly && this.gpu.pollWithoutAging ? this.gpu.pollWithoutAging() : this.gpu.poll();
    } catch {
      return;
    }
    if (results.length === 0) return;
    const settled = new Map(results.map((result) => [result.token, result.durationMs]));
    const remaining: PendingGpuScope[] = [];
    for (const pending of this.pendingGpu) {
      if (!settled.has(pending.token)) {
        remaining.push(pending);
        continue;
      }
      // A discarded, non-finite, or negative result keeps the CPU fallback
      // and never becomes a reported GPU duration.
      this.settleGpu(pending, settled.get(pending.token));
    }
    this.pendingGpu = remaining;
  }
}

/**
 * Difference between two counters snapshots, per measured field. Live gauges
 * (`liveBuffers`, `liveVertexArrays`, `textureBytes`, `renderTargetBytes`) are
 * carried through from `next` — a delta of a gauge is meaningless.
 */
export function diffDeviceCounters(previous: DeviceCounters, next: DeviceCounters): DeviceCounters {
  return {
    drawCalls: next.drawCalls - previous.drawCalls,
    bufferCreates: next.bufferCreates - previous.bufferCreates,
    textureUploads: next.textureUploads - previous.textureUploads,
    readbacks: next.readbacks - previous.readbacks,
    renderTargetsCreated: next.renderTargetsCreated - previous.renderTargetsCreated,
    programCompiles: next.programCompiles - previous.programCompiles,
    liveBuffers: next.liveBuffers,
    liveVertexArrays: next.liveVertexArrays,
    textureBytes: next.textureBytes,
    renderTargetBytes: next.renderTargetBytes
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
