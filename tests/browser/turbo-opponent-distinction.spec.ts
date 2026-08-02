import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * The opponent distinction must be reported truthfully, including when it is weak.
 *
 * History matters here. The opponent was originally the player's own `showcaseTexturedSportsCar` under
 * a flat colour override, so "distinguishable" was pure hue on an identical silhouette. It was then
 * pointed at `showcaseCityVehicle`, which *was* a genuine silhouette difference.
 *
 * Then the player hero itself had to change: `showcaseTexturedSportsCar` is structurally broken in its
 * own isolated release probe -- four tyres modelled detached from the hull on stalks at truck scale,
 * plus an untextured brown cockpit -- which no route framing can fix. `showcaseCityVehicle` is the only
 * release-certified, textured, correctly-proportioned car in the catalog, so it became the player asset.
 *
 * That leaves both cars on the same model, because no second such asset exists:
 * `showcaseKenneyRaceCarRed` and `showcaseCleanSportsCar` both ship 0 textures, and `assets search`
 * returns only a low-poly CC0 prop. So this suite deliberately asserts the **weaker** truth
 * (`distinctAsset: false`, a livery+scale variant, with a stated justification) rather than letting the
 * route keep claiming a distinct silhouette it no longer has. A test that demanded
 * `distinctSilhouette: true` here would only be satisfiable by re-introducing the broken asset.
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
    await page.goto(`${server.origin}/apps/showcase-turbo-drift-circuit/`, { waitUntil: "networkidle" });
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

    // The player must be the well-built asset, never the probe-confirmed broken one.
    expect(evidence.distinction?.playerAsset, "the hero must not regress to the broken sports-car asset")
      .toBe("showcaseCityVehicle");
    expect(evidence.racing?.vehicleAsset).toBe("showcaseCityVehicle");

    // The distinction is reported honestly, not favourably.
    expect(evidence.distinction?.distinctAsset).toBe(false);
    expect(evidence.distinction?.distinctSilhouette).toBe(false);
    expect(evidence.distinction?.distinctionMode).toBe("livery-and-scale-variant");
    expect(
      evidence.distinction?.reliesOnColorTintOnly,
      "a livery variant must admit that it is one"
    ).toBe(true);

    // A shared asset is only acceptable with a stated reason, so the tradeoff is visible to a reviewer.
    expect(
      String(evidence.distinction?.sharedAssetJustification ?? ""),
      "a shared-asset distinction must carry its justification"
    ).toMatch(/single material/i);

    // The opponent must still be a release-certified vehicle, not arbitrary set dressing.
    expect(evidence.distinction?.opponentAssetRole).toBe("vehicle");
    expect(evidence.distinction?.opponentAssetQuality).toBe("release");

    // The opponent must actually be bound to its own runtime node in the mounted scene.
    const opponentNodeBound = await page.evaluate(() => {
      const target = window as unknown as Record<string, any>;
      const mounted = target.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__;
      return mounted?.opponent?.controller;
    });
    expect(opponentNodeBound, "the route-local deterministic opponent controller must still drive it")
      .toBe("route-local-deterministic-opponent-ai");
  });
});
