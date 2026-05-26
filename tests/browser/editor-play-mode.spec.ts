import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("editor play and export workflow", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("saves, reloads, enters play mode, restores edit state, and exports static files", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_EDITOR_APP__?.getState().status === "ready");

    await page.locator('input[data-path="position.X"]').fill("1.25");
    await page.locator('input[data-path="position.X"]').blur();
    await page.getByRole("button", { name: "Save" }).click();
    const saved = await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().savedProjectJson);
    expect(saved).toContain('"version": 1');
    expect(saved).toContain('"position": [');

    await page.locator('[data-role="project-buffer"]').evaluate((element: HTMLTextAreaElement) => {
      element.value = element.value.replace("Hero Cube", "Reloaded Hero");
    });
    await page.getByRole("button", { name: "Load" }).click();
    await expect(page.getByRole("button", { name: "Reloaded Hero" })).toBeVisible();

    const topbar = page.getByRole("banner");
    await topbar.getByRole("button", { name: "Play" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().mode)).toBe("play");
    await topbar.getByRole("button", { name: "Play" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().mode)).toBe("edit");

    await page.getByRole("button", { name: "Export" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().exportedFileCount)).toBe(3);
    await expect(page.locator('[data-role="export-summary"]')).toContainText("runtime.js");
  });
});

declare global {
  interface Window {
    __AURA3D_EDITOR_APP__?: {
      getState(): {
        readonly status: string;
        readonly mode: string;
        readonly savedProjectJson: string;
        readonly exportedFileCount: number;
      };
    };
  }
}
