import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

// The animation-studio route is the generic scene player (render-live-route.ts ->
// scene-player.ts). Its readiness contract is window.__AURA_LIVE_ROUTE_READY__ /
// __AURA_LIVE_ROUTE_ERROR__, not the createAuraApp data-aura3d-ready attribute.
test("Aura3D animation studio live route reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __AURA_LIVE_ROUTE_READY__?: { ready?: boolean; backend?: string };
            __AURA_LIVE_ROUTE_ERROR__?: string;
          };
          if (w.__AURA_LIVE_ROUTE_ERROR__) return `error: ${w.__AURA_LIVE_ROUTE_ERROR__}`;
          return w.__AURA_LIVE_ROUTE_READY__?.ready === true ? "ready" : "pending";
        }),
      { timeout: 45_000 }
    )
    .toBe("ready");
  const proof = await page.evaluate(
    () => (window as unknown as { __AURA_LIVE_ROUTE_READY__?: { ready?: boolean; backend?: string } }).__AURA_LIVE_ROUTE_READY__
  );
  expect(proof?.ready).toBe(true);
  expect(typeof proof?.backend).toBe("string");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, backend: proof?.backend }, null, 2)}\n`);
});
