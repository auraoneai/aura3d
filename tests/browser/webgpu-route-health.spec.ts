import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectWebGPURouteSettles, WEBGPU_ROOT_ROUTES } from "./webgpu-route-helpers";

test.describe("WebGPU route health", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const route of WEBGPU_ROOT_ROUTES) {
    test(`${route} renders or reports unsupported`, async ({ page }, testInfo) => {
      await expectWebGPURouteSettles(page, server.origin, route, testInfo);
    });
  }
});
