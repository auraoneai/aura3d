import { test, expect } from "@playwright/test";
import { runPerfTool, writePerfReport } from "../perf/perfTool";

// PRD-01 §15 Phase 6b/6c on a real WebGL2 device (`core`):
//  - 10,000 instances submit exactly one draw, and frame 2 creates no buffers;
//  - 1,000 instance buffers each key one cached VAO, and disposing them
//    returns C-28 `liveVertexArrays` to the baseline (§6.1 eviction).

test("instancing buffers: 10k instances = 1 draw, VAO eviction at 1,000 buffers", async ({ page }) => {
  const { report, pageErrors } = await runPerfTool<{
    instancedDraws: number; instanceCount: number; bufferDeltaFrame2: number;
    vaoBaseline: number; vaoPeak: number; vaoAfterDispose: number; evictedBuffers: number; errors: string[];
  }>(page, "tools=perf-instancing&a3d-qr=core", 120_000);
  writePerfReport("instancing-buffers", report);
  console.log(JSON.stringify(report));
  expect(report.instanceCount).toBe(10_000);
  expect(report.instancedDraws).toBe(1);
  expect(report.bufferDeltaFrame2).toBe(0);
  expect(report.evictedBuffers).toBe(1_000);
  expect(report.vaoPeak - report.vaoBaseline).toBe(1_000);
  expect(report.vaoAfterDispose).toBe(report.vaoBaseline);
  expect(report.errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
