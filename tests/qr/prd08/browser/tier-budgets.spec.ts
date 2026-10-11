/**
 * S19 — PRD-08 §17 per-tier lane budgets on the L-8 harness (`?scene=tier`).
 * For each C-27 tier forced through `app.quality.set`:
 *
 *   CPU     standalone lane set (scenarios-tier.ts) populated to the tier's
 *           handle cap and cast demand; lane-only main-thread ms per presented
 *           frame from performance.now() in a cross-origin-isolated page
 *           (5 µs resolution); median and p95 over PRD08_TIER_CPU_FRAMES.
 *   Memory  lane retained heap: mount + warm a throwaway lane set and drop it
 *           (so compiled code / feedback vectors already exist), CDP
 *           HeapProfiler.collectGarbage ×2 → Runtime.getHeapUsage (baseline),
 *           mount + warm the measured set, GC ×2 → usedSize again; the delta
 *           is the lane objects the set retains.
 *   GPU     EXT_disjoint_timer_query_webgl2 TIME_ELAPSED per presented tick on
 *           the mounted app, lane GPU features (fade + screen-feel) on minus
 *           off, medians. Missing extension → the test FAILS (no skip).
 *   Casts   per-frame probe stats under cap+1 demand equal the tier cap.
 *
 * Net-frame (§17): at 30 Hz ticks with fixedDt 1/60 (2 substeps,
 * maxSubSteps 4) the one-submission driver's GPU per presented frame must be
 * below `?renderPerSubstep=1`'s.
 *
 * Results: tests/reports/prd08/tier-budgets/<tier>.json + summary.csv
 * (uploaded by qr-prd08-camera.yml browser-gpu). Thresholds: checks.ts only.
 * Headless mirror: tests/qr/prd08/unit/tier-budgets.test.ts.
 * Remote-only (macos-14 ANGLE Metal); never run locally.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startPrd08DevServer, type ExampleDevServer } from "../dev-server";
import {
  PRD08_TIERS,
  PRD08_TIER_BUDGETS,
  PRD08_TIER_CPU_FRAMES,
  PRD08_TIER_GPU_FRAMES,
  checkNetFrameGpu,
  checkTierCpu,
  checkTierGating,
  checkTierGpu,
  checkTierMemory,
  median,
  percentile,
  type Prd08Tier,
  type TierCpuResult,
  type TierGpuResult
} from "../checks";
import { REPORT_DIR, openHarness, pwExpect, scenario, writeEvidence } from "./harness-page";

let server: ExampleDevServer;
const rows: string[] = [];
const CSV_HEADER =
  "tier,cpu_median_ms,cpu_p95_ms,cpu_budget_ms,gpu_on_median_ms,gpu_off_median_ms,gpu_delta_ms,gpu_budget_ms,retained_bytes,memory_budget_bytes,sphere_casts_max,cast_budget,occluder_queries_max,handles,netframe_one_ms,netframe_per_substep_ms";

async function heapUsed(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize } = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
    return usedSize;
  } finally {
    await cdp.detach();
  }
}

test.describe("prd08 S19 per-tier lane budgets (§17)", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    server = await startPrd08DevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve(REPORT_DIR, "tier-budgets"), { recursive: true });
    writeFileSync(resolve(REPORT_DIR, "tier-budgets", "summary.csv"), `${[CSV_HEADER, ...rows].join("\n")}\n`);
    await server.close();
  });

  for (const tier of PRD08_TIERS) {
    test(`S19 ${tier}: CPU / memory / GPU / casts within §17`, async ({ page, browser }) => {
      const b = PRD08_TIER_BUDGETS[tier as Prd08Tier];
      await openHarness(page, server.origin, "?scripted=1&scene=tier&maxSubSteps=4&coi=1");
      const isolated = await page.evaluate(() => crossOriginIsolated);
      expect(isolated, "harness page must be cross-origin isolated (5 µs performance.now)").toBe(true);

      // Memory: throwaway mount → drop → baseline → measured mount.
      await scenario(page, "tier-mount", { tier, handles: b.handles });
      await scenario(page, "tier-unmount");
      const before = await heapUsed(page);
      await scenario(page, "tier-mount", { tier, handles: b.handles });
      const after = await heapUsed(page);
      const retainedBytes = after - before;

      const cpu = await scenario<TierCpuResult>(page, "tier-cpu", { frames: PRD08_TIER_CPU_FRAMES });
      await scenario(page, "tier-unmount");

      const gpuOff = await scenario<TierGpuResult>(page, "tier-gpu", { tier, frames: PRD08_TIER_GPU_FRAMES, lane: false });
      const gpuOn = await scenario<TierGpuResult>(page, "tier-gpu", { tier, frames: PRD08_TIER_GPU_FRAMES, lane: true });
      // Net-frame: 2-substep ticks, this page (one submission per tick) vs a
      // renderPerSubstep page.
      const netOne = await scenario<TierGpuResult>(page, "tier-gpu", { tier, frames: PRD08_TIER_GPU_FRAMES, lane: false, dtMs: 1000 / 30 });
      const legacyPage = await browser.newPage();
      let netPerSubstep: TierGpuResult;
      try {
        await openHarness(legacyPage, server.origin, "?scripted=1&scene=tier&maxSubSteps=4&renderPerSubstep=1");
        netPerSubstep = await scenario<TierGpuResult>(legacyPage, "tier-gpu", { tier, frames: PRD08_TIER_GPU_FRAMES, lane: false, dtMs: 1000 / 30 });
      } finally {
        await legacyPage.close();
      }

      const summary = {
        tier,
        budget: b,
        cpu: { medianMs: median(cpu.cpuMs), p95Ms: percentile(cpu.cpuMs, 0.95), frames: cpu.frames },
        memory: { method: "CDP HeapProfiler.collectGarbage x2 + Runtime.getHeapUsage.usedSize delta", before, after, retainedBytes },
        gpu: {
          onMedianMs: median(gpuOn.gpuMs),
          offMedianMs: median(gpuOff.gpuMs),
          deltaMs: median(gpuOn.gpuMs) - median(gpuOff.gpuMs),
          disjoint: gpuOn.disjoint + gpuOff.disjoint,
          fadedItems: gpuOn.fadedItems
        },
        netFrame: { oneSubmissionMedianMs: median(netOne.gpuMs), perSubstepMedianMs: median(netPerSubstep.gpuMs) },
        casts: {
          maxSphereCasts: Math.max(...cpu.casts.map((c) => c.sphereCasts)),
          maxOccluderQueries: Math.max(...cpu.casts.map((c) => c.occluderQueries)),
          demand: cpu.castDemand
        },
        handles: cpu.handles
      };
      // Write before asserting so a failing tier still leaves its numbers.
      writeEvidence("tier-budgets", `${tier}.json`, { ...summary, raw: { cpuMs: cpu.cpuMs, gpuOn: gpuOn.gpuMs, gpuOff: gpuOff.gpuMs } });
      rows.push(
        [
          tier,
          summary.cpu.medianMs.toFixed(4),
          summary.cpu.p95Ms.toFixed(4),
          b.cpuMs,
          summary.gpu.onMedianMs.toFixed(4),
          summary.gpu.offMedianMs.toFixed(4),
          summary.gpu.deltaMs.toFixed(4),
          b.gpuMs,
          retainedBytes,
          b.memoryBytes,
          summary.casts.maxSphereCasts,
          b.sphereCasts,
          summary.casts.maxOccluderQueries,
          cpu.handles,
          summary.netFrame.oneSubmissionMedianMs.toFixed(4),
          summary.netFrame.perSubstepMedianMs.toFixed(4)
        ].join(",")
      );

      checkTierGating(pwExpect, tier, cpu);
      checkTierCpu(pwExpect, tier, cpu);
      checkTierMemory(pwExpect, tier, retainedBytes);
      checkTierGpu(pwExpect, tier, gpuOn, gpuOff);
      checkNetFrameGpu(pwExpect, netOne, netPerSubstep);
    });
  }
});
