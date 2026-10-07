import { test, expect } from "@playwright/test";

// PRD-01 §15 Phase-2 canvas-DPR policy: at deviceScaleFactor 2 with no
// explicit pixelRatio, `resolveCanvasPixelRatio` resolves min(2, High.maxPixelRatio=2)
// through `Renderer.resizeToDisplay` → canvas backing is exactly 2× the CSS box.

interface CanvasDprReport {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly devicePixelRatio: number;
  readonly reportedPixelRatio: number;
  readonly errors: readonly string[];
}

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test("resolveCanvasPixelRatio sizes backing = 2× CSS at deviceScaleFactor 2 (High tier)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/?tools=canvas-dpr", { waitUntil: "load" });
  await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, {
    timeout: 60_000
  });
  const qrError = await page.evaluate(() => window.__QR_ERROR__);
  expect(qrError).toBeUndefined();

  const report = (await page.evaluate(() => (window as unknown as { __QR_DPR__?: CanvasDprReport }).__QR_DPR__))!;
  expect(report.errors).toEqual([]);
  expect(report.devicePixelRatio).toBe(2);
  expect(report.backingWidth).toBe(report.cssWidth * 2);
  expect(report.backingHeight).toBe(report.cssHeight * 2);
  expect(report.reportedPixelRatio).toBe(2);
  expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
