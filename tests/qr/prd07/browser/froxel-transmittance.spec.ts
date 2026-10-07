// PRD-07 P5-T6 — §8.7 froxel transmittance: uniform σ = 0.05 with no light
// gives pure extinction; the integrate atlas at the tile whose far edge is
// ~20m must hold T ≈ exp(−1) within ±3% (energy-conserving prefix sum) and
// S ≈ 0. Also surfaces the R10 reduced-grid note when present.
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_FROXEL__?: {
      readonly status: "ready" | "error";
      readonly slice?: number;
      readonly zAtSlice?: number;
      readonly transmittance?: number;
      readonly expected?: number;
      readonly scatter?: readonly [number, number, number];
      readonly note?: string;
      readonly reduced?: boolean;
      readonly error?: string;
    };
  }
}

test.describe("prd07 froxel transmittance", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("σ=0.05 no-light: T ≈ exp(−1) at ~20m within ±3%, S ≈ 0", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/froxel-transmittance-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__QR_PRD07_FROXEL__?.status === "ready" || window.__QR_PRD07_FROXEL__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_FROXEL__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.zAtSlice ?? 0).toBeGreaterThan(18);
    expect(result?.zAtSlice ?? 100).toBeLessThan(23);
    const t = result?.transmittance ?? -1;
    const expected = result?.expected ?? Math.exp(-1);
    expect(Math.abs(t - expected) / expected, `T=${t} vs exp(-1)`).toBeLessThanOrEqual(0.03);
    for (const c of result?.scatter ?? [1, 1, 1]) {
      expect(Math.abs(c), "no light → no inscatter").toBeLessThan(1e-3);
    }
    // Medium grid never reports the Ultra-only reduction note.
    expect(result?.reduced).toBe(false);
  });

  test("forced low-memory Ultra grid: 240×135×96 + VOLUMETRIC_GRID_REDUCED", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/froxel-transmittance-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__QR_PRD07_FROXEL__?.status === "ready" || window.__QR_PRD07_FROXEL__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_FROXEL__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.reducedSlices).toBe(96);
    expect(result?.reducedNote).toBe("VOLUMETRIC_GRID_REDUCED");
  });
});
