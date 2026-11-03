import { describe, expect, it } from "vitest";
import type { GPUProfilerWebGPUBuffer, GPUProfilerWebGPUDevice, GPUProfilerWebGPUEncoder } from "../../../packages/debug/src/GPUProfiler";
import {
  ChromeTraceExporter,
  DebugOverlay,
  DebugLineCanvasRenderer,
  ECSInspector,
  GPUProfiler,
  Profiler,
  ReportExporter,
  ResourceLeakError,
  ResourceTracker,
  buildAxesHelper,
  buildBoundsHelper,
  buildCameraFrustumHelper,
  buildDirectionalLightHelper,
  buildGridHelper,
  buildSkeletonHelper
} from "../../../packages/debug/src";

describe("debug runtime helpers", () => {
  it("records nested CPU profiler markers", () => {
    const times = [0, 1, 4, 10];
    const profiler = new Profiler(() => times.shift() ?? 10);

    profiler.begin("frame");
    profiler.begin("update");
    profiler.end("update");
    profiler.end("frame");

    expect(profiler.snapshot()).toMatchObject({
      markerCount: 2,
      totalDurationMs: 13,
      markers: [
        { name: "update", durationMs: 3, depth: 1 },
        { name: "frame", durationMs: 10, depth: 0 }
      ]
    });
  });

  it("records unsupported and caller-provided durations only as CPU time", () => {
    const profiler = new GPUProfiler(false, "EXT_disjoint_timer_query_webgl2 unavailable");
    const cpu = profiler.begin("shadow-pass").end(0.25);

    expect(cpu).toEqual({ label: "shadow-pass", durationMs: 0.25, source: "cpu", measurement: "caller" });
    expect(profiler.snapshot()).toMatchObject({
      supported: false,
      sampleCount: 0,
      samples: [],
      cpuSampleCount: 1,
      measurements: [{ label: "shadow-pass", cpuDurationMs: 0.25, gpuStatus: "unsupported" }],
      unavailableReason: "EXT_disjoint_timer_query_webgl2 unavailable"
    });
    expect(new GPUProfiler(true).snapshot()).toMatchObject({ supported: false, sampleCount: 0 });
    const gl = mockTimerContext(false);
    const withoutExtension = new GPUProfiler(gl.context);
    withoutExtension.begin("no-query").end(1);
    expect(withoutExtension.snapshot()).toMatchObject({
      supported: false, sampleCount: 0, measurements: [{ gpuStatus: "unsupported" }]
    });
    expect(gl.deleted).toHaveLength(0);
  });

  it("polls real elapsed queries without waiting and attributes repeated labels independently", () => {
    const gl = mockTimerContext();
    const times = [1, 5, 6, 9];
    const profiler = new GPUProfiler(gl.context, undefined, () => times.shift()!);
    profiler.begin("pass").end();
    profiler.begin("pass").end();
    expect(profiler.snapshot()).toMatchObject({
      supported: true, sampleCount: 0, pendingCount: 2,
      cpuSamples: [
        { label: "pass", durationMs: 4, source: "cpu", measurement: "clock" },
        { label: "pass", durationMs: 3, source: "cpu", measurement: "clock" }
      ],
      measurements: [{ gpuStatus: "pending" }, { gpuStatus: "pending" }]
    });
    expect(gl.resultReads).toBe(0);

    gl.complete(1, 2_500_000);
    expect(profiler.snapshot()).toMatchObject({
      sampleCount: 1, pendingCount: 1, samples: [{ label: "pass", durationMs: 2.5 }],
      measurements: [
        { cpuDurationMs: 4, gpuStatus: "pending" },
        { cpuDurationMs: 3, gpuDurationMs: 2.5, gpuStatus: "available" }
      ]
    });
    gl.complete(0, 750_000);
    expect(profiler.snapshot()).toMatchObject({
      sampleCount: 2, pendingCount: 0,
      samples: [{ label: "pass", durationMs: 2.5 }, { label: "pass", durationMs: 0.75 }],
      measurements: [
        { cpuDurationMs: 4, gpuDurationMs: 0.75, gpuStatus: "available" },
        { cpuDurationMs: 3, gpuDurationMs: 2.5, gpuStatus: "available" }
      ]
    });
    expect(gl.deleted).toHaveLength(2);
  });

  it("discards all in-flight queries on disjoint without manufacturing a GPU result", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    profiler.begin("first").end(4);
    profiler.begin("second").end(5);
    gl.complete(0, 1_000_000);
    gl.disjoint = true;

    expect(profiler.snapshot()).toMatchObject({
      supported: true, sampleCount: 0, pendingCount: 0,
      measurements: [{ gpuStatus: "disjoint" }, { gpuStatus: "disjoint" }],
      unavailableReason: expect.stringContaining("disjoint")
    });
    expect(gl.resultReads).toBe(0);
    expect(gl.deleted).toHaveLength(2);
    profiler.begin("recovered").end(1);
    gl.complete(2, 3_000_000);
    expect(profiler.snapshot()).toMatchObject({ sampleCount: 1, samples: [{ label: "recovered", durationMs: 3 }] });
  });

  it("rejects a WebGL batch if disjoint occurs while reading a result", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    profiler.begin("pass").end(1);
    gl.complete(0, 4_000_000);
    gl.disjointOnResult = true;
    expect(profiler.snapshot()).toMatchObject({
      sampleCount: 0, pendingCount: 0, measurements: [{ gpuStatus: "disjoint" }]
    });
    expect(gl.deleted).toHaveLength(1);
    profiler.dispose();
  });

  it("propagates a shared WebGL disjoint event to all profiler instances on the context", () => {
    const gl = mockTimerContext();
    const first = new GPUProfiler(gl.context);
    const second = new GPUProfiler(gl.context);
    first.begin("a").end(1);
    second.begin("b").end(1);
    gl.complete(0, 2_000_000);
    gl.complete(1, 3_000_000);
    gl.disjoint = true;
    expect(first.snapshot().measurements[0]?.gpuStatus).toBe("disjoint");
    expect(second.snapshot()).toMatchObject({ sampleCount: 0, measurements: [{ gpuStatus: "disjoint" }] });
    expect(gl.resultReads).toBe(0);
    expect(gl.deleted).toHaveLength(2);
    first.dispose();
    second.dispose();
  });

  it("reports context loss and disposes outstanding queries, including active scopes", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    profiler.begin("queued").end(1);
    const active = profiler.begin("active");
    gl.lost = true;
    active.end(2);
    expect(profiler.snapshot()).toMatchObject({
      supported: false, pendingCount: 0, sampleCount: 0,
      measurements: [{ gpuStatus: "device-lost" }, { gpuStatus: "device-lost" }],
      unavailableReason: "WebGL2 context lost"
    });
    expect(gl.deleted).toHaveLength(2);
    profiler.begin("after loss").end(1);
    expect(profiler.snapshot().measurements[2]?.gpuStatus).toBe("device-lost");
    profiler.dispose();
    profiler.dispose();
    expect(() => profiler.begin("late")).toThrow(/disposed/);
  });

  it("marks overlapping scopes and invalid results instead of calling them GPU timings", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    const outer = profiler.begin("outer");
    const inner = profiler.begin("inner");
    inner.end(1);
    outer.end(2);
    gl.complete(0, Number.NaN);
    expect(profiler.snapshot()).toMatchObject({
      sampleCount: 0,
      measurements: [{ gpuStatus: "invalid-result" }, { gpuStatus: "overlapping" }]
    });
    const once = profiler.begin("once");
    expect(() => once.end(-1)).toThrow(/finite non-negative/);
    once.end(1);
    expect(() => once.end(1)).toThrow(/already ended/);
    profiler.dispose();
    expect(profiler.snapshot().measurements[2]?.gpuStatus).toBe("disposed");
  });

  it("leaves an external WebGL query alone and bounds pending queries", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    const external = { available: false, result: 0 };
    gl.current = external;
    profiler.begin("external overlap").end(1);
    expect(gl.current).toBe(external);
    expect(profiler.snapshot().measurements[0]?.gpuStatus).toBe("overlapping");
    gl.current = null;
    for (let i = 0; i < 65; i += 1) profiler.begin(`pending-${i}`).end(1);
    const snapshot = profiler.snapshot();
    expect(snapshot.pendingCount).toBe(64);
    expect(snapshot.measurements[1]?.gpuStatus).toBe("discarded");
    expect(snapshot.sampleCount).toBe(0);
    profiler.dispose();
    expect(gl.deleted).toHaveLength(65);
  });

  it("bounds long-running CPU, GPU and scope histories and reports their evictions", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    for (let i = 0; i < 1100; i += 1) {
      profiler.begin(`frame-${i}`).end(i);
      gl.complete(i, (i + 1) * 1_000_000);
      profiler.poll();
    }
    const snapshot = profiler.snapshot();
    expect(snapshot).toMatchObject({
      historyLimit: 1024, sampleCount: 1024, cpuSampleCount: 1024, pendingCount: 0,
      historyEvictions: { gpuSamples: 76, cpuSamples: 76, measurements: 76 }
    });
    expect(snapshot.samples[0]).toEqual({ label: "frame-76", durationMs: 77 });
    expect(snapshot.samples.at(-1)).toEqual({ label: "frame-1099", durationMs: 1100 });
    expect(snapshot.cpuSamples[0]?.label).toBe("frame-76");
    expect(snapshot.measurements[0]?.label).toBe("frame-76");
    expect(snapshot.measurements).toHaveLength(1024);
    expect(gl.deleted).toHaveLength(1100);
    const trace = ChromeTraceExporter.create(new Profiler().snapshot(), snapshot, { includeCounters: false });
    expect(trace.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "profiler_history_evicted", args: { gpuSamples: 76, cpuSamples: 76, measurements: 76, historyLimit: 1024 } })
    ]));
    profiler.dispose();
  });

  it("retains pending scopes through history rotation and exposes their final loss or disposal", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    profiler.begin("old-pending").end(1);
    const active = profiler.begin("active");
    for (let i = 0; i < 1100; i += 1) profiler.begin(`overlap-${i}`).end(1);
    const pending = profiler.snapshot();
    expect(pending.pendingCount).toBe(2);
    expect(pending.measurements).toHaveLength(1026);
    expect(pending.measurements.slice(0, 2)).toEqual([
      { label: "old-pending", cpuDurationMs: 1, gpuStatus: "pending" },
      { label: "active", gpuStatus: "pending" }
    ]);
    expect(pending.historyEvictions.measurements).toBe(78);
    gl.lost = true;
    active.end(1);
    const lost = profiler.snapshot();
    expect(lost.pendingCount).toBe(0);
    expect(lost.sampleCount).toBe(0);
    expect(lost.measurements.slice(0, 2)).toEqual([
      { label: "old-pending", cpuDurationMs: 1, gpuStatus: "device-lost" },
      { label: "active", cpuDurationMs: 1, gpuStatus: "device-lost" }
    ]);
    expect(lost.historyEvictions.measurements).toBe(80);
    expect(gl.deleted).toHaveLength(2);
    profiler.dispose();

    const disposableGl = mockTimerContext();
    const disposable = new GPUProfiler(disposableGl.context);
    disposable.begin("long").end(1);
    const open = disposable.begin("open");
    for (let i = 0; i < 1100; i += 1) disposable.begin(`overlap-${i}`).end(1);
    disposable.dispose();
    const frozen = disposable.snapshot();
    expect(() => open.end(2)).toThrow(/disposed/);
    const disposed = disposable.snapshot();
    expect(disposed).toEqual(frozen);
    expect(disposed.pendingCount).toBe(0);
    expect(disposed.measurements.slice(0, 2)).toEqual([
      { label: "long", cpuDurationMs: 1, gpuStatus: "disposed" },
      { label: "open", gpuStatus: "disposed" }
    ]);
    expect(disposableGl.deleted).toHaveLength(2);
  });

  it("preserves a delayed WebGL result after its initial history slot rotates out", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    profiler.begin("delayed").end(1);
    const active = profiler.begin("active");
    for (let i = 0; i < 1100; i += 1) profiler.begin(`overlap-${i}`).end(1);
    expect(profiler.snapshot().measurements[0]).toMatchObject({ label: "delayed", gpuStatus: "pending" });
    gl.complete(0, 4_000_000);
    const completed = profiler.snapshot();
    expect(completed.samples).toEqual([{ label: "delayed", durationMs: 4 }]);
    expect(completed.measurements[0]).toMatchObject({ label: "delayed", gpuStatus: "available", gpuDurationMs: 4 });
    expect(completed.pendingCount).toBe(1);
    active.end(1);
    gl.complete(1, 5_000_000);
    expect(profiler.snapshot().samples).toEqual([
      { label: "delayed", durationMs: 4 },
      { label: "active", durationMs: 5 }
    ]);
    profiler.dispose();
  });

  it("preserves an in-flight WebGPU timestamp through history rotation and device loss", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("delayed");
    timer.end(gpu.encoder, 1);
    profiler.submitWebGPU(gpu.encoder, [timer]);
    for (let i = 0; i < 1100; i += 1) profiler.begin(`cpu-${i}`).end(1);
    const pending = profiler.snapshot();
    expect(pending.pendingCount).toBe(1);
    expect(pending.measurements[0]).toMatchObject({ label: "delayed", gpuStatus: "pending" });
    gpu.lose();
    await Promise.resolve();
    const lost = profiler.snapshot();
    expect(lost.pendingCount).toBe(0);
    expect(lost.sampleCount).toBe(0);
    expect(lost.measurements[0]).toMatchObject({ label: "delayed", gpuStatus: "device-lost" });
    expect(gpu.destroyed).toHaveLength(3);
    gpu.complete(0n, 5_000_000n);
    await Promise.resolve();
    expect(profiler.snapshot().sampleCount).toBe(0);
  });

  it("does not change WebGL history or revive queries when an open timer ends after disposal", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    const timer = profiler.begin("open");
    profiler.dispose();
    const frozen = profiler.snapshot();
    expect(frozen).toMatchObject({
      supported: false, pendingCount: 0, sampleCount: 0, cpuSampleCount: 0,
      measurements: [{ label: "open", gpuStatus: "disposed" }]
    });
    expect(() => timer.end(3)).toThrow(/disposed/);
    expect(profiler.snapshot()).toEqual(frozen);
    expect(gl.deleted).toHaveLength(1);
    expect(gl.current).toBeNull();
  });

  it("allows a WebGL scope to finish CPU timing after context loss without a GPU result", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    const timer = profiler.begin("lost");
    gl.lost = true;
    expect(profiler.snapshot().measurements[0]?.gpuStatus).toBe("device-lost");
    expect(timer.end(3)).toMatchObject({ label: "lost", durationMs: 3, source: "cpu" });
    expect(profiler.snapshot()).toMatchObject({
      supported: false, pendingCount: 0, sampleCount: 0, cpuSampleCount: 1,
      measurements: [{ label: "lost", cpuDurationMs: 3, gpuStatus: "device-lost" }]
    });
    expect(gl.deleted).toHaveLength(1);
  });

  it("does not change WebGPU history or encode commands when a pass ends after disposal", () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("open");
    profiler.dispose();
    const frozen = profiler.snapshot();
    expect(() => timer.end(gpu.encoder, 2)).toThrow(/disposed/);
    expect(profiler.snapshot()).toEqual(frozen);
    expect(gpu.events).toEqual([]);
    expect(gpu.destroyed).toEqual(["query", "resolve-buffer", "readback-buffer"]);
  });

  it("allows a WebGPU pass to finish CPU timing after device loss without encoding GPU work", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("lost");
    gpu.lose();
    await Promise.resolve();
    expect(timer.end(gpu.encoder, 3)).toMatchObject({ label: "lost", durationMs: 3, source: "cpu" });
    expect(profiler.snapshot()).toMatchObject({
      supported: false, pendingCount: 0, sampleCount: 0, cpuSampleCount: 1,
      measurements: [{ label: "lost", cpuDurationMs: 3, gpuStatus: "device-lost" }]
    });
    expect(gpu.events).toEqual([]);
    expect(gpu.destroyed).toEqual(["query", "resolve-buffer", "readback-buffer"]);
    expect(() => profiler.submitWebGPU(gpu.encoder, [timer])).toThrow(/device lost/);
  });

  it("rejects WebGPU readbacks containing an unwritten timestamp pair", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("unwritten");
    timer.end(gpu.encoder, 1);
    profiler.submitWebGPU(gpu.encoder, [timer]);
    gpu.complete(0n, 0n);
    await Promise.resolve();
    expect(profiler.snapshot()).toMatchObject({
      sampleCount: 0,
      pendingCount: 0,
      measurements: [{ gpuStatus: "invalid-result" }]
    });
  });

  it("resolves WebGPU pass timestamps only after the containing encoder is submitted", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("render");
    expect(timer.timestampWrites).toMatchObject({ beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 });
    // A caller attaches timestampWrites to its render/compute pass and ends it.
    timer.end(gpu.encoder, 8);
    expect(profiler.snapshot()).toMatchObject({
      supported: true, sampleCount: 0, pendingCount: 1,
      measurements: [{ cpuDurationMs: 8, gpuStatus: "pending" }]
    });
    expect(gpu.events).toEqual(["resolve", "copy"]);
    profiler.submitWebGPU(gpu.encoder, [timer]);
    expect(gpu.events).toEqual(["resolve", "copy", "finish", "submit", "map"]);
    expect(profiler.snapshot().sampleCount).toBe(0);
    gpu.complete(1_000_000n, 3_500_000n);
    await Promise.resolve();
    expect(profiler.snapshot()).toMatchObject({
      sampleCount: 1, pendingCount: 0, samples: [{ label: "render", durationMs: 2.5 }],
      measurements: [{ cpuDurationMs: 8, gpuDurationMs: 2.5, gpuStatus: "available" }]
    });
    expect(gpu.destroyed).toEqual(["query", "resolve-buffer", "readback-buffer"]);
    expect(gpu.events).toContain("unmap");
  });

  it("hands an encoded pass to the owner's submission path before mapping", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = GPUProfiler.fromWebGPUDevice(gpu.device);
    const timer = profiler.beginWebGPUPass("forward-pass");
    timer.end(gpu.encoder, 4);
    profiler.submitWebGPUWith(gpu.encoder, [timer], () => {
      const command = gpu.encoder.finish();
      gpu.events.push("owner-submit");
      gpu.device.queue.submit([command]);
    });
    expect(gpu.events).toEqual(["resolve", "copy", "finish", "owner-submit", "submit", "map"]);
    expect(profiler.snapshot()).toMatchObject({ sampleCount: 0, pendingCount: 1 });
    gpu.complete(1_000_000n, 3_500_000n);
    await Promise.resolve();
    expect(profiler.snapshot()).toMatchObject({ sampleCount: 1, samples: [{ label: "forward-pass", durationMs: 2.5 }] });
  });

  it("cancels abandoned encoders and keeps uncertain submissions alive until a fence", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const abandoned = profiler.beginWebGPUPass("abandoned");
    profiler.cancelWebGPUPass(abandoned);
    expect(profiler.snapshot().measurements[0]?.gpuStatus).toBe("discarded");
    expect(gpu.destroyed).toHaveLength(3);
    const timer = profiler.beginWebGPUPass("uncertain");
    timer.end(gpu.encoder, 1);
    expect(() => profiler.submitWebGPUWith(gpu.encoder, [timer], () => {
      gpu.device.queue.submit([gpu.encoder.finish()]);
      throw new Error("after enqueue");
    })).toThrow("after enqueue");
    expect(gpu.events).not.toContain("map");
    expect(gpu.destroyed).toHaveLength(3);
    expect(profiler.snapshot()).toMatchObject({ sampleCount: 0, pendingCount: 0,
      measurements: [{ gpuStatus: "discarded" }, { gpuStatus: "query-failed" }] });
    gpu.finishFence();
    await Promise.resolve();
    expect(gpu.destroyed).toHaveLength(6);
  });

  it("defers disposal during submission until a post-submit fence and ignores late readback", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("in-flight");
    timer.end(gpu.encoder, 1);
    profiler.submitWebGPUWith(gpu.encoder, [timer], () => {
      gpu.device.queue.submit([gpu.encoder.finish()]);
      profiler.dispose();
      expect(gpu.destroyed).toHaveLength(0);
    });
    const frozen = profiler.snapshot();
    expect(frozen).toMatchObject({ supported: false, sampleCount: 0, pendingCount: 0, measurements: [{ gpuStatus: "disposed" }] });
    expect(gpu.events).not.toContain("map");
    gpu.finishFence();
    await Promise.resolve();
    expect(gpu.destroyed).toHaveLength(3);
    expect(profiler.snapshot()).toEqual(frozen);

    const second = mockWebGPUDevice();
    const reader = new GPUProfiler(second.device);
    const readTimer = reader.beginWebGPUPass("readback");
    readTimer.end(second.encoder, 1);
    reader.submitWebGPU(second.encoder, [readTimer]);
    reader.dispose();
    const afterDispose = reader.snapshot();
    expect(second.destroyed).toHaveLength(0);
    second.complete(1n, 1_000_001n);
    await Promise.resolve();
    expect(reader.snapshot()).toEqual(afterDispose);
    expect(second.destroyed).toHaveLength(3);
  });

  it("bounds retained failed submissions when the device never completes its fence", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    for (let index = 0; index < 64; index += 1) {
      const timer = profiler.beginWebGPUPass(`failed-${index}`);
      timer.end(gpu.encoder, 1);
      expect(() => profiler.submitWebGPUWith(gpu.encoder, [timer], () => { throw new Error("submit failed"); })).toThrow();
    }
    const limited = profiler.beginWebGPUPass("limited");
    expect(limited.timestampWrites).toBeUndefined();
    limited.end(gpu.encoder, 1);
    expect(profiler.snapshot().measurements.at(-1)?.gpuStatus).toBe("discarded");
    expect(gpu.destroyed).toHaveLength(0);
    gpu.finishFence();
    await Promise.resolve();
    expect(gpu.destroyed).toHaveLength(64 * 3);
  });

  it("validates WebGPU submission ownership and reports missing features without fake samples", () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const first = profiler.beginWebGPUPass("first");
    const second = profiler.beginWebGPUPass("second");
    expect(() => profiler.submitWebGPU(gpu.encoder, [first])).toThrow(/ended/);
    first.end(gpu.encoder, 1);
    second.end(gpu.encoder, 2);
    expect(() => profiler.submitWebGPU(gpu.encoder, [first])).toThrow(/together/);
    expect(() => profiler.submitWebGPU(gpu.encoder, [first, first])).toThrow(/Duplicate/);
    const other = mockWebGPUDevice();
    expect(() => profiler.submitWebGPU(other.encoder, [first, second])).toThrow(/encoder/);
    expect(gpu.events).not.toContain("submit");
    profiler.dispose();
    expect(gpu.destroyed).toHaveLength(6);

    const unsupported = mockWebGPUDevice(false);
    const withoutFeature = new GPUProfiler(unsupported.device);
    const timer = withoutFeature.beginWebGPUPass("cpu-only");
    expect(timer.timestampWrites).toBeUndefined();
    timer.end(unsupported.encoder, 9);
    withoutFeature.submitWebGPU(unsupported.encoder, [timer]);
    expect(withoutFeature.snapshot()).toMatchObject({
      supported: false, sampleCount: 0, cpuSampleCount: 1,
      measurements: [{ gpuStatus: "unsupported", cpuDurationMs: 9 }],
      unavailableReason: "WebGPU timestamp-query feature unavailable"
    });
    expect(unsupported.events).toEqual(["finish", "submit"]);
  });

  it("drops pending WebGPU readbacks on loss and ignores late completion", async () => {
    const gpu = mockWebGPUDevice();
    const profiler = new GPUProfiler(gpu.device);
    const timer = profiler.beginWebGPUPass("lost-pass");
    timer.end(gpu.encoder, 1);
    profiler.submitWebGPU(gpu.encoder, [timer]);
    gpu.lose();
    await Promise.resolve();
    expect(profiler.snapshot()).toMatchObject({
      supported: false, pendingCount: 0, sampleCount: 0,
      measurements: [{ gpuStatus: "device-lost" }],
      unavailableReason: "WebGPU device lost"
    });
    gpu.complete(0n, 5_000_000n);
    await Promise.resolve();
    expect(profiler.snapshot().sampleCount).toBe(0);
    expect(gpu.destroyed).toHaveLength(3);
  });

  it("exports only actual GPU query results to Chrome trace JSON", () => {
    const times = [2, 5, 9, 17];
    const cpu = new Profiler(() => times.shift() ?? 17);
    const gl = mockTimerContext();
    const gpu = new GPUProfiler(gl.context);
    cpu.begin("frame");
    cpu.begin("render");
    cpu.end("render");
    cpu.end("frame");
    gpu.begin("shadow-pass").end(8);
    gl.complete(0, 750_000);

    const trace = ChromeTraceExporter.create(cpu.snapshot(), gpu.snapshot(), {
      profileName: "old-profiler-port",
      processId: 7,
      cpuThreadId: 11,
      gpuThreadId: 12
    });

    expect(trace.metadata).toMatchObject({
      source: "aura3d-debug-chrome-trace-exporter",
      profileName: "old-profiler-port",
      cpuMarkerCount: 2,
      gpuSampleCount: 1
    });
    expect(trace.metadata.claimBoundary).toContain("not Unity/Unreal profiler parity");
    expect(trace.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "render", cat: "cpu", ph: "X", ts: 5000, dur: 4000, pid: 7, tid: 11 }),
      expect.objectContaining({ name: "frame", cat: "cpu", ph: "X", ts: 2000, dur: 15000, pid: 7, tid: 11 }),
      expect.objectContaining({ name: "shadow-pass", cat: "gpu", ph: "X", dur: 750, pid: 7, tid: 12 }),
      expect.objectContaining({ name: "profile_counters", cat: "counters", ph: "C", pid: 7, tid: 11 })
    ]));
    const unsupported = new GPUProfiler(false, "timer unavailable");
    unsupported.begin("not-a-gpu-result").end(20);
    const unsupportedTrace = ChromeTraceExporter.create(cpu.snapshot(), unsupported.snapshot(), { processId: 7, gpuThreadId: 12 });
    expect(unsupportedTrace.metadata.gpuSampleCount).toBe(0);
    expect(unsupportedTrace.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gpu_timing_unavailable", cat: "gpu", ph: "i", pid: 7, tid: 12 })
    ]));
    expect(unsupportedTrace.traceEvents.some((event) => event.name === "not-a-gpu-result")).toBe(false);
    expect(ChromeTraceExporter.toJson(trace)).toContain("\"displayTimeUnit\": \"ms\"");
  });

  it("exports pending, disjoint, and lost scopes as status events with distinct CPU observations", () => {
    const gl = mockTimerContext();
    const profiler = new GPUProfiler(gl.context);
    const cpu = new Profiler().snapshot();
    profiler.begin("pass").end(12.5);
    const pending = ChromeTraceExporter.create(cpu, profiler.snapshot(), { processId: 5, cpuThreadId: 6, gpuThreadId: 7 });
    expect(pending.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "cpu_scope_duration", cat: "cpu", ph: "i", s: "t", pid: 5, tid: 6,
        args: { label: "pass", durationMs: 12.5, source: "cpu", measurement: "caller", timestamp: "not-recorded" }
      }),
      expect.objectContaining({
        name: "gpu_timing_status", cat: "gpu", ph: "i", s: "t", pid: 5, tid: 7,
        args: { label: "pass", status: "pending", scopeIndex: 0, timestamp: "not-recorded" }
      }),
      expect.objectContaining({ name: "profile_counters", args: expect.objectContaining({ gpuProfilerCpuSampleCount: 1, gpuSampleCount: 0 }) })
    ]));
    expect(pending.traceEvents.some((event) => event.cat === "gpu" && event.ph === "X")).toBe(false);

    gl.disjoint = true;
    const disjoint = ChromeTraceExporter.create(cpu, profiler.snapshot());
    expect(disjoint.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gpu_timing_status", args: expect.objectContaining({ label: "pass", status: "disjoint" }) })
    ]));
    expect(disjoint.traceEvents.some((event) => event.cat === "gpu" && event.ph === "X")).toBe(false);

    profiler.begin("second").end(3);
    gl.lost = true;
    const lost = ChromeTraceExporter.create(cpu, profiler.snapshot());
    expect(lost.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gpu_timing_status", args: expect.objectContaining({ label: "second", status: "device-lost", scopeIndex: 1 }) }),
      expect.objectContaining({ name: "gpu_timing_unavailable", args: { reason: "WebGL2 context lost" } })
    ]));
    expect(lost.traceEvents.some((event) => event.cat === "gpu" && event.ph === "X")).toBe(false);
  });

  it("emits each non-available status even when device timing is supported", () => {
    const trace = ChromeTraceExporter.create(new Profiler().snapshot(), {
      supported: true,
      sampleCount: 1,
      samples: [{ label: "complete", durationMs: 0.5 }],
      measurements: [
        { label: "waiting", gpuStatus: "pending" },
        { label: "discarded", gpuStatus: "disjoint" },
        { label: "old-device", gpuStatus: "device-lost" },
        { label: "complete", gpuStatus: "available", gpuDurationMs: 0.5 }
      ]
    });
    const statuses = trace.traceEvents.filter((event) => event.name === "gpu_timing_status");
    expect(statuses.map((event) => event.args?.status)).toEqual(["pending", "disjoint", "device-lost"]);
    expect(statuses.every((event) => event.ph === "i" && event.dur === undefined)).toBe(true);
    expect(trace.traceEvents.filter((event) => event.cat === "gpu" && event.ph === "X")).toEqual([
      expect.objectContaining({ name: "complete", dur: 500 })
    ]);
  });

  it("keeps caller and clock CPU samples distinct and accepts legacy snapshots", () => {
    const times = [10, 12];
    const profiler = new GPUProfiler(false, "timer unavailable", () => times.shift()!);
    profiler.begin("clock").end();
    profiler.begin("caller").end(7);
    const cpu = new Profiler().snapshot();
    const trace = ChromeTraceExporter.create(cpu, profiler.snapshot());
    expect(trace.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "cpu_scope_duration", args: expect.objectContaining({ label: "clock", durationMs: 2, source: "cpu", measurement: "clock" }) }),
      expect.objectContaining({ name: "cpu_scope_duration", args: expect.objectContaining({ label: "caller", durationMs: 7, source: "cpu", measurement: "caller" }) }),
      expect.objectContaining({ name: "gpu_timing_status", args: expect.objectContaining({ label: "clock", status: "unsupported" }) }),
      expect.objectContaining({ name: "gpu_timing_status", args: expect.objectContaining({ label: "caller", status: "unsupported" }) })
    ]));
    expect(trace.traceEvents.some((event) => event.cat === "gpu" && event.ph === "X")).toBe(false);
    const legacy = ChromeTraceExporter.create(cpu, { supported: false, sampleCount: 0, samples: [] });
    expect(legacy.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gpu_timing_unavailable", args: { reason: "GPU timing unavailable" } })
    ]));
    expect(legacy.traceEvents.some((event) => event.name === "cpu_scope_duration" || event.name === "gpu_timing_status")).toBe(false);
  });

  it("detects resource leaks", () => {
    const tracker = new ResourceTracker();
    tracker.track("buffer:1", "buffer");
    tracker.track("texture:1", "texture");
    tracker.dispose("buffer:1");

    expect(tracker.report().leaks).toEqual([{ id: "texture:1", type: "texture", disposed: false }]);
    expect(() => tracker.assertNoLeaks()).toThrow(ResourceLeakError);
  });

  it("creates stable ECS and overlay snapshots", () => {
    const ecs = new ECSInspector().snapshot({ entities: () => [{}, {}] });
    const overlay = new DebugOverlay();
    overlay.setSection("Runtime", [{ label: "entities", value: ecs.entityCount }]);

    expect(ecs.entityCount).toBe(2);
    expect(overlay.snapshot().sections[0]?.rows[0]).toEqual({ label: "entities", value: 2 });
  });

  it("exports deterministic JSON reports", () => {
    const exporter = new ReportExporter(() => new Date("2026-05-04T00:00:00.000Z"));
    const report = exporter.create("debug", { z: 1, a: 2 });

    expect(exporter.toJson(report)).toBe(`{
  "data": {
    "a": 2,
    "z": 1
  },
  "generatedAt": "2026-05-04T00:00:00.000Z",
  "name": "debug"
}
`);
  });

  it("validates debug line canvas render options without requiring a browser DOM", () => {
    const renderer = new DebugLineCanvasRenderer();
    const context = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      set lineWidth(_value: number) {},
      set strokeStyle(_value: string | CanvasGradient | CanvasPattern) {}
    } as unknown as CanvasRenderingContext2D;

    const result = renderer.render(context, [{ from: [-1, 0, 0], to: [1, 1, 0], color: [0, 1, 0, 1] }], {
      scale: 10,
      origin: [50, 50]
    });

    expect(result).toEqual({ lineCount: 1, bounds: { minX: 40, minY: 40, maxX: 60, maxY: 50 } });
    expect(() => renderer.render(context, [], { scale: 0 })).toThrow(/scale/);
  });

  it("builds scene helper line primitives for axes, grids, bounds, cameras, lights, and skeletons", () => {
    expect(buildAxesHelper({ size: 2 })).toHaveLength(3);
    expect(buildGridHelper({ size: 4, divisions: 4 })).toHaveLength(10);
    expect(buildBoundsHelper({ min: [-1, -2, -3], max: [1, 2, 3] })).toHaveLength(12);
    expect(buildCameraFrustumHelper({ nearHalfWidth: 0.5, nearHalfHeight: 0.25, farHalfWidth: 2, farHalfHeight: 1 })).toHaveLength(12);
    expect(buildDirectionalLightHelper({ direction: [0, -2, 0], length: 3 })[0]?.to).toEqual([0, -3, 0]);
    expect(buildSkeletonHelper([
      { id: "root", position: [0, 0, 0] },
      { id: "child", parentId: "root", position: [0, 1, 0] },
      { id: "tip", parentId: "child", position: [0, 2, 0] }
    ])).toHaveLength(2);
    expect(() => buildGridHelper({ divisions: 0 })).toThrow(/divisions/);
    expect(() => buildBoundsHelper({ min: [1, 0, 0], max: [0, 0, 0] })).toThrow(/max/);
  });
});

