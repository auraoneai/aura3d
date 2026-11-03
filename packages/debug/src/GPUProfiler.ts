/** A completed device measurement. CPU clock values never appear in this list. */
export interface GPUSample {
  readonly label: string;
  /** GPU elapsed time in milliseconds, obtained from the device query. */
  readonly durationMs: number;
}

/** CPU-side wall time around the scope, separate from device execution time. */
export interface GPUProfilerCPUSample {
  readonly label: string;
  readonly durationMs: number;
  readonly source: "cpu";
  /** Legacy end(durationMs) overrides are recorded as caller supplied. */
  readonly measurement: "clock" | "caller";
}

export type GPUProfilerStatus =
  | "pending"
  | "available"
  | "unsupported"
  | "disjoint"
  | "device-lost"
  | "overlapping"
  | "query-failed"
  | "invalid-result"
  | "discarded"
  | "disposed";

export interface GPUProfilerMeasurement {
  readonly label: string;
  readonly cpuDurationMs?: number;
  readonly gpuDurationMs?: number;
  readonly gpuStatus: GPUProfilerStatus;
}

export interface GPUProfilerSnapshot {
  /** A usable device timer exists and the device is not lost or disposed. */
  readonly supported: boolean;
  /** Number of retained completed, valid GPU measurements, not a lifetime total. */
  readonly sampleCount: number;
  readonly samples: readonly GPUSample[];
  /** Added fields are optional here so existing snapshot consumers remain assignable. */
  readonly cpuSampleCount?: number;
  readonly cpuSamples?: readonly GPUProfilerCPUSample[];
  readonly pendingCount?: number;
  readonly measurements?: readonly GPUProfilerMeasurement[];
  /** Maximum retained records per history; pending scopes may add up to 65 extra measurements. */
  readonly historyLimit?: number;
  /** Cumulative oldest-record evictions from each history. */
  readonly historyEvictions?: { readonly gpuSamples: number; readonly cpuSamples: number; readonly measurements: number };
  readonly unavailableReason?: string;
}

/** The richer snapshot returned by GPUProfiler.snapshot(). */
export interface GPUProfilerDetailedSnapshot extends GPUProfilerSnapshot {
  readonly cpuSampleCount: number;
  readonly cpuSamples: readonly GPUProfilerCPUSample[];
  readonly pendingCount: number;
  readonly measurements: readonly GPUProfilerMeasurement[];
  readonly historyLimit: number;
  readonly historyEvictions: { readonly gpuSamples: number; readonly cpuSamples: number; readonly measurements: number };
}

export interface GPUProfilerTimer {
  /** Ends the CPU scope; throws after disposal. On device loss only the CPU time is recorded. */
  end(durationMs?: number): GPUProfilerCPUSample;
}

