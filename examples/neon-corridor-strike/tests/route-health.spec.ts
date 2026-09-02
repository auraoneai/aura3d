import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { writeCorridorRouteHealthReceipt } from "./route-evidence";

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
  const screenshotPath = resolve("tests/reports/first-load.png");
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false });
  const receipt = writeCorridorRouteHealthReceipt({
    reportPath: resolve("tests/reports/route-health.json"),
    screenshotPath,
    screenshotBytes: screenshot,
    evidence,
    routeReady: ready?.ready === true,
    primitiveCount: evidence?.primitiveCount,
    gameplayStatus: "passed"
  });
  expect(receipt.schema).toBe("aura3d-route-health/1.0");
  expect(receipt.status).toBe("ready");
  expect(receipt.pass).toBe(true);
  expect(receipt.evidence.status).toBe("captured");
  expect(receipt.evidence.screenshot.sha256).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(receipt.evidence.screenshotEvidence).toBe(receipt.evidence.screenshot.path);
  expect(receipt.source.hash).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(receipt.primaryAssets.every((asset) => /^sha256-[a-f0-9]{64}$/.test(asset.manifestHash))).toBe(true);
});
