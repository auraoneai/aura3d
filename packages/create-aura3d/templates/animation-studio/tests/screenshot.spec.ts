import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

// Waits on the scene player's real readiness contract (__AURA_LIVE_ROUTE_READY__),
// then captures the rendered route as visual evidence.
test("Aura3D animation studio screenshot shows content", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __AURA_LIVE_ROUTE_READY__?: { ready?: boolean };
            __AURA_LIVE_ROUTE_ERROR__?: string;
          };
          if (w.__AURA_LIVE_ROUTE_ERROR__) return `error: ${w.__AURA_LIVE_ROUTE_ERROR__}`;
          return w.__AURA_LIVE_ROUTE_READY__?.ready === true ? "ready" : "pending";
        }),
      { timeout: 45_000 }
    )
    .toBe("ready");
  const screenshot = await page.screenshot({ fullPage: false });
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
