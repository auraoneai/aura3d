// PRD-06 §16 I-row — `skinned-shadow-onscreen` (T0.14).
// Runs in the lane workflow and reports its on-screen shadow-mask metrics
// (luma(on) < 0.9 × luma(off) per §16). The IoU ≥ 0.85 vs three r185 gate is
// §17.1 integrated acceptance only — it needs C-11 real (the lighting lane's
// DepthPass composing the registered `prd06.deform` depth feature plus the
// three-side comparator), so this spec asserts the harness produced a
// measurement and attaches the report; it must not gate the lane.
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

interface ShadowMaskMetrics {
  readonly maskPixels: number;
  readonly areaFraction: number;
  readonly centroid: readonly [number, number];
  readonly meanLumaDeltaInside: number;
}

interface ShadowOnscreenReport {
  readonly done?: boolean;
  readonly error?: string;
  readonly stack?: string;
  readonly flags?: unknown;
  readonly rendered?: { readonly drawCalls: number; readonly backend: string };
  readonly shadowMask?: ShadowMaskMetrics;
  readonly iou?: number | null;
  readonly dependency?: string;
  readonly gating?: string;
}

declare global {
  interface Window { __AURA3D_QR_SKINNED_SHADOW_ONSCREEN__?: ShadowOnscreenReport }
}

test.describe("PRD-06 skinned shadow on-screen (reported, C-11 pending)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("measures the on-screen shadow mask under flag-on and reports it for §17.1", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/qr/prd06/browser/skinned-shadow-onscreen-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const result = window.__AURA3D_QR_SKINNED_SHADOW_ONSCREEN__;
        return result?.done === true || result?.error !== undefined;
      },
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_QR_SKINNED_SHADOW_ONSCREEN__);
    await testInfo.attach("skinned-shadow-onscreen-metrics", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    expect(result?.error, result?.error).toBeUndefined();
    expect(result?.done).toBe(true);
    expect(pageErrors).toEqual([]);

    // The report contract: a real mask measurement ran (draw calls issued),
    // metrics are finite, and the §17.1 gate is honestly marked pending C-11.
    expect(result?.rendered?.drawCalls, "no draw calls — the render was vacuous").toBeGreaterThan(0);
    const mask = result?.shadowMask;
    expect(mask).toBeDefined();
    expect(Number.isFinite(mask!.maskPixels)).toBe(true);
    expect(mask!.areaFraction).toBeGreaterThanOrEqual(0);
    expect(mask!.areaFraction).toBeLessThanOrEqual(1);
    expect(Number.isFinite(mask!.meanLumaDeltaInside)).toBe(true);
    expect(result?.iou, "IoU vs three r185 must stay unasserted until C-11").toBeNull();
    expect(result?.dependency).toContain("C-11");
  });
});
