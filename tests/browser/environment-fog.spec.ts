import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("environment fog browser pixels", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves linear Fog and exponential-squared FogExp2-style blending", async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 300 });
    await page.goto(`${server.origin}/tests/browser/environment-fog-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_ENVIRONMENT_FOG__?.status === "ready" ||
        window.__AURA3D_ENVIRONMENT_FOG__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_ENVIRONMENT_FOG__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.modes).toEqual(["none", "linear", "exponential-squared"]);
    expect(result?.drawCalls).toEqual({
      none: 3,
      linear: 3,
      "exponential-squared": 3
    });
    expect(result?.noFogToLinearChangedPixels).toBeGreaterThan(1_000);
    expect(result?.noFogToExp2ChangedPixels).toBeGreaterThan(1_000);
    expect(result?.linearToExp2ChangedPixels).toBeGreaterThan(250);
    expect(result?.linearColorDistance).toBeLessThan(result?.noFogColorDistance ?? 0);
    expect(result?.exp2ColorDistance).toBeLessThan(result?.noFogColorDistance ?? 0);
    expect(result?.claimBoundary).toMatch(/linear Fog.*FogExp2-style.*not volumetric.*root createAuraApp/i);

    const screenshotPath = resolve("tests/reports/environment-platform/environment-fog-browser.png");
    mkdirSync(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(statSync(screenshotPath).size).toBeGreaterThan(10_000);
  });
});

declare global {
  interface Window {
    __AURA3D_ENVIRONMENT_FOG__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly modes?: readonly string[];
      readonly noFogToLinearChangedPixels?: number;
      readonly noFogToExp2ChangedPixels?: number;
      readonly linearToExp2ChangedPixels?: number;
      readonly noFogColorDistance?: number;
      readonly linearColorDistance?: number;
      readonly exp2ColorDistance?: number;
      readonly drawCalls?: Readonly<Record<string, number>>;
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}
