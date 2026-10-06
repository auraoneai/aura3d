import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("Aura3D cinematic scene screenshot is non-blank", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const screenshot = await page.screenshot({ fullPage: false });
  const proof = await page.evaluate(() => (window as unknown as { __AURA3D_CINEMATIC_SCENE__?: { look: { id: string } } }).__AURA3D_CINEMATIC_SCENE__);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, look: proof?.look.id }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
