import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

test.describe("editor app visual pixels", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders viewport, overlay, diagnostics, and selected-gizmo pixels", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 15_000 });

    await page.getByRole("button", { name: "Move X" }).click();
    await expect(page.locator('[data-role="viewport-hud"]')).toContainText("draw calls");
    await expect(page.locator('[data-metric="draw-calls"]')).toContainText("1");
    await expect(page.locator('[data-role="diagnostics-list"]')).toContainText("shader: Mint Material");

    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-viewport-overlay");
      const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!canvas || !data) {
        return { nonBlank: 0, selectedOutline: 0, moveAxis: 0, nodeFill: 0 };
      }
      let nonBlank = 0;
      let selectedOutline = 0;
      let moveAxis = 0;
      let nodeFill = 0;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index]!;
        const green = data[index + 1]!;
        const blue = data[index + 2]!;
        if (red > 20 || green > 20 || blue > 20) {
          nonBlank += 1;
        }
        if (red > 210 && green > 170 && blue < 110) {
          selectedOutline += 1;
        }
        if (red > 220 && green > 80 && green < 170 && blue < 60) {
          moveAxis += 1;
        }
        if (red < 90 && green > 150 && blue > 110 && blue < 190) {
          nodeFill += 1;
        }
      }
      return { nonBlank, selectedOutline, moveAxis, nodeFill };
    });

    expect(pixels.nonBlank).toBeGreaterThan(100_000);
    expect(pixels.nodeFill).toBeGreaterThan(1_000);
    expect(pixels.selectedOutline).toBeGreaterThan(500);
    expect(pixels.moveAxis).toBeGreaterThan(100);

    await page.screenshot({ path: testInfo.outputPath("editor-app-pixels.png"), fullPage: true });
  });
});

declare global {
  interface Window {
    __AURA3D_EDITOR_APP__?: {
      getState(): { readonly status: "booting" | "ready" | "error" };
    };
  }
}
