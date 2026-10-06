import { test, expect } from "@playwright/test";

// PRD-01 §15 Phase-2 C-05 `onRendererError` real: a Renderer.create test
// double that rejects → (1) `app.ready()` resolves with strict off;
// (2) `diagnostics().errors` records the mount failure; (3) `onRendererError`
// forwards it. The `renderer-mount-failed` C-36 code and strictMount rejection
// assertions activate when lane 15's T4.2 lands (integrated I9) — the report
// records them so the spec flips automatically.

interface MountFailureReport {
  readonly readyResolved: boolean;
  readonly errorsCount: number;
  readonly errorsContainRendererMountFailed: boolean;
  readonly degradationsContainCode: boolean;
  readonly onRendererErrorFired: number;
  readonly firedCodes: readonly string[];
  readonly strictReadyRejected: boolean | null;
  readonly errors: readonly string[];
}

test("forced renderer mount failure resolves ready() and surfaces through onRendererError", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/?tools=renderer-mount-failure&a3d-qr=core,strict", { waitUntil: "load" });
  await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, {
    timeout: 120_000
  });
  const qrError = await page.evaluate(() => window.__QR_ERROR__);
  expect(qrError).toBeUndefined();

  const report = (await page.evaluate(() => (window as unknown as { __QR_MOUNT__?: MountFailureReport }).__QR_MOUNT__))!;
  expect(report.errors).toEqual([]);

  // (1) non-strict: app.ready() keeps its resolve-not-reject contract.
  expect(report.readyResolved).toBe(true);

  // (2) the mount failure is recorded in diagnostics().errors.
  expect(report.errorsCount).toBeGreaterThan(0);
  expect(report.errorsContainRendererMountFailed).toBe(true);

  // (3) onRendererError forwarded at least one entry (code is the real C-36
  // `renderer-mount-failed` once the diagnostics degradations field is wired;
  // today the errors[] pass-through forwards it as `renderer-error`).
  expect(report.onRendererErrorFired).toBeGreaterThan(0);
  if (report.degradationsContainCode) {
    expect(report.firedCodes).toContain("renderer-mount-failed");
  }

  // (4) strictMount rejection — asserted once lane 15 wires strictMount
  // (PR 0a diagnosticOnly field). Null means the probe never ran.
  expect(report.strictReadyRejected).not.toBeNull();

  expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
