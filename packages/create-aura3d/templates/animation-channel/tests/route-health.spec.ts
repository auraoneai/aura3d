import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("animation channel route loads", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 60_000 }).toBe("true");
  await expect(page.locator("#app")).toBeVisible();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(0);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({
    template: "animation-channel", url: page.url(), canvasBounds, runtime: await page.evaluate(() => { const api = (window as unknown as { __AURA3D_ANIMATION_TEMPLATE__?: { diagnostics?(): unknown } }).__AURA3D_ANIMATION_TEMPLATE__; return { mounted: Boolean(api), diagnostics: api?.diagnostics?.() }; })
  }, null, 2)}\n`);
});

