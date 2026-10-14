import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("Gravity Post actual typed planet bodies", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server?.close(); });
  test("five textured model bodies render on the actual planning board", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-gravity-post/?planetProbe=1`);
    await page.waitForFunction(() => Boolean((window as any).__GRAVITY_POST_PLANET_PROBE__), undefined, { timeout: 120_000 });
    const capture = (visible: boolean) => page.evaluate((value) => (window as any).__GRAVITY_POST_PLANET_PROBE__.capture(value), visible);
    const on = await capture(true);
    const off = await capture(false);
    const repeated = await capture(true);
    expect(on.planets.map((p: any) => p.id)).toEqual(["cinder", "verdance", "aquaria", "rust", "gale"]);
    for (const planet of on.planets) {
      expect(planet.imported.assetId).toMatch(/^gravityPlanet/);
      expect(planet.imported.renderItemCount).toBeGreaterThan(0);
      expect(planet.node.kind).toBe("model");
    }
    expect(on.diagnostics.renderer.runtime.backend).toBe("production-runtime");
    let changed = 0;
    for (let i = 0; i < on.pixels.length; i += 4) {
      const d = Math.abs(on.pixels[i] - off.pixels[i]) + Math.abs(on.pixels[i + 1] - off.pixels[i + 1]) + Math.abs(on.pixels[i + 2] - off.pixels[i + 2]);
      if (d > 6) changed++;
    }
    expect(changed, "typed bodies must contribute actual application pixels").toBeGreaterThan(100);
    expect(repeated.pixels, "suppression must be reversible at fixed simulation time").toEqual(on.pixels);
    await testInfo.attach("typed-planets", { body: JSON.stringify({ planets: on.planets, diagnostics: on.diagnostics, changedPixels: changed }), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("gravity-typed-planets.png") });
  });
});
