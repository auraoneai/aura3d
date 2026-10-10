import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";

/**
 * §14.4 (Siege Golf): one scene per hole — a full shot (charge, strike, settle)
 * must complete with `loading.sceneSwaps === 0` (aim/flight/settle are rigs and
 * handle updates inside the hole scene, never scene rebuilds). Autorun plays the
 * canonical shot; the check waits for `shot.strokes >= 1` so a real strike is
 * proven, then asserts the swap counter stayed at zero.
 */

const APP_DIR = "showcase-siege-golf";
const ROUTE_FLAG = "route-siege-golf";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;

test.describe("showcase-siege-golf sceneSwaps=0 across a shot (§14.4)", () => {
  test("autorun shot completes without a scene rebuild", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&autorun=1`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // Autorun must actually take a stroke — don't accept a trivially-zero counter.
      await expect.poll(() => page.evaluate(() =>
        eval(EVIDENCE + ".shot")?.strokes ?? 0), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
      const loading = await page.evaluate(() =>
        JSON.parse(JSON.stringify(eval(EVIDENCE + ".loading"))) as {
          sceneSwaps?: number;
        });
      expect(loading.sceneSwaps).toBe(0);
      expect(errors.filter((e) => e.includes("error")), "page errors").toEqual([]);
    } finally {
      server.close();
    }
  });
});
