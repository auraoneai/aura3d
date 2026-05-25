import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("asset viewer v1", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the loaded asset as the dominant viewport subject", async ({ page }) => {
    await page.goto(`${server.origin}/examples/legacy-asset-viewer/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.__G3D_ASSET_VIEWER_V1__?.status)).toBe("ready");
    const state = await page.evaluate(() => window.__G3D_ASSET_VIEWER_V1__);
    const screenshot = "tests/reports/legacy-asset-viewer/asset-viewer.png";
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.locator("[data-testid='legacy-asset-viewer-canvas']").screenshot({ path: screenshot });
    expect(statSync(screenshot).size).toBeGreaterThan(10_000);
    expect(state?.setupLineCount).toBeLessThanOrEqual(30);
    expect((state?.diagnostics as { drawCalls?: number; lastError?: string | null } | undefined)?.lastError).toBeNull();
    expect((state?.diagnostics as { drawCalls?: number } | undefined)?.drawCalls).toBeGreaterThan(40);
  });
});
