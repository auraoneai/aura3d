import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-postprocess-suite-browser.json";

test.describe("V4 postprocess suite browser evidence", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves postprocess lab output plus V4 bloom/SSAO/DOF/color-grade APIs", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/_quarantine/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_POSTPROCESS_LAB__?.status === "ready", undefined, { timeout: 30_000 });
    const screenshotPath = "tests/reports/external-gallery/postprocess/postprocess-suite.png";
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/postprocess"), { recursive: true });
    await page.locator("[data-testid='postprocess-lab-canvas']").screenshot({ path: screenshotPath });

    const state = await page.evaluate(() => window.__GALILEO3D_POSTPROCESS_LAB__);
    const v4Postprocess = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const width = 4;
      const height = 4;
      const pixels = new Uint8Array(width * height * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = i % 16 === 0 ? 255 : 90;
        pixels[i + 1] = i % 20 === 0 ? 220 : 120;
        pixels[i + 2] = i % 24 === 0 ? 180 : 130;
        pixels[i + 3] = 255;
      }
      const bloom = rendering.runV4Bloom(pixels, width, height, { threshold: 0.55, intensity: 0.55, radius: 1 });
      const bloomEvidence = rendering.createV4BloomEvidence(bloom);
      const ssao = rendering.runV4SSAO(pixels, width, height, { radius: 2, intensity: 0.5 });
      const dof = rendering.runV4DepthOfField(pixels, width, height, { focusDepth: 0.35, focusRange: 0.08, maxRadius: 2 });
      const colorGrade = rendering.runV4ColorGrade(pixels, width, height, "catalog-hero");
      return {
        bloomEvidence,
        ssao: { occludedPixels: ssao.occludedPixels, averageOcclusion: ssao.averageOcclusion },
        dof: { blurredPixels: dof.blurredPixels, maxBlurRadius: dof.maxBlurRadius },
        colorGrade: { changedPixels: colorGrade.changedPixels, vignetteDarkenedPixels: colorGrade.vignetteDarkenedPixels }
      };
    });
    const report = {
      ok: errors.length === 0 &&
        state?.status === "ready" &&
        v4Postprocess.bloomEvidence.changedPixels > 0 &&
        v4Postprocess.ssao.occludedPixels > 0 &&
        v4Postprocess.dof.blurredPixels > 0 &&
        v4Postprocess.colorGrade.changedPixels > 0,
      generatedAt: new Date().toISOString(),
      screenshotPath,
      productBoundary: "Postprocess evidence for V4 Milestone 5 only. Flagship scenes still require off/on screenshots and Three.js comparison context.",
      errors,
      state,
      v4Postprocess
    };
    mkdirSync(join(process.cwd(), "tests/reports"), { recursive: true });
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(v4Postprocess.bloomEvidence.changedPixels).toBeGreaterThan(0);
    expect(v4Postprocess.ssao.occludedPixels).toBeGreaterThan(0);
    expect(v4Postprocess.dof.blurredPixels).toBeGreaterThan(0);
    expect(v4Postprocess.colorGrade.changedPixels).toBeGreaterThan(0);
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

declare global {
  interface Window {
    __GALILEO3D_POSTPROCESS_LAB__?: {
      readonly status?: "ready" | "error";
    };
  }
}
