import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const routes = [
  "/apps/hello-world-typed-asset/",
  "/apps/material-lighting/",
  "/apps/camera-path/"
] as const;

test.describe("starter examples", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("route health and screenshot report", async ({ page }) => {
    const results = [];
    for (const route of routes) {
      await page.goto(`${server.origin}${route}`);
      await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
      const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      const screenshot = await page.locator("canvas").screenshot();
      expect(screenshot.byteLength).toBeGreaterThan(1000);
      results.push({ route, drawCalls, screenshotBytes: screenshot.byteLength });
    }
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve("tests/reports/agent-examples-playwright.json"), `${JSON.stringify({ schema: "aura3d-example-route-health", pass: true, routes: results }, null, 2)}\n`);
  });
});
