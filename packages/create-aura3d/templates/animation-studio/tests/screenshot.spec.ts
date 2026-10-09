import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { assertTemplateLookFloor } from "./look-floor";
import { moonGardenDocument } from "../src/examples/moon-garden.example";

test.setTimeout(600_000);

// PRD-13 T3.12 — look floor: non-blank, look.lint error-free, appliedLook
// environment specular > 0, shadow strength >= 0.8, pixelRatio at tier cap,
// subject bounds within ±10% — plus this template's bespoke assertions.
test("Aura3D animation studio screenshot clears the look floor", async ({ page }) => {
  // The route renders whatever lands on __AURA_EPISODE_DOCUMENT__ — with no injection it
  // plays the intentionally empty studio void (Q-13-12: uniform canvas by design, not a
  // renderer fault). Inject the real example scene so the floor measures real content.
  await page.addInitScript((doc) => {
    (window as unknown as { __AURA_EPISODE_DOCUMENT__?: unknown }).__AURA_EPISODE_DOCUMENT__ = doc;
  }, moonGardenDocument);
  await page.goto("/");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as { __AURA_LIVE_ROUTE_READY__?: { ready?: boolean }; __AURA_LIVE_ROUTE_ERROR__?: string };
          if (w.__AURA_LIVE_ROUTE_ERROR__) return `error: ${w.__AURA_LIVE_ROUTE_ERROR__}`;
          return w.__AURA_LIVE_ROUTE_READY__?.ready === true ? "ready" : "pending";
        }),
      { timeout: 150_000 }
    )
    .toBe("ready");

  const floor = await assertTemplateLookFloor(page, { subject: { x: 0.15, y: 0.25, width: 0.7, height: 0.6 }, skipAppDiagnostics: true });
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, floor }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
