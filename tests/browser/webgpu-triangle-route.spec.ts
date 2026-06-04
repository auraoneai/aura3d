import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectWebGPURouteSettles } from "./webgpu-route-helpers";

test.describe("WebGPU triangle route", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders through explicit WebGPU or shows unsupported diagnostics", async ({ page }, testInfo) => {
    await expectWebGPURouteSettles(page, server.origin, "/apps/wow-webgpu-triangle/", testInfo);
  });
});