/** Structural WebGPU types allow this module to compile when WebGPU DOM types are absent. */
export interface GPUProfilerWebGPUBuffer {
  label: string;
  readonly size: number;
  readonly usage: number;
  readonly mapState: "unmapped" | "pending" | "mapped";
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

export interface GPUProfilerWebGPUQuerySet {
  label: string;
  readonly type: "occlusion" | "timestamp";
  readonly count: number;
  destroy(): void;
}

export interface GPUProfilerWebGPUDevice {
  readonly features: { has(name: "timestamp-query"): boolean };
  readonly lost: Promise<unknown>;
  readonly queue: { submit(commands: Iterable<{ label: string }>): void; onSubmittedWorkDone?(): Promise<void> };
  createQuerySet(descriptor: { type: "timestamp"; count: number }): GPUProfilerWebGPUQuerySet;
  createBuffer(descriptor: { size: number; usage: number }): GPUProfilerWebGPUBuffer;
}

export interface GPUProfilerWebGPUEncoder {
  resolveQuerySet(querySet: GPUProfilerWebGPUQuerySet, firstQuery: number, queryCount: number, destination: GPUProfilerWebGPUBuffer, destinationOffset: number): void;
  copyBufferToBuffer(source: GPUProfilerWebGPUBuffer, sourceOffset: number, destination: GPUProfilerWebGPUBuffer, destinationOffset: number, size: number): void;
  finish(): { label: string };
}

export interface GPUProfilerWebGPUPassTimer {
  /** Attach to a WebGPU render/compute pass descriptor when present. */
  readonly timestampWrites?: {
    readonly querySet: GPUProfilerWebGPUQuerySet;
    readonly beginningOfPassWriteIndex: number;
    readonly endOfPassWriteIndex: number;
  };
  /** Call after pass.end(), before encoder.finish(); throws after disposal and records CPU only after device loss. */
  end(encoder: GPUProfilerWebGPUEncoder, durationMs?: number): GPUProfilerCPUSample;
}

/** Structural bridge used by a WebGPU renderer without depending on the debug package. */
export interface GPUProfilerForwardPassTimer {
  readonly timestampWrites?: {
    readonly querySet: unknown;
    readonly beginningOfPassWriteIndex: number;
    readonly endOfPassWriteIndex: number;
  };
  end(encoder: unknown): void;
  /** Cancel only when the containing encoder will not be submitted. */
  cancel(): void;
}

export interface GPUProfilerForwardPassObserver {
  readonly device: object;
  beginForwardPass(label: string): GPUProfilerForwardPassTimer;
  submitForwardPass(encoder: unknown, timer: GPUProfilerForwardPassTimer, submit: () => void): void;
}

interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface MutableMeasurement {
  readonly sequence: number;
  retained: boolean;
  readonly label: string;
  cpuDurationMs?: number;
  gpuDurationMs?: number;
  gpuStatus: GPUProfilerStatus;
}

interface QueryRecord {
  readonly query: WebGLQuery;
  readonly measurement: MutableMeasurement;
}

interface WebGPUPassRecord {
  readonly measurement: MutableMeasurement;
  readonly querySet: GPUProfilerWebGPUQuerySet | null;
  readonly resolveBuffer: GPUProfilerWebGPUBuffer | null;
  readonly readbackBuffer: GPUProfilerWebGPUBuffer | null;
  phase: "recording" | "encoded" | "submitting" | "submitted" | "retiring" | "done";
  encoder?: GPUProfilerWebGPUEncoder;
}

// A driver that never returns results must not allow unbounded device objects.
const MAX_PENDING_QUERIES = 64;
const MAX_RETAINED_HISTORY = 1024;
const DEFAULT_UNAVAILABLE_REASON = "GPU timing extension unavailable";
// The WebGL disjoint flag is shared by the context and reading it clears it.
// Notify other profiler instances attached to the same context before the
// observing instance can accept a result from a different generation.
const WEBGL_PROFILERS = new WeakMap<WebGL2RenderingContext, Set<GPUProfiler>>();

/** Fixed-capacity FIFO with constant-time insertion during long profiling sessions. */
class History<T> {
  private readonly records: T[] = [];
  private oldest = 0;
  evictions = 0;

  constructor(private readonly capacity: number) {}

  push(record: T): T | undefined {
    if (this.records.length < this.capacity) {
      this.records.push(record);
      return undefined;
    }
    const evicted = this.records[this.oldest];
    this.records[this.oldest] = record;
    this.oldest = (this.oldest + 1) % this.capacity;
    this.evictions += 1;
    return evicted;
  }

  toArray(): T[] {
    if (this.oldest === 0) return [...this.records];
    return [...this.records.slice(this.oldest), ...this.records.slice(0, this.oldest)];
  }
}

/**
 * Measures CPU scopes and asynchronous GPU time. A WebGL2 context can use
 * `begin()` when EXT_disjoint_timer_query_webgl2 exists; a WebGPU device with
 * timestamp-query can time render/compute passes via `beginWebGPUPass()`.
 *
 * WebGL elapsed queries cannot overlap. An overlapping scope still records CPU
 * time, but its device result is explicitly unavailable. Call `poll()` or
 * `snapshot()` on later frames; neither blocks waiting for the device. A GPU
 * result is reported only after the query is available and non-disjoint.
 * WebGPU pass timestamp readback begins only after `submitWebGPU()` queues the
 * resolve commands; the result arrives asynchronously through buffer mapping.
 *
 * Each CPU, GPU and scope history retains up to 1,024 recently recorded or
 * finalized records, with separate cumulative eviction counts in each snapshot.
 * Pending scopes remain visible until settled, even when their history entry
 * has rotated out. Callers own the profiler and must dispose it to release
 * in-flight device resources.
 *
 * The former boolean constructor is accepted for compatibility, but a boolean
 * cannot provide a device timer and therefore never marks GPU timing supported.
 */
export class GPUProfiler {
  private readonly samples = new History<GPUSample>(MAX_RETAINED_HISTORY);
  private readonly cpuSamples = new History<GPUProfilerCPUSample>(MAX_RETAINED_HISTORY);
  private readonly measurements = new History<MutableMeasurement>(MAX_RETAINED_HISTORY);
  private nextMeasurementSequence = 0;
  private readonly pending: QueryRecord[] = [];
  private readonly webgpuPending = new Set<WebGPUPassRecord>();
  private readonly webgpuRetiring = new Set<WebGPUPassRecord>();
  private readonly webgpuTimers = new WeakMap<GPUProfilerWebGPUPassTimer, WebGPUPassRecord>();
  private readonly gl: WebGL2RenderingContext | null;
  private readonly webgpu: GPUProfilerWebGPUDevice | null;
  private readonly webgpuSupported: boolean;
  private readonly extension: TimerQueryExtension | null;
  private readonly now: () => number;
  private active: QueryRecord | null = null;
  private unavailableReason: string | undefined;
  private lost = false;
  private disposed = false;

