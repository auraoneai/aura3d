import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-shadow-quality-browser.json";

test.describe("V4 shadow quality browser evidence", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves shadow lab output plus V4 contact/cascade/debug APIs", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/_quarantine/shadow-lab/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_SHADOW_LAB__?.status === "ready", undefined, { timeout: 30_000 });
    const screenshotPath = "tests/reports/external-gallery/postprocess/shadow-quality.png";
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/postprocess"), { recursive: true });
    await page.locator("[data-testid='shadow-lab-canvas']").screenshot({ path: screenshotPath });

    const state = await page.evaluate(() => window.__GALILEO3D_SHADOW_LAB__);
    const v4Shadow = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const contact = rendering.createV4ContactShadow({ casterRadius: 1.2, receiverDistance: 0.35, softness: 0.45, opacity: 0.58 });
      const cascade = rendering.createV4CascadedShadowPipeline({ cascadeCount: 4, mapSize: 256, atlasSize: 512 });
      const debugViews = rendering.createV4ShadowDebugViews({ cascade, contact });
      return {
        contact,
        cascadeCount: cascade.cascades.length,
        atlasUtilization: cascade.atlas.utilization,
        pcfSamples: cascade.filter.samples.length,
        stableTexelSnapping: cascade.stableTexelSnapping,
        debugViewIds: debugViews.map((view) => view.id)
      };
    });
    const shadowRgb = rgbSum(state?.pcf?.shadowPixel);
    const litRgb = rgbSum(state?.pcf?.litPixel);
    const report = {
      ok: errors.length === 0 &&
        state?.status === "ready" &&
        litRgb > shadowRgb &&
        v4Shadow.contact.anchorStrength > 0 &&
        v4Shadow.cascadeCount === 4 &&
        v4Shadow.pcfSamples >= 9 &&
        v4Shadow.debugViewIds.includes("shadow-atlas"),
      generatedAt: new Date().toISOString(),
      screenshotPath,
      productBoundary: "Shadow evidence for V4 Milestone 5 only. Flagship product/interior screenshots must still prove shadow grounding without acne or peter-panning.",
      errors,
      state,
      v4Shadow
    };
    mkdirSync(join(process.cwd(), "tests/reports"), { recursive: true });
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(litRgb).toBeGreaterThan(shadowRgb);
    expect(v4Shadow.contact.anchorStrength).toBeGreaterThan(0);
    expect(v4Shadow.cascadeCount).toBe(4);
    expect(v4Shadow.pcfSamples).toBeGreaterThanOrEqual(9);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

function rgbSum(pixel: readonly number[] | undefined): number {
  return (pixel?.[0] ?? 0) + (pixel?.[1] ?? 0) + (pixel?.[2] ?? 0);
}

declare global {
  interface Window {
    __GALILEO3D_SHADOW_LAB__?: {
      readonly status?: "ready" | "error";
      readonly pcf?: {
        readonly shadowPixel?: readonly number[];
        readonly litPixel?: readonly number[];
      };
    };
  }
}
