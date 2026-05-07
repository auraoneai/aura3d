import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering large scene WebGL2 harness", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders 5,000 static meshes and 10,000 instances through Renderer on WebGL2", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><title>Large Scene Harness</title></head>
        <body>
          <canvas id="large-scene" width="256" height="256"></canvas>
          <script type="module">
            import { runLargeSceneHarness } from "${server.origin}/examples/rendering-large-scene/harness.js";
            void runLargeSceneHarness();
          </script>
        </body>
      </html>
    `);
    await page.waitForFunction(
      () => window.__GALILEO3D_LARGE_SCENE_TEST__?.status === "ready" || window.__GALILEO3D_LARGE_SCENE_TEST__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_LARGE_SCENE_TEST__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.staticMeshes).toBe(5_000);
    expect(result?.instances).toBe(10_000);
    expect(result?.instancedBatches).toBe(157);
    expect(result?.textureVariants).toBe(8);
    expect(result?.materialVariants).toBeGreaterThanOrEqual(15);
    expect(result?.diagnostics?.drawCalls).toBe(5_157);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.diagnostics?.textures).toBeGreaterThanOrEqual(8);
    expect(result?.diagnostics?.textureBytes).toBeGreaterThanOrEqual(8 * 4 * 4 * 4);
    expect(result?.canvasFrame).toEqual({ width: 256, height: 256 });

    const [r = 0, g = 0, b = 0, a = 0] = result?.centerPixel ?? [];
    expect(r).toBeGreaterThan(170);
    expect(g).toBeGreaterThan(20);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(50);
    expect(a).toBe(255);

    const [tr = 0, tg = 0, tb = 0, ta = 0] = result?.textureProbePixel ?? [];
    expect(tr + tg + tb).toBeGreaterThan(20);
    expect(ta).toBe(255);
  });

  test("example page renders the large-scene WebGL2 workload", async ({ page }) => {
    await page.goto(`${server.origin}/examples/rendering-large-scene/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_LARGE_SCENE_TEST__?.status === "ready" || window.__GALILEO3D_LARGE_SCENE_TEST__?.status === "error",
      undefined,
      { timeout: 90_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_LARGE_SCENE_TEST__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.staticMeshes).toBe(5_000);
    expect(result?.instances).toBe(10_000);
    expect(result?.diagnostics?.drawCalls).toBe(5_157);
    expect(result?.diagnostics?.lastError).toBeNull();

    const [r = 0, g = 0, b = 0, a = 0] = result?.centerPixel ?? [];
    expect(r).toBeGreaterThan(170);
    expect(g).toBeGreaterThan(20);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(50);
    expect(a).toBe(255);
  });
});

declare global {
  interface Window {
    __GALILEO3D_LARGE_SCENE_TEST__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly staticMeshes?: number;
      readonly instances?: number;
      readonly instancedBatches?: number;
      readonly textureVariants?: number;
      readonly materialVariants?: number;
      readonly frameMs?: number;
      readonly diagnostics?: {
        readonly drawCalls: number;
        readonly textures: number;
        readonly textureBytes: number;
        readonly lastError: string | null;
      };
      readonly centerPixel?: readonly number[];
      readonly textureProbePixel?: readonly number[];
      readonly canvasFrame?: { readonly width: number; readonly height: number };
      readonly error?: string;
    };
  }
}
