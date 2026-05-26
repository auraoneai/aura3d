import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-hdr-browser.json";

test.describe("V4 HDR pipeline browser evidence", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves browser HDR target readback, tone mapping, exposure, and color management state", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/hdr-render-target-check/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_HDR_RENDER_TARGET_CHECK__?.status === "ready", undefined, { timeout: 30_000 });

    const state = await page.evaluate(() => window.__AURA3D_HDR_RENDER_TARGET_CHECK__);
    const report = {
      ok: errors.length === 0 &&
        state?.status === "ready" &&
        state.featureEvidence.hdrRenderTargets === true &&
        state.featureEvidence.floatReadback === true &&
        state.featureEvidence.sampleOverOne === true &&
        state.featureEvidence.hdrPostprocessToneMapping === true,
      generatedAt: new Date().toISOString(),
      source: "examples/hdr-render-target-check/index.html",
      productBoundary: "Browser evidence for the V4 HDR pipeline milestone only. This is not flagship visual completion.",
      requiredNextProof: [
        "real HDR/IBL environments",
        "material matrix screenshots",
        "same-scene Three.js flagship comparisons",
        "external packed-package template screenshots"
      ],
      errors,
      state
    };
    mkdirSync(join(process.cwd(), "tests/reports"), { recursive: true });
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(state?.format).toBe("rgba32f");
    expect(state?.featureEvidence).toMatchObject({
      hdrRenderTargets: true,
      floatReadback: true,
      browserFloatFramebuffer: true,
      sampleOverOne: true,
      hdrPostprocessToneMapping: true
    });
    expect(Number(state?.metrics.sampleR ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.hdrToneMappedR ?? 0)).toBeGreaterThan(150);
    expect(Number(state?.metrics.hdrToneMappedR ?? 0)).toBeLessThan(255);
    expect(Number(state?.metrics.hdrToneMappedOverbrightPixels ?? 0)).toBe(1);
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
    __AURA3D_HDR_RENDER_TARGET_CHECK__?: {
      readonly status?: "ready" | "error";
      readonly format?: "rgba32f";
      readonly featureEvidence: {
        readonly hdrRenderTargets?: boolean;
        readonly floatReadback?: boolean;
        readonly browserFloatFramebuffer?: boolean;
        readonly sampleOverOne?: boolean;
        readonly hdrPostprocessToneMapping?: boolean;
      };
      readonly metrics: {
        readonly sampleR?: number;
        readonly hdrToneMappedR?: number;
        readonly hdrToneMappedOverbrightPixels?: number;
      };
    };
  }
}
