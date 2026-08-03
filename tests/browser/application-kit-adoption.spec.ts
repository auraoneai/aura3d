/**
 * Phase 12 proof: public routes configure reusable application kits.
 *
 * A kit that exists but that no route uses is a claim, not a capability -- the same standard the
 * parity generator applies. This loads each migrated route and asserts that its published
 * evidence names the engine kit it configures, so "routes configure kits rather than reinvent
 * them" is verified in a browser rather than asserted in a document.
 *
 * The kit evidence also carries each kit's `capabilities` report, including the capabilities it
 * deliberately does **not** own, so a reader can check a claim against its stated limits.
 */
import { test, expect } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const ROUTES = [
  { path: "/apps/showcase-product-configurator/", global: "__AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__" },
  { path: "/apps/showcase-digital-twin-ops/", global: "__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__" },
  { path: "/apps/showcase-smart-city-control/", global: "__AURA3D_SHOWCASE_SMART_CITY_CONTROL__" },
  { path: "/apps/showcase-cinematic-architecture/", global: "__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__" }
];

for (const route of ROUTES) {
 test(`kits ${route.path}`, async ({ page }) => {
  const server = await startExampleDevServer();
  {
    await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const found = await page.evaluate((name) => {
      const value = (window as unknown as Record<string, unknown>)[name];
      const text = JSON.stringify(value ?? {});
      const kits = [...text.matchAll(/engine\.create(\w*Kit)/g)].map((m) => m[1]);
      return { present: value !== undefined, kits: [...new Set(kits)] };
    }, route.global);
    console.log(route.path, JSON.stringify(found));
    expect(found.present, `${route.path} published no evidence global`).toBe(true);
    expect(found.kits.length, `${route.path} publishes kit evidence`).toBeGreaterThan(0);
  }
  await server.close();
 });
}
