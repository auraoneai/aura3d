import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Aura3D product viewer screenshot is non-empty", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1000);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength }, null, 2)}\n`);
});
