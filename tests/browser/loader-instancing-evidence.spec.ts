import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("loader instancing evidence", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders EXT_mesh_gpu_instancing through the native WebGL2 instance path", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/apps/loader-instancing/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const runtime = window.__a3dCurrentRoutesLoaderInstancing;
      return (runtime?.status === "ready" || runtime?.status === "running") && runtime.frameCount >= 2;
    });

    const runtime = await page.evaluate(() => window.__a3dCurrentRoutesLoaderInstancing);
    expect(pageErrors).toEqual([]);
    expect(runtime?.renderer).toBe("a3d-webgl2");
    expect(runtime?.extensionsUsed).toContain("EXT_mesh_gpu_instancing");
    expect(runtime?.unsupportedRequired).toEqual([]);
    expect(runtime?.instanceCount).toBe(4);
    expect(runtime?.instancedRenderableCount).toBe(1);
    expect(runtime?.drawCalls).toBeGreaterThan(0);

    const pixels = await page.locator("#viewport").evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2");
      if (!gl) return { nonBlank: 0, error: "missing-webgl2" };
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      let nonBlank = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 8 || data[index + 1] > 8 || data[index + 2] > 8) nonBlank += 1;
      }
      return { nonBlank, error: gl.getError() };
    });
    expect(pixels.error).toBe(0);
    expect(pixels.nonBlank).toBeGreaterThan(1_000);

    const screenshotPath = resolve("tests/reports/current-routes/loaders/loader-instancing.png");
    mkdirSync(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});

declare global {
  interface Window {
    __a3dCurrentRoutesLoaderInstancing?: {
      readonly status: "loading" | "ready" | "running" | "error";
      readonly frameCount: number;
      readonly drawCalls: number;
      readonly instanceCount: number;
      readonly instancedRenderableCount: number;
      readonly extensionsUsed: readonly string[];
      readonly unsupportedRequired: readonly string[];
      readonly renderer: "a3d-webgl2";
    };
  }
}
