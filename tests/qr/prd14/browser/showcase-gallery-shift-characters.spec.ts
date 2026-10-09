import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";

/**
 * §14.4 (Gallery Shift): the thief is driven by the C-19 animation controller —
 * `characters.thiefTracksApplied > 0` proves at least one animation track was
 * applied to the runtime node after `bindRuntimeNode` fired on ready.
 */

const APP_DIR = "showcase-gallery-shift";
const ROUTE_FLAG = "route-gallery-shift";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;

test.describe("showcase-gallery-shift animated thief (§14.4)", () => {
  test("characters.thiefTracksApplied > 0 once the route is live", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // The binding applies the default idle clip on the first post-ready
      // frame; poll until the evidence reports it.
      await expect.poll(() => page.evaluate(() =>
        JSON.parse(JSON.stringify(eval(EVIDENCE + ".characters"))) as {
          thiefTracksApplied?: number;
        }).thiefTracksApplied ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
      expect(errors.filter((e) => e.includes("error")), "page errors").toEqual([]);
    } finally {
      server.close();
    }
  });
});
