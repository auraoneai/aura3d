import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const ASSETS = [
  "showcaseDetailedRaceCircuit", "showcaseRaceGameEnvironment", "showcaseIsometricRaceTrack",
  "showcaseSouthGardaTrack", "showcaseSmallCarRacingEnvironment", "showcaseHighpolySportsCar", "showcaseRaceCar",
  "showcasePlatformerWorldLevel", "showcaseFloatingIslandWorld", "showcaseReadablePlatformLevel",
  "showcaseRooftopParkourWorld", "showcaseRunnerRobot", "showcasePlatformRunnerHero", "showcaseStylizedMaleRunner",
  "showcaseKenneyNeonRaceCircuit", "showcaseKenneyRaceCarRed",
  "showcaseKenneyVerdantPlatformerWorld", "showcaseKenneyOobiPlatformerHero"
] as const;
const REPORT_DIR = "tests/reports/showcase-asset-screening";

test.describe("showcase game asset visual screening", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders distinct racing and platformer candidates", async ({ context }) => {
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    for (const assetId of ASSETS) {
      const page = await context.newPage();
      try {
        await page.goto(`${server.origin}/tests/browser/showcase-release-asset-probe-harness.html?asset=${assetId}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(window.__AURA3D_SHOWCASE_RELEASE_ASSET_PROBE__ || window.__AURA3D_SHOWCASE_RELEASE_ASSET_PROBE_ERROR__), undefined, { timeout: 30_000 });
        const result = await page.evaluate(() => ({ evidence: window.__AURA3D_SHOWCASE_RELEASE_ASSET_PROBE__, error: window.__AURA3D_SHOWCASE_RELEASE_ASSET_PROBE_ERROR__ }));
        expect(result.error, `${assetId} harness error`).toBeUndefined();
        expect(result.evidence?.diagnostics.drawCalls, `${assetId} draw calls`).toBeGreaterThan(0);
        await page.locator("#probe-stage canvas").screenshot({ path: `${REPORT_DIR}/${assetId}.png` });
      } finally { await page.close(); }
    }
  });
});
