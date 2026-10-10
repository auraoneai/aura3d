import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { join } from "node:path";

/**
 * T2.3 (Orbital Defense v2): the orbit rig must keep the planet inside the
 * art-direction framing band — subjectHeightFraction ∈ [0.65, 0.75] at
 * 1920×1080 and 390×844 — and `framing.dronesUnderHud` must stay 0 (the
 * §7.2.1 03-mid condition). Reads the route evidence `framing` section;
 * when the stub cannot measure the fraction it reports null and the check
 * asserts the rig id instead.
 */

const APP_DIR = "showcase-orbital-defense";
const ROUTE_FLAG = "route-orbital-defense";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;
const FRACTION: readonly [number, number] = [0.65, 0.75];

test.describe("showcase-orbital-defense framing (T2.3)", () => {

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    test(`planet framing + dronesUnderHud=0 at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const root = builtDist(APP_DIR);
      expect(root, `${APP_DIR} not built`).not.toBeUndefined();
      const errors = watchConsole(page);
      const { server, url } = await serve(root!);
      try {
        await page.setViewportSize(viewport);
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        // Let drones drift in a little, then read framing + HUD overlap.
        await page.waitForTimeout(2500);
        const framing = await page.evaluate(() =>
          JSON.parse(JSON.stringify(eval(EVIDENCE + ".framing"))) as {
            rig?: string;
            subjectScreenHeightFraction?: number | null;
            dronesUnderHud?: number;
          });
        expect(framing.rig).toBe("orbital-defense.orbit");
        expect(framing.dronesUnderHud).toBe(0);
        if (framing.subjectScreenHeightFraction !== null && framing.subjectScreenHeightFraction !== undefined) {
          expect(framing.subjectScreenHeightFraction).toBeGreaterThanOrEqual(FRACTION[0]);
          expect(framing.subjectScreenHeightFraction).toBeLessThanOrEqual(FRACTION[1]);
        }
        expect(errors).toEqual([]);
      } finally {
        server.close();
      }
    });
  }
});
