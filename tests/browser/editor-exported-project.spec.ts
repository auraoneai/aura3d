import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("editor exported project", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("runs the checked-in editor-authored static project without loading the editor app", async ({ page }) => {
    await page.goto(`${server.origin}/examples/editor-authored-project/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EXPORTED_PROJECT__?.status === "ready");

    const result = await page.evaluate(() => window.__GALILEO3D_EXPORTED_PROJECT__);
    expect(result?.nodeCount).toBe(2);
    expect(result?.projectName).toBe("Editor Authored Sample");
    await expect(page.locator("#galileo-export-status")).toContainText("Loaded Editor Authored Sample");

    const nonBlankPixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#galileo-export");
      const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return 0;
      let pixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
      }
      return pixels;
    });
    expect(nonBlankPixels).toBeGreaterThan(1000);
  });
});

declare global {
  interface Window {
    __GALILEO3D_EXPORTED_PROJECT__?: {
      readonly status: "ready";
      readonly nodeCount: number;
      readonly projectName: string;
    };
  }
}