  constructor(
    contextOrLegacyFlag: WebGL2RenderingContext | GPUProfilerWebGPUDevice | boolean | null = null,
    unavailableReason = DEFAULT_UNAVAILABLE_REASON,
    now: () => number = () => performance.now()
  ) {
    this.now = now;
    const source = typeof contextOrLegacyFlag === "object" ? contextOrLegacyFlag : null;
    this.gl = source && "getExtension" in source ? source : null;
    this.webgpu = source && "features" in source && "createQuerySet" in source ? source : null;
    this.webgpuSupported = this.webgpu?.features.has("timestamp-query") ?? false;
    if (this.webgpu) {
      // Device loss is terminal for its query resources, including pending maps.
      void this.webgpu.lost.then(() => this.onWebGPULost(true), () => this.onWebGPULost(false));
    }
    let extension: TimerQueryExtension | null = null;
    if (this.gl) {
      try {
        if (this.gl.isContextLost()) {
          this.lost = true;
          this.unavailableReason = "WebGL2 context lost";
        } else {
          extension = this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerQueryExtension | null;
        }
      } catch {
        this.unavailableReason = "WebGL2 timer query initialization failed";
      }
    }
    this.extension = extension;
    if (this.gl && extension) {
      let profilers = WEBGL_PROFILERS.get(this.gl);
      if (!profilers) {
        profilers = new Set();
        WEBGL_PROFILERS.set(this.gl, profilers);
      }
      profilers.add(this);
    }
    if (!extension && !this.webgpuSupported && !this.unavailableReason) {
      this.unavailableReason = this.webgpu ? "WebGPU timestamp-query feature unavailable" : contextOrLegacyFlag === true && unavailableReason === DEFAULT_UNAVAILABLE_REASON
        ? "A WebGL2 context with EXT_disjoint_timer_query_webgl2 is required for GPU timing"
        : unavailableReason;
    }
  }

  /** Accept a native device exposed by a renderer without requiring WebGPU DOM types. */
  static fromWebGPUDevice(device: object, unavailableReason?: string, now?: () => number): GPUProfiler {
    const candidate = device as Partial<GPUProfilerWebGPUDevice>;
    if (!candidate.features || typeof candidate.features.has !== "function" || !candidate.lost || typeof candidate.lost.then !== "function"
      || !candidate.queue || typeof candidate.queue.submit !== "function" || typeof candidate.createQuerySet !== "function" || typeof candidate.createBuffer !== "function") {
      throw new Error("A native WebGPU device with query and buffer methods is required");
    }
    return new GPUProfiler(candidate as GPUProfilerWebGPUDevice, unavailableReason, now);
  }

  /** Create a caller-owned bridge for one selected renderer pass per frame. */
  createWebGPUForwardPassProfiler(): GPUProfilerForwardPassObserver {
    if (!this.webgpu) throw new Error("A WebGPU device is required for pass timing");
    if (this.disposed) throw new Error("GPU profiler is disposed");
    const timers = new WeakMap<GPUProfilerForwardPassTimer, GPUProfilerWebGPUPassTimer>();
    return {
      device: this.webgpu,
      beginForwardPass: (label) => {
        const timer = this.beginWebGPUPass(label);
        const bridge: GPUProfilerForwardPassTimer = {
          ...(timer.timestampWrites ? { timestampWrites: timer.timestampWrites } : {}),
          end: (encoder) => { timer.end(encoder as GPUProfilerWebGPUEncoder); },
          cancel: () => { this.cancelWebGPUPass(timer); }
        };
        timers.set(bridge, timer);
        return bridge;
      },
      submitForwardPass: (encoder, bridge, submit) => {
        const timer = timers.get(bridge);
        if (!timer) throw new Error("Forward pass timer belongs to another profiler bridge");
        this.submitWebGPUWith(encoder as GPUProfilerWebGPUEncoder, [timer], submit);
      }
    };
  }