/** Browser-shaped WebGL2 query fixture; it never starts a browser or device. */
function mockTimerContext(supported = true) {
  type Query = { available: boolean; result: number };
  const queries: Query[] = [];
  const deleted: Query[] = [];
  const extension = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const state = {
    lost: false,
    disjoint: false,
    resultReads: 0,
    disjointOnResult: false,
    current: null as Query | null,
    deleted,
    complete(index: number, nanoseconds: number) {
      queries[index]!.available = true;
      queries[index]!.result = nanoseconds;
    },
    context: null as unknown as WebGL2RenderingContext
  };
  state.context = {
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    CURRENT_QUERY: 0x8865,
    isContextLost: () => state.lost,
    getExtension: (name: string) => supported && name === "EXT_disjoint_timer_query_webgl2" ? extension : null,
    createQuery: () => {
      const query = { available: false, result: 0 };
      queries.push(query);
      return query;
    },
    beginQuery: (_target: number, query: Query) => { state.current = query; },
    endQuery: () => { state.current = null; },
    getQuery: () => state.current,
    getParameter: () => { const result = state.disjoint; state.disjoint = false; return result; },
    getQueryParameter: (query: Query, parameter: number) => {
      if (parameter === 0x8867) return query.available;
      state.resultReads += 1;
      if (state.disjointOnResult) state.disjoint = true;
      return query.result;
    },
    deleteQuery: (query: Query) => { deleted.push(query); }
  } as unknown as WebGL2RenderingContext;
  return state;
}

