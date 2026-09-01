import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("Neon Corridor Strike reaches ready state with prototype route-health", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 60_000 }).toBe("true");
  const evidence = await page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  const ready = await page.evaluate(() => window.__AURA3D_ROUTE_READY__);
  expect(evidence?.claimLabel).toBe("prototype");
  expect(evidence?.typedAssets).toEqual(expect.arrayContaining(["neonCorridorContainmentWorld", "neonContainmentWardenA", "neonContainmentWardenB", "neonContainmentPulseRifle", "ammoCrate", "medkit"]));
  expect(evidence?.primitiveCount).toBeGreaterThanOrEqual(0);
  expect(evidence?.knownLimits?.length).toBeGreaterThan(0);
  expect(ready?.ready).toBe(true);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({
    ready: true,
    claimLabel: evidence?.claimLabel,
    rendererMode: evidence?.rendererMode,
    rendererFallback: evidence?.rendererFallback,
    typedAssets: evidence?.typedAssets,
    primitiveCount: evidence?.primitiveCount,
    knownLimits: evidence?.knownLimits
  }, null, 2)}\n`);
});
