import { test, expect } from "@playwright/test";

// PRD-01 §15 Phase-2 C-05: `app.capture()` renders a frame and readPixels the
// default framebuffer in the same task — it matches `canvas.toDataURL()` with
// preserveDrawingBuffer: true (MAD ≤ 1/255) and keeps working with it off.
// The harness compares same-task reads of a freshly stepped frame either way.

interface AppCaptureReport {
  readonly captureMime: string;
  readonly captureWidth: number;
  readonly captureHeight: number;
  readonly toDataUrlWidth: number;
  readonly toDataUrlHeight: number;
  readonly mad: number;
  readonly maxDiff: number;
  readonly captureNonBlank: boolean;
  readonly errors: readonly string[];
}

for (const flags of ["none", "core"]) {
  test(`app.capture() equals canvas.toDataURL() (a3d-qr=${flags})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`/?tools=app-capture&a3d-qr=${flags}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, {
      timeout: 120_000
    });
    const qrError = await page.evaluate(() => window.__QR_ERROR__);
    expect(qrError).toBeUndefined();

    const report = (await page.evaluate(() => (window as unknown as { __QR_CAPTURE__?: AppCaptureReport }).__QR_CAPTURE__))!;
    expect(report.errors).toEqual([]);

    // Same dimensions, real pixels, and parity with the toDataURL baseline.
    expect(report.captureWidth).toBe(report.toDataUrlWidth);
    expect(report.captureHeight).toBe(report.toDataUrlHeight);
    expect(report.captureNonBlank).toBe(true);
    expect(report.mad).toBeLessThanOrEqual(1);
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
}
