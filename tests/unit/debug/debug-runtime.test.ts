import { describe, expect, it } from "vitest";
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

  it("reports unavailable GPU timing without throwing", () => {
    const profiler = new GPUProfiler(false, "EXT_disjoint_timer_query_webgl2 unavailable");
    profiler.begin("shadow-pass").end(0.25);

    expect(profiler.snapshot()).toMatchObject({
      supported: false,
      sampleCount: 1,
      unavailableReason: "EXT_disjoint_timer_query_webgl2 unavailable"
    });
  });

  it("exports CPU and GPU profiler samples to deterministic Chrome trace JSON", () => {
    const times = [2, 5, 9, 17];
    const cpu = new Profiler(() => times.shift() ?? 17);
    const gpu = new GPUProfiler(false, "EXT_disjoint_timer_query_webgl2 unavailable");
    cpu.begin("frame");
    cpu.begin("render");
    cpu.end("render");
    cpu.end("frame");
    gpu.begin("shadow-pass").end(0.75);

    const trace = ChromeTraceExporter.create(cpu.snapshot(), gpu.snapshot(), {
      profileName: "old-profiler-port",
      processId: 7,
      cpuThreadId: 11,
      gpuThreadId: 12
    });

    expect(trace.metadata).toMatchObject({
      source: "galileo3d-debug-chrome-trace-exporter",
      profileName: "old-profiler-port",
      cpuMarkerCount: 2,
      gpuSampleCount: 1
    });
    expect(trace.metadata.claimBoundary).toContain("not Unity/Unreal profiler parity");
    expect(trace.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "render", cat: "cpu", ph: "X", ts: 5000, dur: 4000, pid: 7, tid: 11 }),
      expect.objectContaining({ name: "frame", cat: "cpu", ph: "X", ts: 2000, dur: 15000, pid: 7, tid: 11 }),
      expect.objectContaining({ name: "shadow-pass", cat: "gpu", ph: "X", dur: 750, pid: 7, tid: 12 }),
      expect.objectContaining({ name: "gpu_timing_unavailable", cat: "gpu", ph: "i", pid: 7, tid: 12 }),
      expect.objectContaining({ name: "profile_counters", cat: "counters", ph: "C", pid: 7, tid: 11 })
    ]));
    expect(ChromeTraceExporter.toJson(trace)).toContain("\"displayTimeUnit\": \"ms\"");
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
