import { describe, expect, it } from "vitest";
import {
  DebugOverlay,
  DebugLineCanvasRenderer,
  ECSInspector,
  GPUProfiler,
  Profiler,
  ReportExporter,
  ResourceLeakError,
  ResourceTracker
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
});
