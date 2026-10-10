/**
 * L-9 frame pacing on the L-8 harness (PRD-08 §20 item 3, S1/S2/S3): scripted
 * `requestAnimationFrame` cadences — 60/120/144 Hz and fixed 100/250 ms gaps —
 * record per presented frame `performance.now()`, `simTime`, presented
 * (interpolated) node positions and `renderSubmissionsLastTick`; write the §20
 * CSV and assert S1 (one render per tick), S2 (real-time sim under load),
 * S3 (no judder at 120 Hz) plus their controls. A second, non-gating run uses
 * CDP CPU throttle rate 6 and records real-world pacing only.
 *
 * Headless mirror: tests/qr/prd08/unit/harness-pipeline.test.ts.
 * Remote-only: `qr-prd08-camera.yml` browser-gpu (never run locally).
 */
import { expect, test } from "@playwright/test";
import { startPrd08DevServer, type ExampleDevServer } from "../dev-server";
import { drain, openHarness, pump, writeFrameCsv, type FrameRecord } from "./harness-page";

let server: ExampleDevServer;

const stepLengths = (records: readonly FrameRecord[], node: number) =>
  records.slice(1).map((r, i) => {
    const a = records[i]!.positions[node]!;
    const b = r.positions[node]!;
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  });
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

test.describe("prd08 frame pacing (L-9, S1/S2/S3)", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    server = await startPrd08DevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const hz of [60, 120, 144]) {
    test(`S1/S3 at ${hz} Hz: one render per tick, monotonic interpolated positions`, async ({ page }) => {
      await openHarness(page, server.origin, `?scripted=1&fixedDt=${1 / 60}`);
      await pump(page, 1000 / hz, 10); // warm-up (first loop tick is fixedDt)
      await drain(page);
      await pump(page, 1000 / hz, hz);
      const records = await drain(page);
      writeFrameCsv(`${hz}hz`, records);
      expect(records.length).toBe(hz);
      // S1: exactly one presented frame per tick.
      for (const r of records) expect(r.renderSubmissionsLastTick).toBe(1);
      // S2 light: sim advanced in real time (± one fixed step per second).
      const elapsed = records.at(-1)!.simTime - records[0]!.simTime;
      expect(elapsed).toBeGreaterThan((records.length / hz - 0.05) * 0.95);
      expect(elapsed).toBeLessThanOrEqual(records.length / hz + 1 / 30);
      // S3: 20 bodies at fixedDt 1/60 under a scripted 120 Hz cadence —
      // presented step lengths stay within 10 % of their mean (no 2:1).
      if (hz === 120) {
        for (let n = 0; n < records[0]!.positions.length; n += 1) {
          const steps = stepLengths(records, n);
          const m = mean(steps);
          expect(m).toBeGreaterThan(1e-4); // interpolation must move the bodies
          expect(Math.max(...steps.map((s) => Math.abs(s - m)))).toBeLessThanOrEqual(m * 0.1 + 1e-6);
        }
      }
    });
  }

  test("S3 control: interpolation off shows the 2:1 pattern at 120 Hz", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&interpolation=0");
    await pump(page, 1000 / 120, 10);
    await drain(page);
    await pump(page, 1000 / 120, 120);
    const records = await drain(page);
    writeFrameCsv("120hz-interpolation-off", records);
    const steps = stepLengths(records, 0);
    const m = mean(steps);
    expect(Math.max(...steps.map((s) => Math.abs(s - m)))).toBeGreaterThan(m * 0.5);
  });

  test("S2: 100 ms ticks keep real-time; 250 ms ticks clamp", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&maxSubSteps=6");
    await pump(page, 1000 / 60, 6);
    const base = (await drain(page)).at(-1)!.simTime;

    await pump(page, 100, 10); // 1.0 s wall
    const coarse = await drain(page);
    // 10 × 0.1 s ticks with maxSubSteps 6 @ 1/60 → 6 substeps = 0.1 s each.
    const sim = coarse.at(-1)!.simTime - base;
    expect(sim).toBeGreaterThanOrEqual(0.95);
    expect(sim).toBeLessThanOrEqual(1.05);
    for (const r of coarse) expect(r.renderSubmissionsLastTick).toBe(1);

    await pump(page, 250, 10); // 2.5 s wall, clamp policy drops the tail
    const clamped = await drain(page);
    writeFrameCsv("coarse-100-250", [...coarse, ...clamped]);
    const clampedSim = clamped.at(-1)!.simTime - coarse.at(-1)!.simTime;
    // 10 ticks × maxFrameDt (0.1 s): bounded catch-up, not the full 2.5 s.
    expect(clampedSim).toBeGreaterThan(0.9);
    expect(clampedSim).toBeLessThan(1.1);
    const clampedFrames = await page.evaluate(
      () =>
        (window as unknown as { __AURA3D_PRD08_HARNESS__: { driver: { snapshot(): { clampedFrames: number } } } }).__AURA3D_PRD08_HARNESS__.driver.snapshot()
          .clampedFrames
    );
    expect(clampedFrames).toBeGreaterThanOrEqual(10); // +1 per 250 ms tick
  });

  test("S1 control: renderPerSubstep emits 2 on 2-substep ticks", async ({ page }) => {
    await openHarness(page, server.origin, "?scripted=1&renderPerSubstep=1");
    await pump(page, 1000 / 60, 6);
    await drain(page);
    await pump(page, 1000 / 30, 30); // each tick ≈ 2 substeps
    const records = await drain(page);
    const multi = records.filter((r) => r.renderSubmissionsLastTick === 2);
    expect(multi.length).toBeGreaterThanOrEqual(records.length - 2);
  });

  test("real-world pacing under CDP 6x CPU throttle (evidence only)", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await openHarness(page, server.origin, "?scripted=0&maxSubSteps=6");
    await page.waitForTimeout(4000);
    const records = await drain(page);
    writeFrameCsv("cpu6x-real", records);
    await cdp.detach();
    // Evidence run: real rAF must have presented frames, one render each.
    expect(records.length).toBeGreaterThan(10);
    for (const r of records) expect(r.renderSubmissionsLastTick).toBe(1);
  });
});