function mockWebGPUDevice(supported = true) {
  const events: string[] = [];
  const destroyed: string[] = [];
  let settleLoss!: () => void;
  let settleMap!: () => void;
  let settleFence!: () => void;
  let readbackBytes = new ArrayBuffer(16);
  const lost = new Promise<void>((resolve) => { settleLoss = resolve; });
  const mapped = new Promise<void>((resolve) => { settleMap = resolve; });
  const fence = new Promise<void>((resolve) => { settleFence = resolve; });
  let bufferCount = 0;
  const device: GPUProfilerWebGPUDevice = {
    features: { has: () => supported },
    lost,
    queue: { submit: () => { events.push("submit"); }, onSubmittedWorkDone: () => fence },
    createQuerySet: () => ({
      label: "", type: "timestamp", count: 2,
      destroy: () => { destroyed.push("query"); }
    }),
    createBuffer: ({ size, usage }) => {
      const name = bufferCount++ % 2 === 0 ? "resolve-buffer" : "readback-buffer";
      const buffer: GPUProfilerWebGPUBuffer = {
        label: "", size, usage, mapState: "unmapped",
        mapAsync: () => { events.push("map"); return mapped; },
        getMappedRange: () => readbackBytes,
        unmap: () => { events.push("unmap"); },
        destroy: () => { destroyed.push(name); }
      };
      return buffer;
    }
  };
  const encoder: GPUProfilerWebGPUEncoder = {
    resolveQuerySet: () => { events.push("resolve"); },
    copyBufferToBuffer: () => { events.push("copy"); },
    finish: () => { events.push("finish"); return { label: "" }; }
  };
  return {
    device, encoder, events, destroyed,
    finishFence: () => settleFence(),
    lose: () => settleLoss(),
    complete(start: bigint, end: bigint) {
      readbackBytes = new BigUint64Array([start, end]).buffer;
      settleMap();
    }
  };
}
