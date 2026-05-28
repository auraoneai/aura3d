import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Aura3D product viewer reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  expect(drawCalls).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, drawCalls }, null, 2)}\n`);
});
