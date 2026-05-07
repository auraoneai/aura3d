import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("CPU particle browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders fire, fountain, collision, and trail sprites through CPU ParticleRenderer", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/particle-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_PARTICLE_BROWSER_TEST__?.status === "ready" || window.__GALILEO3D_PARTICLE_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_PARTICLE_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.fireLive).toBeGreaterThan(40);
    expect(result?.fountainLive).toBeGreaterThan(55);
    expect(result?.collisionLive).toBe(20);
    expect(result?.trailPoints).toBeGreaterThan(5);
    expect(result?.stats?.fireUploads).toBe(1);
    expect(result?.stats?.fountainUploads).toBe(1);

    const [fr = 0, fg = 0, fb = 0, fa = 0] = result?.firePixel ?? [];
    expect(fr).toBeGreaterThan(120);
    expect(fg).toBeGreaterThan(30);
    expect(fb).toBeLessThan(100);
    expect(fa).toBe(255);

    const [wr = 0, wg = 0, wb = 0, wa = 0] = result?.fountainPixel ?? [];
    expect(wr).toBeLessThan(120);
    expect(wg).toBeGreaterThan(60);
    expect(wb).toBeGreaterThan(130);
    expect(wa).toBe(255);

    const [cr = 0, cg = 0, cb = 0, ca = 0] = result?.collisionPixel ?? [];
    expect(cr).toBeGreaterThan(50);
    expect(cg).toBeGreaterThan(120);
    expect(cb).toBeGreaterThan(40);
    expect(ca).toBe(255);

    const [tr = 0, tg = 0, tb = 0, ta = 0] = result?.trailPixel ?? [];
    expect(tr).toBeGreaterThan(180);
    expect(tg).toBeLessThan(120);
    expect(tb).toBeGreaterThan(150);
    expect(ta).toBe(255);
  });
});

declare global {
  interface Window {
    __GALILEO3D_PARTICLE_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly fireLive?: number;
      readonly fountainLive?: number;
      readonly collisionLive?: number;
      readonly trailPoints?: number;
      readonly firePixel?: readonly number[];
      readonly fountainPixel?: readonly number[];
      readonly collisionPixel?: readonly number[];
      readonly trailPixel?: readonly number[];
      readonly stats?: {
        readonly fireUploads: number;
        readonly fountainUploads: number;
        readonly collisionKilled: number;
      };
      readonly error?: string;
    };
  }
}