  begin(label: string): GPUProfilerTimer {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      throw new Error("GPU profiler sample label is required");
    }
    if (this.disposed) {
      throw new Error("GPU profiler is disposed");
    }
    this.checkContextLoss();
    const measurement: MutableMeasurement = {
      sequence: this.nextMeasurementSequence++,
      retained: false,
      label: trimmed,
      gpuStatus: this.lost ? "device-lost" : this.extension ? "pending" : "unsupported"
    };
    this.rememberMeasurement(measurement);
    const record = this.startQuery(measurement);
    if (this.webgpu && this.webgpuSupported && !this.lost) {
      this.unavailableReason = "Use beginWebGPUPass for WebGPU device timing";
    }
    const start = this.now();
    let ended = false;
    return {
      end: (durationMs?: number): GPUProfilerCPUSample => {
        if (this.disposed) throw new Error("GPU profiler is disposed");
        if (ended) {
          throw new Error(`GPU profiler sample already ended: ${trimmed}`);
        }
        if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 0)) {
          throw new RangeError("CPU duration must be a finite non-negative number");
        }
        ended = true;
        const elapsed = durationMs ?? Math.max(0, this.now() - start);
        const cpuSample: GPUProfilerCPUSample = {
          label: trimmed,
          durationMs: elapsed,
          source: "cpu",
          measurement: durationMs === undefined ? "clock" : "caller"
        };
        measurement.cpuDurationMs = elapsed;
        this.cpuSamples.push(cpuSample);
        this.endQuery(record);
        return cpuSample;
      }
    };
  }

  /**
   * Starts timing a WebGPU render/compute pass. Attach `timestampWrites` to
   * that pass, call `end(encoder)` after the pass ends, then hand that encoder
   * and all its timers to `submitWebGPU()`. WebGPU cannot time
   * arbitrary scopes outside a pass, so `begin()` remains CPU-only there.
   */
  beginWebGPUPass(label: string): GPUProfilerWebGPUPassTimer {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("GPU profiler sample label is required");
    if (this.disposed) throw new Error("GPU profiler is disposed");
    if (!this.webgpu) throw new Error("A WebGPU device is required for pass timing");
    const measurement: MutableMeasurement = {
      sequence: this.nextMeasurementSequence++,
      retained: false,
      label: trimmed,
      gpuStatus: this.lost ? "device-lost" : this.webgpuSupported ? "pending" : "unsupported"
    };
    this.rememberMeasurement(measurement);
    let querySet: GPUProfilerWebGPUQuerySet | null = null;
    let resolveBuffer: GPUProfilerWebGPUBuffer | null = null;
    let readbackBuffer: GPUProfilerWebGPUBuffer | null = null;
    if (this.webgpuSupported && !this.lost) {
      if (this.webgpuPending.size + this.webgpuRetiring.size >= MAX_PENDING_QUERIES) {
        this.settleMeasurement(measurement, "discarded");
        this.unavailableReason = "GPU timer pending query limit exceeded";
      } else {
        try {
          querySet = this.webgpu.createQuerySet({ type: "timestamp", count: 2 });
          // WebGPU usage constants: QUERY_RESOLVE | COPY_SRC; MAP_READ | COPY_DST.
          resolveBuffer = this.webgpu.createBuffer({ size: 16, usage: 0x0200 | 0x0004 });
          readbackBuffer = this.webgpu.createBuffer({ size: 16, usage: 0x0001 | 0x0008 });
        } catch {
          try { querySet?.destroy(); } catch { /* device may be lost */ }
          try { resolveBuffer?.destroy(); } catch { /* device may be lost */ }
          try { readbackBuffer?.destroy(); } catch { /* device may be lost */ }
          querySet = null;
          resolveBuffer = null;
          readbackBuffer = null;
          this.settleMeasurement(measurement, "query-failed");
          this.unavailableReason = "WebGPU timestamp query allocation failed";
        }
      }
    }
    const record: WebGPUPassRecord = { measurement, querySet, resolveBuffer, readbackBuffer, phase: "recording" };
    if (querySet) this.webgpuPending.add(record);
    const start = this.now();
    const timer: GPUProfilerWebGPUPassTimer = {
      ...(querySet ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
      end: (encoder, durationMs) => {
        if (this.disposed) throw new Error("GPU profiler is disposed");
        if (record.phase !== "recording" && record.phase !== "done") {
          throw new Error(`GPU profiler sample already ended: ${trimmed}`);
        }
        if (measurement.cpuDurationMs !== undefined) throw new Error(`GPU profiler sample already ended: ${trimmed}`);
        if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 0)) {
          throw new RangeError("CPU duration must be a finite non-negative number");
        }
        const elapsed = durationMs ?? Math.max(0, this.now() - start);
        const cpu: GPUProfilerCPUSample = { label: trimmed, durationMs: elapsed, source: "cpu", measurement: durationMs === undefined ? "clock" : "caller" };
        measurement.cpuDurationMs = elapsed;
        this.cpuSamples.push(cpu);
        record.encoder = encoder;
        if (record.phase === "recording" && record.querySet && record.resolveBuffer && record.readbackBuffer) {
          try {
            encoder.resolveQuerySet(record.querySet, 0, 2, record.resolveBuffer, 0);
            encoder.copyBufferToBuffer(record.resolveBuffer, 0, record.readbackBuffer, 0, 16);
            record.phase = "encoded";
          } catch {
            this.settleMeasurement(measurement, "query-failed");
            this.unavailableReason = "WebGPU timestamp resolve encoding failed";
            this.releaseWebGPU(record);
          }
        } else if (record.phase !== "done") {
          record.phase = "encoded";
        }
        return cpu;
      }
    };
    this.webgpuTimers.set(timer, record);
    return timer;
  }

  /**
   * Finish and submit the encoder containing the given ended timers. Owning
   * submission ensures mapping cannot begin before resolve/copy is queued.
   * Foreign, duplicate, unfinished or omitted timers are rejected first.
   */
  submitWebGPU(encoder: GPUProfilerWebGPUEncoder, timers: readonly GPUProfilerWebGPUPassTimer[]): void {
    this.submitWebGPUWith(encoder, timers, () => this.webgpu!.queue.submit([encoder.finish()]));
  }

  /** Submit through the encoder owner's normal resource/lease-aware submission path. */
  submitWebGPUWith(encoder: GPUProfilerWebGPUEncoder, timers: readonly GPUProfilerWebGPUPassTimer[], submit: () => void): void {
    if (this.disposed) throw new Error("GPU profiler is disposed");
    if (!this.webgpu) throw new Error("A WebGPU device is required for pass timing");
    if (this.lost) throw new Error("WebGPU device lost");
    const records = timers.map((timer) => this.webgpuTimers.get(timer));
    if (records.some((record) => !record || record.phase !== "encoded" || record.encoder !== encoder)) {
      throw new Error("WebGPU timers must belong to this profiler, be ended, and use the submitted encoder");
    }
    if (new Set(records).size !== records.length) throw new Error("Duplicate WebGPU timer in submission");
    if ([...this.webgpuPending].some((record) => record.encoder === encoder && !records.includes(record))) {
      throw new Error("All timestamp queries encoded on this encoder must be submitted together");
    }
    const owned = records as WebGPUPassRecord[];
    for (const record of owned) record.phase = "submitting";
    try {
      submit();
    } catch (error) {
      for (const record of owned) {
        if (!this.disposed && !this.lost) this.settleMeasurement(record.measurement, "query-failed");
        if (record.phase !== "done") this.retireWebGPU(record);
      }
      if (!this.disposed && !this.lost) this.unavailableReason = "WebGPU command submission failed";
      throw error;
    }
    for (const record of owned) {
      if (record.phase === "retiring") { this.fenceWebGPURetirement(record); continue; }
      if (record.phase === "done") continue;
      if (!record.readbackBuffer) {
        record.phase = "done";
        continue;
      }
      record.phase = "submitted";
      void this.readWebGPU(record);
    }
  }

  /** Discard an unsubmitted pass and its abandoned encoder's query resources. */
  cancelWebGPUPass(timer: GPUProfilerWebGPUPassTimer): void {
    const record = this.webgpuTimers.get(timer);
    if (!record) throw new Error("WebGPU timer belongs to another profiler");
    if (record.phase === "done" || record.phase === "retiring" || record.phase === "submitted" || record.phase === "submitting") return;
    if (!this.disposed && record.measurement.gpuStatus === "pending") this.settleMeasurement(record.measurement, "discarded");
    this.releaseWebGPU(record);
  }

  /** Polls without waiting; completed, valid results become visible in snapshots. */
  poll(): void {
    if (this.disposed || this.checkContextLoss() || !this.gl || !this.extension) return;
    if (!this.active && this.pending.length === 0) return;
    let disjoint: boolean;
    try {
      disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    } catch {
      if (!this.checkContextLoss()) this.discardAll("query-failed", "GPU disjoint status could not be read");
      return;
    }
    if (disjoint) {
      // Reading GPU_DISJOINT_EXT clears the flag: every in-flight result from
      // before this read is invalid, including queries not yet available.
      for (const profiler of WEBGL_PROFILERS.get(this.gl) ?? [this]) {
        profiler.discardAll("disjoint", "GPU timer results were discarded after a disjoint event");
      }
      return;
    }
    const completed: { record: QueryRecord; durationMs: number }[] = [];
    for (let i = 0; i < this.pending.length;) {
      const record = this.pending[i]!;
      try {
        if (!this.gl.getQueryParameter(record.query, this.gl.QUERY_RESULT_AVAILABLE)) {
          i += 1;
          continue;
        }
        const nanoseconds = this.gl.getQueryParameter(record.query, this.gl.QUERY_RESULT);
        this.pending.splice(i, 1);
        this.deleteQuery(record.query);
        if (typeof nanoseconds !== "number" || !Number.isFinite(nanoseconds) || nanoseconds < 0) {
          this.settleMeasurement(record.measurement, "invalid-result");
          this.unavailableReason = "GPU timer returned an invalid result";
          continue;
        }
        completed.push({ record, durationMs: nanoseconds / 1_000_000 });
      } catch {
        if (this.checkContextLoss()) {
          for (const sample of completed) this.settleMeasurement(sample.record.measurement, "device-lost");
          return;
        }
        this.pending.splice(i, 1);
        this.deleteQuery(record.query);
        this.settleMeasurement(record.measurement, "query-failed");
        this.unavailableReason = "GPU timer query failed";
      }
    }
    // A disjoint event can also occur while reading results. Check again
    // before accepting this batch; every staged result is discarded if so.
    if (completed.length > 0) {
      try {
        if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
          for (const sample of completed) this.settleMeasurement(sample.record.measurement, "disjoint");
          for (const profiler of WEBGL_PROFILERS.get(this.gl) ?? [this]) {
            profiler.discardAll("disjoint", "GPU timer results were discarded after a disjoint event");
          }
          return;
        }
      } catch {
        const lost = this.checkContextLoss();
        for (const sample of completed) this.settleMeasurement(sample.record.measurement, lost ? "device-lost" : "query-failed");
        if (!lost) this.discardAll("query-failed", "GPU disjoint status could not be read");
        return;
      }
      if (this.checkContextLoss()) {
        for (const sample of completed) this.settleMeasurement(sample.record.measurement, "device-lost");
        return;
      }
      for (const sample of completed) {
        this.settleMeasurement(sample.record.measurement, "available");
        sample.record.measurement.gpuDurationMs = sample.durationMs;
        this.samples.push({ label: sample.record.measurement.label, durationMs: sample.durationMs });
      }
    }
  }

  snapshot(): GPUProfilerDetailedSnapshot {
    this.poll();
    const supported = !this.disposed && !this.lost && (this.extension !== null || this.webgpuSupported);
    const samples = this.samples.toArray();
    const cpuSamples = this.cpuSamples.toArray();
    const measurements = this.measurements.toArray();
    const retained = new Set(measurements);
    // A long-running device query is still represented after its history slot
    // rotates out; ownership and device cleanup remain with the active record.
    const pending = [
      ...(this.active ? [this.active.measurement] : []),
      ...this.pending.map((record) => record.measurement),
      ...[...this.webgpuPending].map((record) => record.measurement)
    ];
    for (const measurement of pending) {
      if (!retained.has(measurement)) measurements.push(measurement);
    }
    measurements.sort((a, b) => a.sequence - b.sequence);
    return {
      supported,
      sampleCount: samples.length,
      samples: samples.map((sample) => ({ ...sample })),
      cpuSampleCount: cpuSamples.length,
      cpuSamples: cpuSamples.map((sample) => ({ ...sample })),
      pendingCount: this.pending.length + (this.active ? 1 : 0) + this.webgpuPending.size,
      measurements: measurements.map(({ sequence: _sequence, retained: _retained, ...measurement }) => measurement),
      historyLimit: MAX_RETAINED_HISTORY,
      historyEvictions: {
        gpuSamples: this.samples.evictions,
        cpuSamples: this.cpuSamples.evictions,
        measurements: this.measurements.evictions
      },
      ...(this.unavailableReason ? { unavailableReason: this.unavailableReason } : {})
    };
  }

  /** Releases all pending device queries. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.discardAll("disposed", "GPU profiler disposed");
    if (this.gl) WEBGL_PROFILERS.get(this.gl)?.delete(this);
    for (const record of [...this.webgpuPending]) {
      this.settleMeasurement(record.measurement, "disposed");
      if (record.phase === "submitted" || record.phase === "submitting") this.retireWebGPU(record, record.phase !== "submitting");
      else this.releaseWebGPU(record);
    }
    this.disposed = true;
  }

  private rememberMeasurement(measurement: MutableMeasurement): void {
    const evicted = this.measurements.push(measurement);
    measurement.retained = true;
    if (evicted) evicted.retained = false;
  }

  private settleMeasurement(measurement: MutableMeasurement, status: GPUProfilerStatus): void {
    measurement.gpuStatus = status;
    // Reinsert a pending scope that outlived its original history slot so its
    // final status remains observable, including after device loss/disposal.
    if (!measurement.retained) this.rememberMeasurement(measurement);
  }

  private async readWebGPU(record: WebGPUPassRecord): Promise<void> {
    const buffer = record.readbackBuffer!;
    let mapped = false;
    try {
      await buffer.mapAsync(0x0001); // GPUMapMode.READ
      mapped = true;
      if (record.phase !== "submitted") return;
      const bytes = buffer.getMappedRange();
      if (bytes.byteLength < 16) throw new Error("Incomplete timestamp readback");
      const times = new BigUint64Array(bytes, 0, 2);
      // An unwritten query set resolves to zero; an equal or reversed pair
      // does not establish a measured interval and must not become a sample.
      if (times[1]! <= times[0]!) {
        this.settleMeasurement(record.measurement, "invalid-result");
        this.unavailableReason = "WebGPU timestamps did not contain a valid measured interval";
        return;
      }
      const elapsedNanoseconds = Number(times[1]! - times[0]!);
      if (!Number.isSafeInteger(elapsedNanoseconds)) throw new Error("Timestamp interval is out of range");
      const durationMs = elapsedNanoseconds / 1_000_000;
      record.measurement.gpuDurationMs = durationMs;
      this.settleMeasurement(record.measurement, "available");
      this.samples.push({ label: record.measurement.label, durationMs });
    } catch {
      if (record.phase === "submitted") {
        this.settleMeasurement(record.measurement, "query-failed");
        this.unavailableReason = "WebGPU timestamp readback failed";
      }
    } finally {
      if (mapped) {
        try { buffer.unmap(); } catch { /* device may have been lost */ }
      }
      if (mapped || record.phase === "done") this.releaseWebGPU(record);
      else this.retireWebGPU(record);
    }
  }

  private releaseWebGPU(record: WebGPUPassRecord): void {
    if (record.phase === "done") return;
    record.phase = "done";
    this.webgpuPending.delete(record);
    this.webgpuRetiring.delete(record);
    try { record.querySet?.destroy(); } catch { /* device may have been lost */ }
    try { record.resolveBuffer?.destroy(); } catch { /* device may have been lost */ }
    try { record.readbackBuffer?.destroy(); } catch { /* device may have been lost */ }
  }

  private retireWebGPU(record: WebGPUPassRecord, fence = true): void {
    if (record.phase === "done") return;
    record.phase = "retiring";
    this.webgpuPending.delete(record);
    if (!record.querySet) { this.releaseWebGPU(record); return; }
    this.webgpuRetiring.add(record);
    if (fence) this.fenceWebGPURetirement(record);
  }

  private fenceWebGPURetirement(record: WebGPUPassRecord): void {
    // No fence, or a rejected fence, provides no proof that queued work finished.
    try {
      void this.webgpu?.queue.onSubmittedWorkDone?.().then(() => this.releaseWebGPU(record), () => {});
    } catch { /* Retain until confirmed device loss. */ }
  }

  private onWebGPULost(confirmed: boolean): void {
    if (this.lost && !confirmed) return;
    this.lost = true;
    if (!this.disposed) this.unavailableReason = "WebGPU device lost";
    for (const record of [...this.webgpuPending]) {
      if (!this.disposed) this.settleMeasurement(record.measurement, "device-lost");
      if (confirmed || (record.phase !== "submitted" && record.phase !== "submitting")) this.releaseWebGPU(record);
      else this.retireWebGPU(record, record.phase !== "submitting");
    }
    if (confirmed) for (const record of [...this.webgpuRetiring]) this.releaseWebGPU(record);
  }

  private startQuery(measurement: MutableMeasurement): QueryRecord | null {
    if (!this.gl || !this.extension || this.lost) return null;
    if (this.active) {
      this.settleMeasurement(measurement, "overlapping");
      return null;
    }
    let query: WebGLQuery | null = null;
    let began = false;
    try {
      // Another profiler or renderer may already have an elapsed query open on
      // this context. Do not disturb that owner's query.
      if (this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) {
        this.settleMeasurement(measurement, "overlapping");
        return null;
      }
      query = this.gl.createQuery();
      if (!query) {
        this.settleMeasurement(measurement, "query-failed");
        this.unavailableReason = "GPU timer query allocation failed";
        return null;
      }
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
      began = true;
      // WebGL reports many API errors via state rather than exceptions.
      if (this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY) !== query) {
        this.deleteQuery(query);
        this.settleMeasurement(measurement, "query-failed");
        this.unavailableReason = "GPU timer query could not be started";
        return null;
      }
      const record = { query, measurement };
      this.active = record;
      return record;
    } catch {
      // beginQuery may have succeeded before a later state check threw.
      if (began) {
        try { this.gl.endQuery(this.extension.TIME_ELAPSED_EXT); } catch { /* lost context */ }
      }
      if (query) this.deleteQuery(query);
      if (this.checkContextLoss()) this.settleMeasurement(measurement, "device-lost");
      else {
        this.settleMeasurement(measurement, "query-failed");
        this.unavailableReason = "GPU timer query could not be started";
      }
      return null;
    }
  }

  private endQuery(record: QueryRecord | null): void {
    if (!record || this.active !== record || this.checkContextLoss()) return;
    try {
      if (this.gl!.getQuery(this.extension!.TIME_ELAPSED_EXT, this.gl!.CURRENT_QUERY) !== record.query) {
        this.active = null;
        this.settleMeasurement(record.measurement, "query-failed");
        this.deleteQuery(record.query);
        this.unavailableReason = "GPU timer query was ended or replaced by another owner";
        return;
      }
      this.gl!.endQuery(this.extension!.TIME_ELAPSED_EXT);
      this.active = null;
      this.pending.push(record);
      while (this.pending.length > MAX_PENDING_QUERIES) {
        const oldest = this.pending.shift()!;
        this.settleMeasurement(oldest.measurement, "discarded");
        this.deleteQuery(oldest.query);
        this.unavailableReason = "GPU timer pending query limit exceeded";
      }
    } catch {
      if (this.checkContextLoss()) return;
      this.active = null;
      this.settleMeasurement(record.measurement, "query-failed");
      this.deleteQuery(record.query);
      this.unavailableReason = "GPU timer query could not be ended";
    }
  }

  private checkContextLoss(): boolean {
    if (this.lost || !this.gl) return this.lost;
    try {
      if (!this.gl.isContextLost()) return false;
    } catch {
      // An inaccessible device cannot supply valid timings either.
    }
    for (const profiler of WEBGL_PROFILERS.get(this.gl) ?? [this]) {
      profiler.lost = true;
      profiler.discardAll("device-lost", "WebGL2 context lost");
    }
    this.lost = true;
    this.unavailableReason = "WebGL2 context lost";
    return true;
  }

  private discardAll(status: GPUProfilerStatus, reason: string): void {
    if (this.active) {
      // Avoid touching another owner's query. On a lost context endQuery is
      // unnecessary; WebGL may ignore cleanup operations while lost.
      try {
        if (this.gl && this.extension && !this.lost
          && this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY) === this.active.query) {
          this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
        }
      } catch { /* best-effort cleanup after device failure */ }
      this.settleMeasurement(this.active.measurement, status);
      this.deleteQuery(this.active.query);
      this.active = null;
    }
    for (const record of this.pending.splice(0)) {
      this.settleMeasurement(record.measurement, status);
      this.deleteQuery(record.query);
    }
    this.unavailableReason = reason;
  }

  private deleteQuery(query: WebGLQuery): void {
    try { this.gl?.deleteQuery(query); } catch { /* context may already be lost */ }
  }
}
