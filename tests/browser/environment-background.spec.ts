import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("renderer environment background", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders first-class equirect and cubemap backgrounds behind scene geometry", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/environment-background-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ENVIRONMENT_BACKGROUND_TEST__?.status === "ready" || window.__GALILEO3D_ENVIRONMENT_BACKGROUND_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_ENVIRONMENT_BACKGROUND_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.equirectDiagnostics?.lastError).toBeNull();
    expect(result?.cubemapDiagnostics?.lastError).toBeNull();
    expect(result?.compositeDiagnostics?.lastError).toBeNull();
    expect(result?.equirectDiagnostics?.drawCalls).toBe(1);
    expect(result?.cubemapDiagnostics?.drawCalls).toBe(1);
    expect(result?.compositeDiagnostics?.drawCalls).toBe(2);

    const [er = 0, eg = 0, eb = 0, ea = 0] = result?.equirectPixel ?? [];
    expect(eg).toBeGreaterThan(er + 80);
    expect(eb).toBeGreaterThan(er + 100);
    expect(ea).toBe(255);

    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.cubemapPixel ?? [];
    expect(cg + cb).toBeGreaterThan(cr + 250);
    expect(cr + cg + cb).toBeGreaterThan(360);
    expect(ca).toBe(255);

    const [fr = 0, fg = 0, fb = 0, fa = 0] = result?.compositeForegroundPixel ?? [];
    const [br = 0, bg = 0, bb = 0, ba = 0] = result?.compositeBackgroundPixel ?? [];
    expect(fr).toBeGreaterThan(180);
    expect(fg).toBeLessThan(80);
    expect(fb).toBeLessThan(80);
    expect(fa).toBe(255);
    expect(bg).toBeGreaterThan(br + 80);
    expect(bb).toBeGreaterThan(br + 100);
    expect(ba).toBe(255);
  });
});
