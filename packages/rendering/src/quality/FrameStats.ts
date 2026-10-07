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

interface PendingGpuScope {
  readonly token: RendererGpuTimingToken;
  readonly name: string;
  readonly sample: MutableFrameStatsSample;
}

export class FrameStats implements FrameStatsLike {
  private readonly ring: (MutableFrameStatsSample | undefined)[];
  private writeIndex = 0;
  private sampleCountValue = 0;
  private lastBeginTs: number | null = null;
  private frameStart = 0;
  private submitStart = 0;
  private cpuScopes: Record<string, number> = {};
  private openScopes: { readonly name: string; readonly token: RendererGpuTimingToken }[] = [];
  private pendingGpu: PendingGpuScope[] = [];
  private frameToken: RendererGpuTimingToken | null = null;
  private readonly gpu: RendererGpuScopedTimingBackend | null;

  constructor(capacity = 240, gpu?: RendererGpuTimingBackend) {
    this.ring = new Array<MutableFrameStatsSample | undefined>(Math.max(1, Math.floor(capacity)));
    this.gpu = gpu && isScopedGpuTimingBackend(gpu) ? gpu : null;
  }

  /** Number of live samples in the ring (≤ capacity). Test/diagnostic surface; not in FrameStatsLike. */
  get samples(): number {
    return this.sampleCountValue;
  }

  begin(ts: number): void {
    this.drainGpu();
    this.frameStart = ts;
    this.submitStart = ts;
    this.cpuScopes = {};
    this.openScopes = [];
    this.frameToken = null;
    if (this.gpu) {
      try {
        this.frameToken = this.gpu.beginScope("frame");
      } catch {
        this.frameToken = null;
      }
    }
  }

  end(): FrameStatsSample {
    const now = nowMs();
    const intervalMs = this.lastBeginTs === null ? 0 : this.frameStart - this.lastBeginTs;
    this.lastBeginTs = this.frameStart;
    const sample: MutableFrameStatsSample = {
      intervalMs,
      cpuFrameMs: now - this.frameStart,
      cpuSubmitMs: now - this.submitStart,
      gpuMs: null,
      scopes: { ...this.cpuScopes }
    };
    if (this.gpu && this.frameToken) {
      try {
        this.gpu.endScope(this.frameToken);
        this.pendingGpu.push({ token: this.frameToken, name: "frame", sample });
      } catch {
        // GPU clock vanished mid-frame; the sample stays cpu-only (gpuMs: null).
      }
    }
    for (const scope of this.openScopes) {
      try {
        this.gpu?.endScope(scope.token);
        this.pendingGpu.push({ token: scope.token, name: scope.name, sample });
      } catch {
        // A scope query that fails to submit leaves its cpu ms in place.
      }
    }
    this.openScopes = [];
    this.frameToken = null;
    this.pushSample(sample);
    this.drainGpu();
    return sample;
  }

  scope<T>(name: string, fn: () => T): T {
    const start = nowMs();
    const token = this.tryBeginScope(name);
    try {
      return fn();
    } finally {
      this.cpuScopes[name] = (this.cpuScopes[name] ?? 0) + (nowMs() - start);
      if (token) {
        this.openScopes.push({ name, token });
      }
    }
  }

  percentiles(field: FrameStatsPercentileField): FrameStatsPercentiles {
    this.drainGpu();
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

  private drainGpu(): void {
    if (!this.gpu || this.pendingGpu.length === 0) return;
    let results: readonly { token: RendererGpuTimingToken; durationMs: number | null }[];
    try {
      results = this.gpu.poll();
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
      const durationMs = settled.get(pending.token);
      // `durationMs: null` means the query settled but was discarded (disjoint):
      // the sample keeps gpuMs: null / its cpu scope time.
      if (durationMs === null || durationMs === undefined) continue;
      if (pending.name === "frame") {
        pending.sample.gpuMs = durationMs;
      } else {
        pending.sample.scopes[pending.name] = durationMs;
      }
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
