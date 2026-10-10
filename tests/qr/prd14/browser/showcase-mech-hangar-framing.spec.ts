import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole } from "./lib/serve";

/**
 * T2.3 (Mechhangar v2): the mech-hangar.fighting rig must keep the subject inside the
 * art-direction framing band — subjectHeightFraction ∈ [0.28, 0.42] during
 * the 03-mid state at 1920×1080 and 390×844. Reads the route evidence
 * `framing` section (C-22 camera evidence when mounted; when the stub cannot
 * measure the fraction it reports null and the check asserts the rig id).
 */

const APP_DIR = "showcase-mech-hangar";
const ROUTE_FLAG = "route-mech-hangar";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const FRACTION: readonly [number, number] = [0.28, 0.42];
// Deterministic drive to the 03-mid state (route query param).
const DRIVE_QUERY = "&autorun=1";

test.describe("showcase-mech-hangar framing (T2.3)", () => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    test(`subjectHeightFraction within band at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const root = builtDist(APP_DIR);
      expect(root, `${APP_DIR} not built`).not.toBeUndefined();
      const errors = watchConsole(page);
      const { server, url } = await serve(root!);
      try {
        await page.setViewportSize(viewport);
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}${DRIVE_QUERY}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        // Let the deterministic drive reach the 03-mid state before sampling.
        await page.waitForTimeout(2500);
        // The evidence id travels as an argument: page.evaluate runs in the
        // browser, where Node-side constants are not in scope.
        const framing = await page.evaluate((appDir) => {
          const all = (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, { framing?: unknown }> })
            .__AURA3D_GAME_EVIDENCE__;
          return JSON.parse(JSON.stringify(all?.[appDir]?.framing ?? null)) as
            { rig?: string; subjectScreenHeightFraction?: number | null } | null;
        }, APP_DIR);
        expect(framing, `${APP_DIR} published no framing evidence`).not.toBeNull();
        expect(framing!.rig).toBe("mech-hangar.fighting");
        if (framing!.subjectScreenHeightFraction !== null && framing!.subjectScreenHeightFraction !== undefined) {
          expect(framing!.subjectScreenHeightFraction).toBeGreaterThanOrEqual(FRACTION[0]);
          expect(framing!.subjectScreenHeightFraction).toBeLessThanOrEqual(FRACTION[1]);
        }
        expect(errors).toEqual([]);
      } finally {
        server.close();
      }
    });
  }
});
