import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("physics browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders falling cubes and physics debug overlay from a stepped PhysicsWorld", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/physics-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_PHYSICS_BROWSER_TEST__?.status === "ready" || window.__GALILEO3D_PHYSICS_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_PHYSICS_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.steps).toBe(150);
    expect(result?.contacts).toBeGreaterThan(0);
    expect(result?.events).toBeGreaterThan(0);
    expect(result?.debugLineCount).toBeGreaterThanOrEqual(38);
    expect(result?.finalHeights?.every((height, index) => height < (result.initialHeights?.[index] ?? 0))).toBe(true);
    expect(result?.finalHeights?.every((height) => height >= 0.3)).toBe(true);

    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.cubePixel ?? [];
    expect(cr).toBeGreaterThan(40);
    expect(cg).toBeGreaterThan(140);
    expect(cb).toBeGreaterThan(80);
    expect(ca).toBe(255);

    const [dr = 0, dg = 0, db = 0, da = 0] = result?.debugPixel ?? [];
    expect(dr).toBeLessThan(80);
    expect(dg).toBeGreaterThan(150);
    expect(db).toBeGreaterThan(180);
    expect(da).toBe(255);

    const [gr = 0, gg = 0, gb = 0, ga = 0] = result?.groundPixel ?? [];
    expect(gr).toBeGreaterThan(60);
    expect(gg).toBeGreaterThan(70);
    expect(gb).toBeGreaterThan(80);
    expect(ga).toBe(255);
  });
});

declare global {
  interface Window {
    __GALILEO3D_PHYSICS_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly initialHeights?: readonly number[];
      readonly finalHeights?: readonly number[];
      readonly steps?: number;
      readonly contacts?: number;
      readonly events?: number;
      readonly debugLineCount?: number;
      readonly cubePixel?: readonly number[];
      readonly debugPixel?: readonly number[];
      readonly groundPixel?: readonly number[];
      readonly error?: string;
    };
  }
}
