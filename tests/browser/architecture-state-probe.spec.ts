import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test("architecture state probe", async ({ page }) => {
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-cinematic-architecture/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const before = await page.evaluate(() => (window as any).__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__);
    await page.locator("[data-mood='nocturne']").click();
    const haze = page.locator("#haze-control");
    await haze.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = "100";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => (window as any).__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__);
    console.log(JSON.stringify({
      before: {
        status: before?.status,
        drawCalls: before?.drawCalls,
        runtime: before?.renderer?.runtime,
        postprocess: before?.renderer?.postprocess
      },
      after: {
        status: after?.status,
        drawCalls: after?.drawCalls,
        runtime: after?.renderer?.runtime,
        postprocess: after?.renderer?.postprocess,
        controls: after?.controls,
        revision: after?.interactionState?.revision
      }
    }));
  } finally {
    await server.close();
  }
});
