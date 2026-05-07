import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("camera grid browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders grid scene from perspective and orthographic camera projections", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/camera-grid-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_CAMERA_GRID_BROWSER_TEST__?.status === "ready" || window.__GALILEO3D_CAMERA_GRID_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_CAMERA_GRID_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.perspectiveLines).toBe(10);
    expect(result?.orthographicLines).toBe(10);
    expect(result?.perspectiveSpacing).toBeGreaterThan(result?.orthographicSpacing ?? 0);

    const [pr = 0, pg = 0, pb = 0, pa = 0] = result?.perspectivePixel ?? [];
    expect(pr).toBeLessThan(120);
    expect(pg).toBeGreaterThan(90);
    expect(pb).toBeGreaterThan(170);
    expect(pa).toBe(255);

    const [or = 0, og = 0, ob = 0, oa = 0] = result?.orthographicPixel ?? [];
    expect(or).toBeGreaterThan(170);
    expect(og).toBeGreaterThan(120);
    expect(ob).toBeLessThan(110);
    expect(oa).toBe(255);

    const [dr = 0, dg = 0, db = 0, da = 0] = result?.dividerPixel ?? [];
    expect(dr).toBeGreaterThan(180);
    expect(dg).toBeGreaterThan(180);
    expect(db).toBeGreaterThan(180);
    expect(da).toBe(255);
  });
});

declare global {
  interface Window {
    __GALILEO3D_CAMERA_GRID_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly perspectiveLines?: number;
      readonly orthographicLines?: number;
      readonly perspectiveSpacing?: number;
      readonly orthographicSpacing?: number;
      readonly perspectivePixel?: readonly number[];
      readonly orthographicPixel?: readonly number[];
      readonly dividerPixel?: readonly number[];
      readonly error?: string;
    };
  }
}
