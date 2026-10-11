import { test, expect } from "@playwright/test";
import { runPerfTool } from "../perf/perfTool";

// 01-S7 / PRD-01 §6.4: with KHR_parallel_shader_compile (Chromium/ANGLE on
// macos-14 exposes it), ProgramCache.acquire returns `pending` without
// blocking the frame, then `ready` once COMPLETION_STATUS_KHR reports done.

test("KHR_parallel_shader_compile: acquire is pending then ready without blocking", async ({ page }) => {
  const { report, pageErrors } = await runPerfTool<{
    extension: boolean; probeParallelShaderCompile: boolean; firstStatus: string; acquireMs: number;
    framesUntilReady: number; finalStatus: string; pendingDuringFirstFrame: number; failed: number; errors: string[];
  }>(page, "tools=parallel-compile&a3d-qr=core", 120_000);
  console.log(JSON.stringify(report));
  expect(report.extension, "KHR_parallel_shader_compile on the runner").toBe(true);
  expect(report.probeParallelShaderCompile).toBe(true);
  expect(report.firstStatus).toBe("pending");
  expect(report.pendingDuringFirstFrame).toBeGreaterThanOrEqual(1);
  expect(report.framesUntilReady).toBeGreaterThanOrEqual(1);
  expect(report.finalStatus).toBe("ready");
  expect(report.failed).toBe(0);
  expect(report.errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
