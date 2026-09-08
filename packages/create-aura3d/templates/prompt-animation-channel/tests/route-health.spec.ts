import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test("animation channel route loads", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_TEMPLATE__));
  await expect(page.locator("canvas")).toBeVisible();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(0);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({
    template: "prompt-animation-channel", url: page.url(), canvasBounds, runtime: await page.evaluate(() => { const api = (window as unknown as { __AURA3D_ANIMATION_TEMPLATE__?: { diagnostics?(): unknown } }).__AURA3D_ANIMATION_TEMPLATE__; return { mounted: Boolean(api), diagnostics: api?.diagnostics?.() }; })
  }, null, 2)}\n`);
});
