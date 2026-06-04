import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("cinematic VFX quality", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("publishes renderer-owned rain, fog, neon, and story-prop evidence", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/?chrome=hidden`, { waitUntil: "domcontentloaded" });
    const runtime = await waitForRuntime(page);
    expect(runtime.cinematicScene?.rendererOwned).toBe(true);
    expect(runtime.cinematicScene?.vfxCount).toBeGreaterThanOrEqual(2);
    expect(runtime.cinematicScene?.practicalLightCount).toBeGreaterThanOrEqual(2);
    expect(runtime.cinematicScene?.heroPropCount).toBeGreaterThanOrEqual(1);
    expect(runtime.cinematicScene?.environmentGeometryCount).toBeGreaterThanOrEqual(3);
    expect(runtime.cinematicScene?.validation?.ok).toBe(true);
  });
});

async function waitForRuntime(page: import("@playwright/test").Page): Promise<{
  readonly cinematicScene?: {
    readonly rendererOwned: boolean;
    readonly vfxCount: number;
    readonly practicalLightCount: number;
    readonly heroPropCount: number;
    readonly environmentGeometryCount: number;
    readonly validation?: { readonly ok: boolean };
  };
}> {
  await page.waitForFunction(() => {
    const runtime = (window as unknown as { __a3dWowRuntime?: { readonly status: string; readonly drawCalls: number; readonly cinematicScene?: unknown } }).__a3dWowRuntime;
    return runtime && (runtime.status === "ready" || runtime.status === "running") && runtime.drawCalls > 0 && runtime.cinematicScene;
  }, undefined, { timeout: 30_000 });
  return page.evaluate(() => (window as unknown as { __a3dWowRuntime?: { readonly cinematicScene?: unknown } }).__a3dWowRuntime ?? {});
}
