import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";

/**
 * §14.4 (Mech Hangar): the hangar and pit are ONE union scene — lock-in drops
 * into the pit via `loading.sceneId === "pit"` with zero `setScene` rebuilds
 * (`loading.sceneSwaps === 0`). The `scenario=pit` drive parks the run in the
 * post-lock state deterministically; the check reads route evidence.
 */

const APP_DIR = "showcase-mech-hangar";
const ROUTE_FLAG = "route-mech-hangar";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;

test.describe("showcase-mech-hangar union-scene (§14.4)", () => {
  test("scenario=pit reports loading.sceneId=pit with sceneSwaps=0", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&scenario=pit`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      await page.waitForTimeout(2500);
      const loading = await page.evaluate(() =>
        JSON.parse(JSON.stringify(eval(EVIDENCE + ".loading"))) as {
          sceneId?: string;
          sceneSwaps?: number;
        });
      expect(loading.sceneId).toBe("pit");
      expect(loading.sceneSwaps).toBe(0);
      expect(errors.filter((e) => e.includes("error")), "page errors").toEqual([]);
    } finally {
      server.close();
    }
  });
});
