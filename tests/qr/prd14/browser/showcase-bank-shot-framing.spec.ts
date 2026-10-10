import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * T2.3 (Bank Shot v2): the aim-orbit rig must keep the table subject inside
 * the art-direction framing band — subjectHeightFraction ∈ [0.2, 0.4] during
 * the 03-mid shot at 1920×1080 and 390×844. Reads the route evidence
 * `framing` section (C-22 camera evidence when mounted; when the stub cannot
 * measure the fraction it reports null and the check asserts the rig id).
 */

const APP_DIR = "showcase-bank-shot";
const ROUTE_FLAG = "route-bank-shot";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;
const FRACTION: readonly [number, number] = [0.2, 0.4];

test.describe("showcase-bank-shot framing (T2.3)", () => {
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    test(`subjectHeightFraction within band at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const root = builtDist(APP_DIR);
      expect(root, `${APP_DIR} not built`).not.toBeUndefined();
      const errors = watchConsole(page);
      const { server, url } = await serve(root!);
      try {
        await page.setViewportSize(viewport);
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        // Drive to the 03-mid state: charge + release a shot.
        await page.keyboard.down("Space");
        await page.waitForTimeout(700);
        await page.keyboard.up("Space");
        await page.waitForTimeout(400);
        const framing = await page.evaluate(() =>
          JSON.parse(JSON.stringify(eval(EVIDENCE + ".framing"))) as
            { rig?: string; subjectScreenHeightFraction?: number | null });
        expect(framing.rig).toBe("bank-shot.aim-orbit");
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
