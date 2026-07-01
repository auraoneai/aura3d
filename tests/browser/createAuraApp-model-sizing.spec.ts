import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/createAuraApp-model-sizing/model-sizing.json";
const screenshotPath = "tests/reports/createAuraApp-model-sizing/model-sizing.png";

test.describe("createAuraApp model sizing contract", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("target sizing options change typed GLB rendered size through the public root API", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-model-sizing-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_MODEL_SIZING_CONTRACT__ || (window as any).__AURA3D_MODEL_SIZING_ERROR__), undefined, { timeout: 20_000 });

    const harnessError = await page.evaluate(() => (window as any).__AURA3D_MODEL_SIZING_ERROR__);
    if (harnessError) throw new Error(String(harnessError));

    const evidence = await page.evaluate(() => (window as any).__AURA3D_MODEL_SIZING_CONTRACT__);
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      screenshotPath,
      evidence
    }, null, 2)}\n`);

    expect(evidence?.imports).toEqual(["@aura3d/engine", "../../src/aura-assets"]);
    expect(evidence?.asset).toBe("assets.robotcand");
    expect(evidence?.cases?.map((entry: { option: string }) => entry.option)).toEqual([
      "targetHeight",
      "targetMaxDimension",
      "targetLength"
    ]);
    for (const sizingCase of evidence?.cases ?? []) {
      expect(sizingCase.renderer.smallRuntimeBackend).toBe("production-runtime");
      expect(sizingCase.renderer.largeRuntimeBackend).toBe("production-runtime");
      expect(sizingCase.renderer.smallDrawCalls).toBeGreaterThan(0);
      expect(sizingCase.renderer.largeDrawCalls).toBeGreaterThan(0);
      expect(sizingCase.pixels.small.nonBackgroundPixels).toBeGreaterThan(1000);
      expect(sizingCase.pixels.large.nonBackgroundPixels).toBeGreaterThan(sizingCase.pixels.small.nonBackgroundPixels);
      expect(sizingCase.requested.ratio).toBeGreaterThan(2);
      expect(sizingCase.pixels.heightRatio).toBeGreaterThan(1.55);
      expect(sizingCase.pass).toBe(true);
    }
    expect(evidence?.pass).toBe(true);
    expect(errors).toEqual([]);
  });
});
