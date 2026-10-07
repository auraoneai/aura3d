// PRD-07 P6-T3 — surface trails drawn by the decal pass with polygon offset:
// two identical frames of a trail coplanar with the ground at 50 m must agree
// to ≤ 1/255 per pixel (z-fighting would show per-pixel alternation).
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __QR_PRD07_DECAL_TRAIL__?: {
      readonly status: "ready" | "error";
      readonly maxDiff?: number;
      readonly markCoverage?: number;
      readonly error?: string;
    };
  }
}

test.describe("prd07 decal surface trail", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("no z-fighting on a plane at 50m (consecutive frames ≤ 1/255)", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd07/browser/decal-surface-trail-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__QR_PRD07_DECAL_TRAIL__?.status === "ready" || window.__QR_PRD07_DECAL_TRAIL__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );
    const result = await page.evaluate(() => window.__QR_PRD07_DECAL_TRAIL__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.markCoverage ?? 0, "trail must cover pixels").toBeGreaterThan(0);
    expect(result?.maxDiff ?? 255, "frame-to-frame z-fighting flicker").toBeLessThanOrEqual(1);
  });
});
