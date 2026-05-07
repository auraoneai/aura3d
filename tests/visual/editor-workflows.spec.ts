import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

test.describe("editor workflow visual evidence", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures diagnostics overlay and workflow panels with nonblank pixels", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EDITOR_APP__?.getState().status === "ready");

    await page.getByRole("button", { name: "Move X" }).click();
    await expect(page.locator('[data-metric="draw-calls"]')).toContainText("1");
    await expect(page.locator('[data-metric="shader-diagnostics"]')).toContainText("0 warnings");
    await expect(page.locator('[data-role="viewport-hud"]')).toContainText("draw calls");
    await expect(page.locator('[data-role="diagnostics-list"]')).toContainText("shader");

    const overlayPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-viewport-overlay");
      const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return 0;
      let pixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
      }
      return pixels;
    });
    expect(overlayPixels).toBeGreaterThan(1000);

    await page.screenshot({ path: testInfo.outputPath("editor-workflow-diagnostics.png"), fullPage: true });
  });
});

declare global {
  interface Window {
    __GALILEO3D_EDITOR_APP__?: {
      getState(): { readonly status: "booting" | "ready" | "error" };
    };
  }
}
