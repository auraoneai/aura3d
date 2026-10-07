import { test, expect } from "@playwright/test";

// PRD-01 §15 Phase-2 render targets (CONTRACTS §3.4): a depth-only cube target
// renders 6 faces; a 2-attachment target receives distinct clears; a
// sampler2DArray program samples layer 3. Device-level checks run in the page
// via ?tools=render-targets and report on window.__QR_RT__.

interface RenderTargetToolReport {
  readonly cubeDepthFaces: number;
  readonly cubeDepthWritable: boolean;
  readonly mrtAttachment0: readonly number[];
  readonly mrtAttachment1: readonly number[];
  readonly arrayLayer3: readonly number[];
  readonly errors: readonly string[];
}

test("render-target feature fields work on WebGL2Device", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/?tools=render-targets", { waitUntil: "load" });
  await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, {
    timeout: 60_000
  });
  const qrError = await page.evaluate(() => window.__QR_ERROR__);
  expect(qrError).toBeUndefined();

  const report = (await page.evaluate(() => (window as unknown as { __QR_RT__?: RenderTargetToolReport }).__QR_RT__))!;
  expect(report.errors).toEqual([]);

  // Depth-only cube: six renderable layer targets.
  expect(report.cubeDepthFaces).toBe(6);
  expect(report.cubeDepthWritable).toBe(true);

  // MRT: attachment 0 cleared red, attachment 1 cleared green.
  expect(report.mrtAttachment0.slice(0, 3)).toEqual([255, 0, 0]);
  expect(report.mrtAttachment1.slice(0, 3)).toEqual([0, 255, 0]);

  // sampler2DArray: layer 3 of a 4-layer array is yellow (1,1,0).
  expect(report.arrayLayer3.slice(0, 3)).toEqual([255, 255, 0]);

  expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
});
