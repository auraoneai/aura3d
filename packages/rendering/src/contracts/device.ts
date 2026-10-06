/**
 * C-28 — device capabilities: probe, counters, compileAsync, FrameStats, resource
 * registry (CONTRACTS.md). Provider: PRD 11. Flag: A3D_QR_TIERS. RenderDevice
 * gains optional members in PR 0a (declared on RenderDevice.ts).
 */

import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../RenderDevice";
import type { TextureFormat } from "../Texture";
import { defineContractSlot, type ContractSlot } from "./core";

export interface DeviceProbe { readonly backend: "webgl2" | "webgpu"; readonly rendererString: string; readonly unmaskedRenderer: string | null; readonly unmaskedVendor: string | null; readonly maxTextureSize: number; readonly maxSamples: number; readonly floatColorBuffer: boolean; readonly halfFloatColorBuffer: boolean; readonly timerQuery: boolean; readonly parallelShaderCompile: boolean; readonly multiDraw: boolean; readonly devicePixelRatio: number; readonly screen: readonly [number, number]; readonly hardwareConcurrency: number | null; readonly deviceMemoryGB: number | null; readonly mobile: boolean | null; }
export interface DeviceCounters { readonly drawCalls: number; readonly bufferCreates: number; readonly textureUploads: number; readonly readbacks: number; readonly renderTargetsCreated: number; readonly programCompiles: number; readonly liveBuffers: number; readonly liveVertexArrays: number; readonly textureBytes: number; readonly renderTargetBytes: number; }
// RenderDevice optional additions (PR 0a):
//   readonly probe?: DeviceProbe;
//   counters?(): DeviceCounters;            // per-frame fields reset by resetFrameCounters()
//   resetFrameCounters?(): void;
//   compileAsync?(shader: import("../ShaderModule").ShaderModule): Promise<void>;     // KHR_parallel_shader_compile / createRenderPipelineAsync
//   multiDrawElementsInstanced?(mode: "triangles", counts: Int32Array, offsetsBytes: Int32Array, instanceCounts: Int32Array, drawCount: number): void;
// RenderDeviceDiagnostics additions: programCompileCount?: number; readPixelsCalls?: number   (monotonic; = counters().programCompiles / readbacks totals)
export interface FrameStatsSample { readonly intervalMs: number; readonly cpuFrameMs: number; readonly cpuSubmitMs: number; readonly gpuMs: number | null; readonly scopes: Readonly<Record<string, number>>; }
export interface FrameStatsLike { begin(ts: number): void; end(): FrameStatsSample; scope<T>(name: "shadow" | "forward" | "post" | "particles" | string, fn: () => T): T; percentiles(field: "intervalMs" | "cpuFrameMs" | "cpuSubmitMs" | "gpuMs"): { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number }; fps(): number | null; }

/**
 * PR 0a stub FrameStats — real because it is pure: rAF/draw intervals, CPU
 * timings, scope aggregation; gpuMs is null until PRD 11's timer queries land.
 */
class FrameStats implements FrameStatsLike {
  private frameStart = 0;
  private submitStart = 0;
  private readonly samples: FrameStatsSample[] = [];
  private activeScopes: Record<string, number> = {};
  private readonly capacity: number;

  constructor(capacity = 120) {
    this.capacity = capacity;
  }

  private lastBeginTs = 0;

  begin(ts: number): void {
    this.frameStart = ts;
    this.submitStart = ts;
    this.activeScopes = {};
  }

  end(): FrameStatsSample {
    const now = nowMs();
    const intervalMs = this.lastBeginTs === 0 ? 0 : this.frameStart - this.lastBeginTs;
    this.lastBeginTs = this.frameStart;
    const sample: FrameStatsSample = {
      intervalMs,
      cpuFrameMs: now - this.frameStart,
      cpuSubmitMs: now - this.submitStart,
      gpuMs: null,
      scopes: { ...this.activeScopes }
    };
    this.pushSample(sample);
    return sample;
  }

  scope<T>(name: string, fn: () => T): T {
    const start = nowMs();
    try {
      return fn();
    } finally {
      this.activeScopes[name] = (this.activeScopes[name] ?? 0) + (nowMs() - start);
    }
  }

  percentiles(field: "intervalMs" | "cpuFrameMs" | "cpuSubmitMs" | "gpuMs"): { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number } {
    const values = this.samples
      .map((sample) => sample[field])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (values.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0 };
    const pick = (q: number): number => values[Math.min(values.length - 1, Math.floor(q * values.length))];
    return { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: values[values.length - 1] };
  }

  /** Measured fps: null until 30 samples exist. Never a constant 60. */
  fps(): number | null {
    if (this.samples.length < 30) return null;
    const recent = this.samples.slice(-30);
    const mean = recent.reduce((sum, sample) => sum + sample.intervalMs, 0) / recent.length;
    return mean > 0 ? 1000 / mean : null;
  }

  private pushSample(sample: FrameStatsSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export const frameStatsSlot: ContractSlot<(capacity?: number) => FrameStatsLike> =
  defineContractSlot("C-28", "prd11", "A3D_QR_TIERS", (capacity) => new FrameStats(capacity));

export interface RenderTargetPoolLike { acquire(desc: { width: number; height: number; format: TextureFormat; samples: 1 | 4; depth: boolean }): RenderTarget; release(t: RenderTarget): void; trim(maxIdleFrames: number): void; }

/** PR 0a stub: creates targets on every acquire and disposes them on release. */
class StubRenderTargetPool implements RenderTargetPoolLike {
  constructor(private readonly device: RenderDevice) {}

  acquire(desc: { width: number; height: number; format: TextureFormat; samples: 1 | 4; depth: boolean }): RenderTarget {
    const target = this.device.createRenderTarget(desc as RenderTargetDescriptor);
    (target as { __qrPooled?: boolean }).__qrPooled = true;
    return target;
  }

  release(t: RenderTarget): void {
    if ((t as { __qrPooled?: boolean }).__qrPooled) {
      delete (t as { __qrPooled?: boolean }).__qrPooled;
      t.dispose();
    }
  }

  trim(_maxIdleFrames: number): void { /* nothing pooled in the stub */ }
}

export const renderTargetPoolSlot: ContractSlot<(device: RenderDevice) => RenderTargetPoolLike> =
  defineContractSlot("C-28", "prd11", "A3D_QR_TIERS", (device) => new StubRenderTargetPool(device));
