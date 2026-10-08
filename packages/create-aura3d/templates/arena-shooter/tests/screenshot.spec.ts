import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { assertTemplateLookFloor } from "./look-floor";

test.setTimeout(600_000);

// PRD-13 T3.12 — look floor: non-blank, look.lint error-free, appliedLook
// environment specular > 0, shadow strength >= 0.8, pixelRatio at tier cap,
// subject bounds within ±10% — plus this template's bespoke assertions.
test("Aura3D arena shooter screenshot clears the look floor", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ARENA_SHOOTER__?: unknown }).__AURA3D_ARENA_SHOOTER__));
  const hud = page.locator("#hud .hud__panel--status");
  await expect(hud).toContainText("Arena Shooter");
  const floor = await assertTemplateLookFloor(page, { subject: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 } });
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, floor }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
