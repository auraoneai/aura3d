import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering showcase v1", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the canonical scene with renderer-owned shadows and postprocess", async ({ page }) => {
    await page.goto(`${server.origin}/examples/rendering-showcase-v1/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.__G3D_RENDERING_SHOWCASE_V1__?.status)).toBe("ready");
    const state = await page.evaluate(() => window.__G3D_RENDERING_SHOWCASE_V1__);
    const screenshot = "tests/reports/rendering-showcase-v1/rendering-showcase.png";
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.locator("[data-testid='rendering-showcase-v1-canvas']").screenshot({ path: screenshot });
    expect(statSync(screenshot).size).toBeGreaterThan(10_000);
    expect(state?.shadowEnabled).toBe(true);
    expect(state?.postprocessEnabled).toBe(true);
    expect((state?.diagnostics as { drawCalls?: number; lastError?: string | null } | undefined)?.lastError).toBeNull();
    expect((state?.diagnostics as { drawCalls?: number } | undefined)?.drawCalls).toBeGreaterThan(40);
  });
});
