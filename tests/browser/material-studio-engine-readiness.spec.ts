import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("material studio v1", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders visibly distinct material presets without a debug grid", async ({ page }) => {
    await page.goto(`${server.origin}/examples/legacy-material-studio/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.__G3D_MATERIAL_STUDIO_V1__?.status)).toBe("ready");
    const state = await page.evaluate(() => window.__G3D_MATERIAL_STUDIO_V1__);
    const screenshot = "tests/reports/legacy-material-studio/material-studio.png";
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.locator("[data-testid='legacy-material-studio-canvas']").screenshot({ path: screenshot });
    expect(statSync(screenshot).size).toBeGreaterThan(10_000);
    expect(state?.materials).toEqual(expect.arrayContaining([
      "rough-plastic",
      "polished-metal",
      "glass-clearcoat",
      "emissive-indicator",
      "normal-mapped-matte",
      "textured-carbon",
      "metallic-texture"
    ]));
    expect((state?.diagnostics as { drawCalls?: number; lastError?: string | null } | undefined)?.lastError).toBeNull();
    expect((state?.diagnostics as { drawCalls?: number } | undefined)?.drawCalls).toBeGreaterThan(7);
  });
});
