import { test, expect } from "@playwright/test";
import { runPerfTool, writePerfReport } from "./perfTool";

// PRD-01 S13 / T0-06: 0 program compiles (and 0 pipeline constructions)
// during a 60 s scripted camera orbit after ready, `core` flags.

test("60 s orbit after ready compiles nothing", async ({ page }) => {
  const { report, pageErrors } = await runPerfTool<{
    frames: number; seconds: number; programCompilesAfterReady: number; pipelineConstructionsAfterReady: number; errors: string[];
  }>(page, "tools=perf-orbit&seconds=60&a3d-qr=core", 200_000);
  writePerfReport("orbit-60s", report);
  console.log(JSON.stringify(report));
  expect(report.seconds).toBeGreaterThanOrEqual(60);
  expect(report.frames).toBeGreaterThan(60);
  expect(report.programCompilesAfterReady).toBe(0);
  expect(report.pipelineConstructionsAfterReady).toBe(0);
  expect(report.errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
