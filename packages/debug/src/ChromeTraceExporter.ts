import type { ProfilerMarker, ProfilerSnapshot } from "./Profiler.js";
import type { GPUSample, GPUProfilerSnapshot } from "./GPUProfiler.js";

export interface ChromeTraceEvent {
  readonly name: string;
  readonly cat: string;
  readonly ph: "M" | "X" | "C" | "i";
  readonly ts: number;
  readonly pid: number;
  readonly tid: number;
  readonly dur?: number;
  readonly args?: Record<string, number | string | boolean | null>;
}

export interface ChromeTrace {
  readonly traceEvents: readonly ChromeTraceEvent[];
  readonly displayTimeUnit: "ms";
  readonly metadata: {
    readonly source: "aura3d-debug-chrome-trace-exporter";
    readonly profileName: string;
    readonly cpuMarkerCount: number;
    readonly gpuSampleCount: number;
    readonly claimBoundary: string;
  };
}

export interface ChromeTraceExportOptions {
  readonly profileName?: string;
  readonly processId?: number;
  readonly cpuThreadId?: number;
  readonly gpuThreadId?: number;
  readonly includeCounters?: boolean;
}

export class ChromeTraceExporter {
  static create(
    cpu: ProfilerSnapshot,
    gpu?: GPUProfilerSnapshot,
    options: ChromeTraceExportOptions = {}
  ): ChromeTrace {
    const profileName = options.profileName?.trim() || "Aura3D profile";
    const processId = positiveInteger(options.processId, 1);
    const cpuThreadId = positiveInteger(options.cpuThreadId, 1);
    const gpuThreadId = positiveInteger(options.gpuThreadId, 2);
    const events: ChromeTraceEvent[] = [
      metadataEvent("process_name", processId, cpuThreadId, { name: "Aura3D" }),
      metadataEvent("thread_name", processId, cpuThreadId, { name: "CPU" }),
      metadataEvent("thread_name", processId, gpuThreadId, { name: "GPU" })
    ];

    for (const marker of cpu.markers) {
      events.push(cpuMarkerEvent(marker, processId, cpuThreadId));
    }

    if (gpu) {
      for (const sample of gpu.samples) {
        events.push(gpuSampleEvent(sample, processId, gpuThreadId));
      }
      if (gpu.supported === false) {
        events.push({
          name: "gpu_timing_unavailable",
          cat: "gpu",
          ph: "i",
          ts: 0,
          pid: processId,
          tid: gpuThreadId,
          args: { reason: gpu.unavailableReason ?? "GPU timing unavailable" }
        });
      }
    }

    if (options.includeCounters !== false) {
      events.push({
        name: "profile_counters",
        cat: "counters",
        ph: "C",
        ts: 0,
        pid: processId,
        tid: cpuThreadId,
        args: {
          cpuMarkerCount: cpu.markerCount,
          cpuTotalDurationMs: fixed(cpu.totalDurationMs),
          gpuSampleCount: gpu?.sampleCount ?? 0,
          gpuSupported: gpu?.supported ?? false
        }
      });
    }

    return {
      traceEvents: events,
      displayTimeUnit: "ms",
      metadata: {
        source: "aura3d-debug-chrome-trace-exporter",
        profileName,
        cpuMarkerCount: cpu.markerCount,
        gpuSampleCount: gpu?.sampleCount ?? 0,
        claimBoundary: "Chrome trace export is bounded local profiling evidence; it is not Unity/Unreal profiler parity."
      }
    };
  }

  static toJson(trace: ChromeTrace): string {
    return `${JSON.stringify(trace, null, 2)}\n`;
  }
}

function metadataEvent(name: "process_name" | "thread_name", pid: number, tid: number, args: { readonly name: string }): ChromeTraceEvent {
  return {
    name,
    cat: "__metadata",
    ph: "M",
    ts: 0,
    pid,
    tid,
    args
  };
}

function cpuMarkerEvent(marker: ProfilerMarker, pid: number, tid: number): ChromeTraceEvent {
  return {
    name: marker.name,
    cat: "cpu",
    ph: "X",
    ts: millisecondsToMicroseconds(marker.startMs),
    dur: millisecondsToMicroseconds(marker.durationMs),
    pid,
    tid,
    args: {
      depth: marker.depth,
      endMs: fixed(marker.endMs)
    }
  };
}

function gpuSampleEvent(sample: GPUSample, pid: number, tid: number): ChromeTraceEvent {
  return {
    name: sample.label,
    cat: "gpu",
    ph: "X",
    ts: 0,
    dur: millisecondsToMicroseconds(sample.durationMs),
    pid,
    tid,
    args: { durationMs: fixed(sample.durationMs) }
  };
}

function millisecondsToMicroseconds(value: number): number {
  return Math.max(0, Math.round(value * 1_000));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function fixed(value: number): number {
  return Number(value.toFixed(4));
}
