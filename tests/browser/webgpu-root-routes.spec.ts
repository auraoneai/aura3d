import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { WEBGPU_ROOT_ROUTES } from "./webgpu-route-helpers";

test.describe("WebGPU root routes", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("root registry links every approved WebGPU route", async ({ page }) => {
    await page.goto(`${server.origin}/index.html`, { waitUntil: "domcontentloaded" });
    const hrefs = await page.locator("a[href^='/apps/wow-webgpu-']").evaluateAll((links) => links.map((link) => link.getAttribute("href")));

    expect(hrefs.sort()).toEqual([...WEBGPU_ROOT_ROUTES].sort());
  });
});
