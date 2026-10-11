import { test, expect } from "@playwright/test";
import { runPerfTool, writePerfReport } from "./perfTool";
import type { ThroughputArm } from "../harness/perf";

// PRD-01 §19 / S13 on `prd01-draw-throughput` content (2,000 unique-material
// boxes + 10,000 instances), Renderer-level on macos-14 Chromium:
//  - 600 measured frames after the renderer-level ready (warm) frames;
//  - 0 RenderPipeline constructions and 0 program compiles in those frames;
//  - 0 GL buffer / render-target creation (C-28 deltas);
//  - JS heap ≤ 16 KB/frame (precise performance.memory);
//  - CPU submit (median `Renderer.render` ms) under `core` ≤ 40 % of flag-off.

test("prd01-draw-throughput: steady state, heap and CPU submit budgets", async ({ page }) => {
  const { report, pageErrors } = await runPerfTool<{ arms: ThroughputArm[]; cpuSubmitRatio: number; errors: string[] }>(
    page, "tools=perf-throughput&a3d-qr=core", 240_000
  );
  writePerfReport("draw-throughput", report);
  const core = report.arms.find((arm) => arm.arm === "core")!;
  const none = report.arms.find((arm) => arm.arm === "none")!;
  console.log(JSON.stringify({ core, none, cpuSubmitRatio: report.cpuSubmitRatio }));

  expect(core.measuredFrames).toBe(600);
  expect(core.pipelineConstructionsAfterWarm, "RenderPipeline constructions after ready").toBe(0);
  expect(core.programCompilesAfterWarm, "program compiles after ready").toBe(0);
  expect(core.bufferDelta, "GL buffers created per steady frame").toBe(0);
  expect(core.renderTargetDelta, "render targets created per steady frame").toBe(0);
  expect(core.heapBytesPerFrame, "performance.memory must be available (precise)").not.toBeNull();
  expect(core.heapBytesPerFrame!, "JS heap bytes/frame").toBeLessThanOrEqual(16 * 1024);
  expect(report.cpuSubmitRatio, `CPU submit core ${core.cpuSubmitMsMedian} ms vs flag-off ${none.cpuSubmitMsMedian} ms`).toBeLessThanOrEqual(0.4);
  expect(report.errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
