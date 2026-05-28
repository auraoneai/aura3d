import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readCinematicPngStats } from "../../tools/cinematic-scene-quality/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const beforePath = "tests/reports/cinematic/screenshots/cinematic-scene-patch-before.png";
const afterPath = "tests/reports/cinematic/screenshots/cinematic-scene-patch-after.png";

test.describe("cinematic scene patch quality", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("conversational patch changes the rendered cinematic frame", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/?chrome=hidden`, { waitUntil: "domcontentloaded" });
    await waitForRuntime(page);
    mkdirSync(dirname(resolve(beforePath)), { recursive: true });
    await page.screenshot({ path: beforePath, fullPage: false });

    await page.evaluate(() => document.documentElement.removeAttribute("data-chrome"));
    await page.locator("#patch-prompt").fill("Make the camera wider, reduce rain, add warm golden light, move the robot left, and add a lantern prop.");
    await page.locator("#apply-patch").click();
    await page.waitForTimeout(800);
    await page.evaluate(() => document.documentElement.setAttribute("data-chrome", "hidden"));
    await page.screenshot({ path: afterPath, fullPage: false });

    const before = readCinematicPngStats(resolve(beforePath));
    const after = readCinematicPngStats(resolve(afterPath));
    const contrastDelta = Math.abs(after.localContrast - before.localContrast);
    const coverageDelta = Math.abs(after.foregroundCoverage - before.foregroundCoverage);
    const colorDelta = Math.abs(after.uniqueColorBuckets - before.uniqueColorBuckets);
    expect(colorDelta + contrastDelta + coverageDelta).toBeGreaterThan(8);
  });
});

async function waitForRuntime(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => {
    const runtime = (window as unknown as { __a3dWowRuntime?: { readonly status: string; readonly frameCount: number; readonly drawCalls: number } }).__a3dWowRuntime;
    return runtime && (runtime.status === "ready" || runtime.status === "running") && runtime.frameCount >= 2 && runtime.drawCalls > 0;
  }, undefined, { timeout: 30_000 });
}
