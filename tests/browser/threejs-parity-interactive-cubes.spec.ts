import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("ThreejsParity interactive cubes parity evidence", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("route reports live pointer-hover cube hits through public picking rays", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !/\/favicon\.ico$/.test(response.url())) {
        pageErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(`${server.origin}/apps/interactive-picking/`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await page.waitForFunction(() => {
      const runtime = window.__a3dCurrentRoutesInteractivePicking as { readonly status?: string; readonly cubePickHits?: number } | undefined;
      return (runtime?.status === "ready" || runtime?.status === "running") && (runtime.cubePickHits ?? 0) > 0;
    }, undefined, { timeout: 20_000 });

    const canvas = page.locator("#viewport");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    for (const xRatio of [0.28, 0.38, 0.5, 0.62, 0.74]) {
      for (const yRatio of [0.34, 0.46, 0.58, 0.7]) {
        await page.mouse.move(box.x + box.width * xRatio, box.y + box.height * yRatio);
        const hit = await page.evaluate(() => {
          const runtime = window.__a3dCurrentRoutesInteractivePicking as {
            readonly pointerPickHits?: number;
            readonly lastPointerHit?: string;
          } | undefined;
          return {
            pointerPickHits: runtime?.pointerPickHits ?? 0,
            lastPointerHit: runtime?.lastPointerHit ?? "none"
          };
        });
        if (hit.pointerPickHits > 0 && /^cube-\d+$/.test(hit.lastPointerHit)) {
          expect(pageErrors).toEqual([]);
          return;
        }
      }
    }

    const runtime = await page.evaluate(() => window.__a3dCurrentRoutesInteractivePicking);
    expect(runtime, "expected pointer sweep to hit at least one cube").toMatchObject({
      pointerPickHits: expect.any(Number)
    });
    expect((runtime as { readonly pointerPickHits?: number }).pointerPickHits ?? 0).toBeGreaterThan(0);
    expect((runtime as { readonly lastPointerHit?: string }).lastPointerHit ?? "none").toMatch(/^cube-\d+$/);
    expect(pageErrors).toEqual([]);
  });
});
