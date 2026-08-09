import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("product viewer legacy", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a clean SDK-backed product viewer screenshot", async ({ page }) => {
    await page.goto(`${server.origin}/examples/legacy-product-viewer/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.__A3D_PRODUCT_VIEWER_LEGACY__?.status)).toBe("ready");
    const state = await page.evaluate(() => window.__A3D_PRODUCT_VIEWER_LEGACY__);
    const screenshot = "tests/reports/legacy-product-viewer/product-viewer.png";
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.locator("[data-testid='legacy-product-viewer-canvas']").screenshot({ path: screenshot });
    expect(statSync(screenshot).size).toBeGreaterThan(10_000);
    expect(state?.setupLineCount).toBeLessThanOrEqual(30);
    expect(state?.features).toEqual(expect.arrayContaining(["pbr-materials", "textured-materials", "directional-shadow", "hdr-render-target"]));
    expect((state?.diagnostics as { drawCalls?: number; lastError?: string | null } | undefined)?.lastError).toBeNull();
    expect((state?.diagnostics as { drawCalls?: number } | undefined)?.drawCalls).toBeGreaterThan(40);
  });
});
