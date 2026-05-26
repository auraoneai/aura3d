import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("scene graph browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders nested scene nodes with inherited transforms plus camera grid and light debug", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/scene-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_SCENE_BROWSER_TEST__?.status === "ready" || window.__AURA3D_SCENE_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_SCENE_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.parentWorld).toEqual([56, 64, 0]);
    expect(result?.childWorld).toEqual([120, 88, 0]);
    expect(result?.cameraGridLines).toBe(3);
    expect(result?.lightDirection).toEqual([-0, -0, -1]);

    const [pr = 0, pg = 0, pb = 0, pa = 0] = result?.parentPixel ?? [];
    expect(pr).toBeLessThan(60);
    expect(pg).toBeGreaterThan(110);
    expect(pb).toBeGreaterThan(180);
    expect(pa).toBe(255);

    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.childPixel ?? [];
    expect(cr).toBeGreaterThan(180);
    expect(cg).toBeGreaterThan(180);
    expect(cb).toBeLessThan(90);
    expect(ca).toBe(255);

    const [gr = 0, gg = 0, gb = 0] = result?.gridPixel ?? [];
    expect(gr).toBeGreaterThan(35);
    expect(gg).toBeGreaterThan(45);
    expect(gb).toBeGreaterThan(60);

    const [lr = 0, lg = 0, lb = 0] = result?.lightPixel ?? [];
    expect(lr).toBeGreaterThan(180);
    expect(lg).toBeLessThan(130);
    expect(lb).toBeLessThan(130);
  });
});

declare global {
  interface Window {
    __AURA3D_SCENE_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly parentWorld?: readonly [number, number, number];
      readonly childWorld?: readonly [number, number, number];
      readonly cameraGridLines?: number;
      readonly lightDirection?: readonly [number, number, number];
      readonly parentPixel?: readonly number[];
      readonly childPixel?: readonly number[];
      readonly gridPixel?: readonly number[];
      readonly lightPixel?: readonly number[];
      readonly error?: string;
    };
  }
}
