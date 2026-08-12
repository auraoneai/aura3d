import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * The opponent distinction must be reported truthfully and must come from authored geometry.
 * The player uses the textured CC0 Formula racer while the rival uses the separate CC-BY
 * blue/black Formula racer. Neither model is recoloured with a route-level whole-model tint.
 */
let server: ExampleDevServer;

test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test.describe("Turbo Drift Circuit opponent distinction", () => {
  test("reports the opponent distinction truthfully and keeps the hero off the broken asset", async ({ page }) => {
    test.setTimeout(150_000);
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`); });

    await page.setViewportSize({ width: 1440, height: 900 });
    // The route owns continuously rendered media and may keep browser/CDN
    // connections warm.  Global network idleness is not part of the public
    // readiness contract; the mounted/runtime assertions below are.  Waiting
    // for DOM content first keeps this proof deterministic without weakening
    // the evidence it requires from the actual opponent render.
    await page.goto(`${server.origin}/apps/showcase-turbo-drift-circuit/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__),
      null,
      { timeout: 60_000 }
    );
    await page.waitForTimeout(2_000);

    const evidence = await page.evaluate(() => {
      const target = window as unknown as Record<string, any>;
      const mounted = target.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
      return { distinction: mounted?.opponentDistinction, racing: mounted?.racing, status: mounted?.status };
    });

    expect(consoleErrors, "the route must mount without console errors or failed requests").toEqual([]);

    expect(evidence.distinction?.playerAsset).toBe("showcaseCc0FormulaRaceCar");
    expect(evidence.racing?.vehicleAsset).toBe("showcaseCc0FormulaRaceCar");
    expect(evidence.distinction?.opponentAsset).toBe("showcaseCcByFormulaOpponent");
    expect(evidence.racing?.opponentVehicleAsset).toBe("showcaseCcByFormulaOpponent");

    expect(evidence.distinction?.distinctAsset).toBe(true);
    expect(evidence.distinction?.distinctSilhouette).toBe(true);
    expect(evidence.distinction?.distinctionMode).toBe("distinct-authored-formula-racing-assets");
    expect(
      evidence.distinction?.reliesOnColorTintOnly,
      "the distinction must not depend on a route-level colour tint"
    ).toBe(false);
    expect(evidence.distinction?.sharedAssetJustification).toBeNull();

    // The opponent must still be a release-certified vehicle, not arbitrary set dressing.
    expect(evidence.distinction?.opponentAssetRole).toBe("vehicle");
    expect(evidence.distinction?.opponentAssetQuality).toBe("release");

    // The opponent must actually be bound to its own runtime node in the mounted scene.
    const opponentNodeBound = await page.evaluate(() => {
      const target = window as unknown as Record<string, any>;
      const mounted = target.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
      return mounted?.opponent?.controller;
    });
    expect(opponentNodeBound, "the reusable vehicle driver must still drive the opponent")
      .toBe("aura-vehicle-driver-ai");
  });
});
