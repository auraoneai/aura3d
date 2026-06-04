import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectWebGPURouteSettles } from "./webgpu-route-helpers";

test.describe("WebGPU render target route", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("reports render-target readback state", async ({ page }, testInfo) => {
    await expectWebGPURouteSettles(page, server.origin, "/apps/wow-webgpu-render-target/", testInfo);
    const runtime = await page.evaluate(() => (window as unknown as { __a3dWowRuntime?: { status: string; readbackMode?: string } }).__a3dWowRuntime);
    if (runtime?.status !== "unsupported") {
      expect(runtime?.readbackMode).toMatch(/readback|blocked|partial|supported/i);
    }
  });
});
