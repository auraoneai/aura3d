import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART U1 browser soak (muse3jsparity-PRD): 50 route mount/step/dispose
 * cycles with GC-disciplined heap readings (CDP HeapProfiler.collectGarbage
 * before every reading, never raw usedJSHeapSize), plus a 50-cycle real-GL
 * registry soak proving every target returns to zero with bytes + lane owner.
 *
 * Heap gate (calibrated 2026-09-04, three measured runs on this machine):
 * 5 warmup cycles are discarded (JIT + first-mount caches are retention, not
 * leaks). Across the 45 measured cycles every GC-disciplined chunk end must
 * land within 4 MiB of the post-warmup baseline (observed chunk-end noise
 * peaks at 2.75 MiB on a ~22 MiB heap; a real per-cycle leak of full
 * production mounts retains ~90+ KiB/cycle and trips the bound by cycle 45),
 * and the post-run GC heap must return within 2 MiB of baseline (full
 * reclamation — the strongest no-leak signal).
 */
test.describe("U1 resource soak", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("50 cycles leave the heap flat and the GPU registry empty", async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${server.origin}/tests/browser/resource-soak-u1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_RESOURCE_SOAK_U1__?.status === "ready", undefined, {
      timeout: 60_000
    });

    const cdp = await page.context().newCDPSession(page);
    const collectGarbage = async (): Promise<void> => {
      try {
        await cdp.send("HeapProfiler.enable");
        await cdp.send("HeapProfiler.collectGarbage");
      } catch {
        // CDP GC is best-effort; the readings below still compare like with like.
      }
    };
    const readHeap = (): Promise<number | null> => page.evaluate(() => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
    });
    // Number of collect-and-read passes per measurement. The settling curve below
    // reaches its floor by the fifth pass at both measurement points; this leaves
    // margin without making the seven readings in this test expensive.
    const HEAP_SETTLE_PASSES = 16;
    /**
     * `usedJSHeapSize` must be read at its settled floor. Measured on this machine
     * by sampling one instant twelve times with no work in between:
     *
     *   baseline point: 23295523, then 19682819 repeating
     *   chunk-4 point:  30147932, 30147932, 30147932, 30147932, then 20074715 repeating
     *
     * V8 needs a variable number of collections to finish reclaiming and repeats the
     * same unsettled value several times first. So "collect once" is a sample of an
     * unsettled quantity, and "collect until two readings agree" latches that
     * repeated unsettled value instead of the floor. Taking the minimum across
     * enough passes reaches the floor at every measurement point symmetrically.
     *
     * At the floor the real 45-cycle drift is 0.374 MiB (about 8.7 KiB/cycle)
     * against the 4 MiB budget. The unsettled reading fabricated roughly 10 MiB of
     * drift and placed the maximum on the FIRST chunk, after which it fell — the
     * opposite shape of a leak, which accumulates toward the last chunk.
     *
     * The 4 MiB bound is unchanged and deliberately not relaxed: genuine per-cycle
     * retention raises the settled floor of every later chunk and still trips it.
     */
    const gcHeap = async (): Promise<number | null> => {
      let floor: number | null = null;
      for (let pass = 0; pass < HEAP_SETTLE_PASSES; pass += 1) {
        await collectGarbage();
        const reading = await readHeap();
        if (reading === null) return null;
        floor = floor === null ? reading : Math.min(floor, reading);
      }
      return floor;
    };
    const runRouteCycles = (cycles: number): Promise<{ cycles: { cycle: number; drawCalls: number }[] }> =>
      page.evaluate((count) => (() => { const runner = window.__AURA3D_RESOURCE_SOAK_U1__; if (!runner) throw new Error("Missing soak runner"); return runner.runRouteCycles(count); })(), cycles);

    // Warmup (discarded): first mounts pay JIT + cache costs that GC keeps.
    const warmup = await runRouteCycles(5);
    expect(warmup.cycles).toHaveLength(5);

    // Measured route soak: 5 chunks x 9 = 45 cycles, GC-disciplined heap at both ends of every chunk.
    const heapEnds: number[] = [];
    const heapBaseline = await gcHeap();
    expect(heapBaseline, "performance.memory is required for the heap gate").not.toBeNull();
    let measuredCycles = 0;
    for (let chunk = 0; chunk < 5; chunk += 1) {
      const out = await runRouteCycles(9);
      expect(out.cycles).toHaveLength(9);
      for (const cycle of out.cycles) {
        expect(cycle.drawCalls, `cycle ${cycle.cycle} must draw`).toBeGreaterThan(0);
      }
      measuredCycles += out.cycles.length;
      const heap = await gcHeap();
      expect(heap, "performance.memory is required for the heap gate").not.toBeNull();
      heapEnds.push(heap as number);
    }
    expect(measuredCycles).toBe(45);

    const baseline = heapBaseline as number;
    const maxDrift = Math.max(...heapEnds.map((heap) => heap - baseline));
    expect(maxDrift, `heap drift ${maxDrift} bytes across 45 measured cycles exceeds the 4 MiB flat budget`).toBeLessThanOrEqual(
      4 * 1024 * 1024
    );

    // Real-GL registry soak: 2 live targets mid-cycle with exact bytes, zero after every cycle.
    const registry = (await page.evaluate(() => (() => { const runner = window.__AURA3D_RESOURCE_SOAK_U1__; if (!runner) throw new Error("Missing soak runner"); return runner.runRegistry(50); })())) as {
      registry: { cycle: number; liveRenderTargets: number; gpuTargetCount: number; gpuTargetBytes: number; owners: string[] }[];
      registryFinal: { renderTargets: number; gpuTargetCount: number; gpuTargetBytes: number; disposedRenderTargets: number } | null;
      ownersSeen: string[];
      shadowBytesSeen: number;
      mirrorBytesSeen: number;
    };
    expect(registry.registry).toHaveLength(50);
    for (const entry of registry.registry) {
      expect(entry.liveRenderTargets, `cycle ${entry.cycle} live targets`).toBe(2);
      expect(entry.gpuTargetCount, `cycle ${entry.cycle} inventory count`).toBe(2);
      expect(entry.gpuTargetBytes, `cycle ${entry.cycle} inventory bytes`).toBe(32768 + 16384);
      expect(entry.owners, `cycle ${entry.cycle} owners`).toEqual(expect.arrayContaining(["b1-shadow", "b4-reflection"]));
    }
    expect(registry.ownersSeen).toEqual(expect.arrayContaining(["b1-shadow", "b4-reflection"]));
    expect(registry.shadowBytesSeen).toBe(32768);
    expect(registry.mirrorBytesSeen).toBe(16384);
    expect(registry.registryFinal, "registry must end empty").toMatchObject({
      renderTargets: 0,
      gpuTargetCount: 0,
      gpuTargetBytes: 0,
      disposedRenderTargets: 100
    });

    const heapFinal = await gcHeap();
    expect(heapFinal, "performance.memory is required for the heap gate").not.toBeNull();
    const reclaimDrift = (heapFinal as number) - baseline;
    expect(
      reclaimDrift,
      `post-run heap ${reclaimDrift} bytes over baseline: allocations were not reclaimed`
    ).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(errors.join("\n"), "soak harness must run without page errors").toBe("");

    mkdirSync(resolve("tests/reports/muse3jsparity"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/muse3jsparity/resource-soak-u1.json"),
      `${JSON.stringify(
        {
          schema: "a3d-resource-soak-u1",
          generatedAt: new Date().toISOString(),
          pass: true,
          warmupCycles: 5,
          measuredRouteCycles: measuredCycles,
          registryCycles: 50,
          heapBaseline,
          heapChunkEnds: heapEnds,
          heapMaxDriftBytes: maxDrift,
          heapFinal,
          heapReclaimDriftBytes: reclaimDrift,
          registryFinal: registry.registryFinal,
          ownersSeen: registry.ownersSeen,
          shadowBytesSeen: registry.shadowBytesSeen,
          mirrorBytesSeen: registry.mirrorBytesSeen
        },
        null,
        2
      )}\n`
    );
  });
});
