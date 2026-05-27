import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectWebGPURouteSettles } from "./webgpu-route-helpers";

test.describe("WebGPU product viewer route", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders production product viewer through WebGPU", async ({ page }, testInfo) => {
    await expectWebGPURouteSettles(page, server.origin, "/apps/wow-webgpu-product-viewer/", testInfo);
    const runtime = await page.evaluate(() => (window as unknown as { __a3dWowRuntime?: { status: string; requestedBackend?: string; fields?: Record<string, string | number | boolean> } }).__a3dWowRuntime);
    if (runtime?.status !== "unsupported") {
      expect(runtime?.fields?.Asset).toBeTruthy();
      expect(runtime?.requestedBackend).toBe("webgpu");
    }
  });
});
