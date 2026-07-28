import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rectangular area-light browser pixels", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves finite, size-dependent, one-sided PBR lighting", async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 320 });
    await page.goto(`${server.origin}/tests/browser/rect-area-light-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_RECT_AREA_LIGHT__?.status === "ready" ||
        window.__AURA3D_RECT_AREA_LIGHT__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_RECT_AREA_LIGHT__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.modes).toEqual(["small", "wide", "back"]);
    expect(result?.drawCalls).toEqual({ small: 1, wide: 1, back: 1 });
    expect(result?.smallToWideChangedPixels).toBeGreaterThan(1_000);
    expect(result?.wideToBackChangedPixels).toBeGreaterThan(1_000);
    expect(result?.averageLuminance?.wide).toBeGreaterThan((result?.averageLuminance?.small ?? 0) * 1.15);
    expect(result?.averageLuminance?.wide).toBeGreaterThan((result?.averageLuminance?.back ?? 0) * 1.8);
    expect(result?.claimBoundary).toMatch(/finite rectangular emitter.*size-dependent.*one-sided.*does not claim.*LTC.*root createAuraApp/i);

    const screenshotPath = resolve("tests/reports/environment-platform/rect-area-light-browser.png");
    mkdirSync(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(statSync(screenshotPath).size).toBeGreaterThan(10_000);
  });
});

declare global {
  interface Window {
    __AURA3D_RECT_AREA_LIGHT__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly modes?: readonly string[];
      readonly smallToWideChangedPixels?: number;
      readonly wideToBackChangedPixels?: number;
      readonly averageLuminance?: Readonly<Record<string, number>>;
      readonly drawCalls?: Readonly<Record<string, number>>;
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}
