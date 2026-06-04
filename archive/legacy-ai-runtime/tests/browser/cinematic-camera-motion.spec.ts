import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("cinematic camera motion", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("advances the renderer timeline and camera framing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/?chrome=hidden`, { waitUntil: "domcontentloaded" });
    const first = await waitForRuntime(page);
    await page.waitForTimeout(900);
    const second = await waitForRuntime(page);
    expect(second.frameCount).toBeGreaterThan(first.frameCount);
    expect(second.cinematicScene?.validation?.ok).toBe(true);
  });
});

async function waitForRuntime(page: import("@playwright/test").Page): Promise<{
  readonly frameCount: number;
  readonly cinematicScene?: { readonly validation?: { readonly ok: boolean } };
}> {
  await page.waitForFunction(() => {
    const runtime = (window as unknown as { __a3dWowRuntime?: { readonly status: string; readonly frameCount: number; readonly drawCalls: number } }).__a3dWowRuntime;
    return runtime && (runtime.status === "ready" || runtime.status === "running") && runtime.frameCount >= 2 && runtime.drawCalls > 0;
  }, undefined, { timeout: 30_000 });
  return page.evaluate(() => (window as unknown as { __a3dWowRuntime?: { readonly frameCount: number; readonly cinematicScene?: unknown } }).__a3dWowRuntime ?? { frameCount: 0 });
}
