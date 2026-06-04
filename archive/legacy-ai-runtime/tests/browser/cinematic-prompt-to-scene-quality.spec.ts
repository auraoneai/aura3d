import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  CINEMATIC_SCREENSHOT_QUALITY_REPORT,
  DEFAULT_CINEMATIC_SCREENSHOT,
  createCinematicSceneQualityReport,
  writeCinematicSceneQualityReport
} from "../../tools/cinematic-scene-quality/index";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const cinematicSceneBeforePath = "tests/reports/cinematic/screenshots/cinematic-scene-before.png";
const cinematicSceneAfterPath = "tests/reports/cinematic/screenshots/cinematic-scene-after.png";

test.describe("cinematic prompt-to-scene quality", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("rejects DOM/CSS-only cinematic illusions and product-turntable framing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/?chrome=hidden`, { waitUntil: "domcontentloaded" });
    await waitForCinematicRuntime(page);
    mkdirSync(dirname(resolve(DEFAULT_CINEMATIC_SCREENSHOT)), { recursive: true });
    await page.screenshot({ path: DEFAULT_CINEMATIC_SCREENSHOT, fullPage: false });
    await page.screenshot({ path: cinematicSceneBeforePath, fullPage: false });

    await page.evaluate(() => document.documentElement.removeAttribute("data-chrome"));
    await page.locator("#patch-prompt").fill("Make the camera much wider, pull back, reduce rain, add warm golden light, and make the robot smaller.");
    await page.locator("#apply-patch").click();
    await page.waitForTimeout(700);
    await page.evaluate(() => document.documentElement.setAttribute("data-chrome", "hidden"));
    await page.screenshot({ path: cinematicSceneAfterPath, fullPage: false });

    const report = createCinematicSceneQualityReport({
      screenshotPath: DEFAULT_CINEMATIC_SCREENSHOT
    });
    writeCinematicSceneQualityReport(report);
    expect(report.pass, `${CINEMATIC_SCREENSHOT_QUALITY_REPORT}\n${report.failures.map((entry) => entry.detail).join("\n")}`).toBe(true);
  });
});

async function waitForCinematicRuntime(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => {
    const runtime = (window as unknown as { __a3dWowRuntime?: { readonly status: string; readonly frameCount: number; readonly drawCalls: number } }).__a3dWowRuntime;
    return runtime && (runtime.status === "ready" || runtime.status === "running") && runtime.frameCount >= 2 && runtime.drawCalls > 0;
  }, undefined, { timeout: 30_000 }).catch(() => undefined);
}
