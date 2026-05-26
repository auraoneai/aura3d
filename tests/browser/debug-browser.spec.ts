import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("debug browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders debug overlay plus physics, camera, and bounds lines without mutating base output", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/debug-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_DEBUG_BROWSER_TEST__?.status === "ready" || window.__AURA3D_DEBUG_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_DEBUG_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.physicsLineCount).toBe(12);
    expect(result?.cameraLineCount).toBe(4);
    expect(result?.boundsLineCount).toBe(4);
    expect(result?.totalLineCount).toBe(20);
    expect(result?.overlaySections).toBe(2);
    expect(result?.overlayRows).toBe(5);
    expect(result?.baseAfterDiagnosticsPixel).toEqual(result?.baseBeforePixel);
    expect(result?.renderBounds?.minX).toBeLessThan(60);
    expect(result?.renderBounds?.maxX).toBeGreaterThan(185);

    const [pr = 0, pg = 0, pb = 0, pa = 0] = result?.debugPhysicsPixel ?? [];
    expect(pr).toBeLessThan(120);
    expect(pg).toBeGreaterThan(180);
    expect(pb).toBeGreaterThan(180);
    expect(pa).toBe(255);

    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.debugCameraPixel ?? [];
    expect(cr).toBeGreaterThan(180);
    expect(cg).toBeGreaterThan(130);
    expect(cb).toBeLessThan(90);
    expect(ca).toBe(255);

    const [br = 0, bg = 0, bb = 0, ba = 0] = result?.debugBoundsPixel ?? [];
    expect(br).toBeGreaterThan(180);
    expect(bg).toBeLessThan(120);
    expect(bb).toBeGreaterThan(150);
    expect(ba).toBe(255);

    await expect(page.locator("[data-debug-section='Runtime']")).toBeVisible();
    await expect(page.locator("[data-debug-row='diagnosticsMutateBase']")).toContainText("false");
  });
});

declare global {
  interface Window {
    __AURA3D_DEBUG_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly physicsLineCount?: number;
      readonly cameraLineCount?: number;
      readonly boundsLineCount?: number;
      readonly totalLineCount?: number;
      readonly overlaySections?: number;
      readonly overlayRows?: number;
      readonly baseBeforePixel?: readonly number[];
      readonly baseAfterDiagnosticsPixel?: readonly number[];
      readonly debugPhysicsPixel?: readonly number[];
      readonly debugCameraPixel?: readonly number[];
      readonly debugBoundsPixel?: readonly number[];
      readonly renderBounds?: {
        readonly minX: number;
        readonly minY: number;
        readonly maxX: number;
        readonly maxY: number;
      };
      readonly error?: string;
    };
  }
}
