import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Aura3D mini game reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 15_000 }).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const diagnostics = await page.evaluate(() => (window as unknown as { __AURA3D_ROUTE_READY__?: { diagnostics?: { backend?: string } } }).__AURA3D_ROUTE_READY__?.diagnostics);
  expect(diagnostics?.backend).toBe("webgl2");
  expect(drawCalls).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, backend: diagnostics?.backend, drawCalls }, null, 2)}\n`);
});
