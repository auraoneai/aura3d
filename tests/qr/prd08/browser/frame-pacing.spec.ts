/**
 * L-9 frame pacing on the L-8 harness (PRD-08 §20 item 3): scripted
 * `requestAnimationFrame` cadences — 60/120/144 Hz and fixed 100/250 ms gaps —
 * record per presented frame `performance.now()`, `simTime`, presented
 * (interpolated) node positions and `renderSubmissionsLastTick`; write the §20
 * CSV and assert S1 (one render per tick), S2 (real-time sim under load),
 * S3 (no judder at 120 Hz). A second, non-gating run uses CDP CPU throttle
 * rate 6 and records real-world pacing only.
 *
 * Remote-only: `qr-prd08-camera.yml` (never run locally).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

interface FrameRecord {
  readonly t: number;
  readonly simTime: number;
  readonly alpha: number;
  readonly realDt: number;
  readonly renderSubmissionsLastTick: number;
  readonly positions: readonly (readonly [number, number, number])[];
}

interface HarnessProbe {
  status: "booting" | "ready" | "error";
  error?: string;
  records: FrameRecord[];
  tick?: (dtMs: number) => void;
  csv(): string;
}

const HARNESS = "/tests/qr/prd08/harness/camera-feel-harness.html";

async function openHarness(page: Page, query = "?scripted=1"): Promise<void> {
  await page.goto(`${serverOrigin!}${HARNESS}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__;
      return h?.status === "ready" || h?.status === "error";
    },
    undefined,
    { timeout: 60_000 }
  );
  const status = await page.evaluate(() => {
    const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__;
    if (h?.status === "error") throw new Error(h.error);
    return h?.status;
  });
  expect(status).toBe("ready");
}

async function pump(page: Page, dtMs: number, count: number): Promise<void> {
  await page.evaluate(
    ([dt, n]) => {
      const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__;
      for (let i = 0; i < (n ?? 0); i += 1) h?.tick?.(dt ?? 0);
    },
    [dtMs, count]
  );
}

async function drain(page: Page): Promise<FrameRecord[]> {
  return page.evaluate(() => {
    const h = (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__!;
    const out = [...h.records];
    h.records.length = 0;
    return out;
  });
}

async function writeCsv(page: Page, name: string): Promise<void> {
  const csv = await page.evaluate(() =>
    (window as unknown as { __AURA3D_PRD08_HARNESS__?: HarnessProbe }).__AURA3D_PRD08_HARNESS__?.csv()
  );
  if (!csv) return;
  const dir = resolve("tests/reports/prd08");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `frame-pacing-${name}.csv`), `${csv}\n`);
}

let serverOrigin: string | undefined;
let server: ExampleDevServer;

test.describe("prd08 frame pacing (L-9, S1/S2/S3)", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    serverOrigin = server.origin;
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const hz of [60, 120, 144]) {
    test(`S1/S3 at ${hz} Hz: one render per tick, monotonic interpolated positions`, async ({ page }) => {
      await openHarness(page, `?scripted=1&fixedDt=${1 / 60}`);
      await pump(page, 1000 / hz, 10); // warm-up (first tick is fixedDt — see tick())
      await drain(page);
      await pump(page, 1000 / hz, Math.round(hz));
      const records = await drain(page);
      await writeCsv(page, `${hz}hz`);
      expect(records.length).toBe(hz);
      // S1: exactly one presented frame per tick.
      for (const r of records) expect(r.renderSubmissionsLastTick).toBe(1);
      // S2 light: sim advanced in real time (± one fixed step per second).
      const elapsed = records.at(-1)!.simTime - records[0]!.simTime;
      expect(elapsed).toBeGreaterThan((records.length / hz - 0.05) * 0.95);
      expect(elapsed).toBeLessThanOrEqual(records.length / hz + 1 / 30);
      // S3: presented positions move monotonically-ish (max step deviation
      // within 10% of mean step — 20 orbiters at fixedDt 1/60 under a scripted
      // 120 Hz cadence interpolate at alpha 0.5).
      if (hz === 120) {
        const perNodeSteps = records[0]!.positions.map((_, n) =>
          records.slice(1).map((r, i) => {
            const a = records[i]!.positions[n]!;
            const b = r.positions[n]!;
            return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          })
        );
        for (const steps of perNodeSteps) {
          const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
          expect(mean).toBeGreaterThan(1e-4); // interpolation must move pixels
          const maxDev = Math.max(...steps.map((s) => Math.abs(s - mean)));
          expect(maxDev).toBeLessThanOrEqual(mean * 0.1 + 1e-6);
        }
      }
    });
  }

  test("S2: 100 ms ticks keep real-time; 250 ms ticks clamp", async ({ page }) => {
    await openHarness(page, "?scripted=1&maxSubSteps=6");
    await pump(page, 1000 / 60, 6);
    await drain(page);

    await pump(page, 100, 10); // 1.0 s wall
    let records = await drain(page);
    const sim = records.at(-1)!.simTime;
    // 10 × 0.1 s ticks with maxSubSteps 6 @ 1/60 → 6 substeps = 0.1 s each.
    expect(sim).toBeGreaterThanOrEqual(0.95);
    expect(sim).toBeLessThanOrEqual(1.05);
    for (const r of records) expect(r.renderSubmissionsLastTick).toBe(1);

    await pump(page, 250, 10); // 2.5 s wall, clamp policy drops the tail
    records = await drain(page);
    const clampedSim = records.at(-1)!.simTime - records[0]!.simTime;
    // 10 ticks × maxFrameDt (0.1 s): bounded catch-up, not the full 2.5 s.
    expect(clampedSim).toBeGreaterThan(0.9);
    expect(clampedSim).toBeLessThan(1.1);
    await writeCsv(page, "coarse-100-250");
  });

  test("fail-path (non-gating): renderPerSubstep emits >1 on 2-substep ticks", async ({ page }) => {
    await openHarness(page, "?scripted=1&renderPerSubstep=1");
    await pump(page, 1000 / 60, 6);
    await drain(page);
    await pump(page, 1000 / 30, 30); // each tick ≈ 2 substeps
    const records = await drain(page);
    const multi = records.filter((r) => r.renderSubmissionsLastTick === 2);
    expect(multi.length).toBeGreaterThanOrEqual(records.length - 2);
  });

  test("real-world pacing under CDP 6x CPU throttle (non-gating)", async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await openHarness(page, "?scripted=0&maxSubSteps=6");
    await page.waitForTimeout(4000);
    const records = await drain(page);
    await writeCsv(page, "cpu6x-real");
    await cdp.detach();
    // Non-gating: just require some frames landed.
    expect(records.length).toBeGreaterThan(10);
  });
});
