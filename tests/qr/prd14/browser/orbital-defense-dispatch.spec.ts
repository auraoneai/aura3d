import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { join } from "node:path";

/**
 * T1.10 (Orbital Defense): the route-flag dispatcher boots legacy by default
 * and v2 under `?a3d-qr=route-orbital-defense`. Flag-off keeps the same
 * evidence global and zero console errors; flag-on reaches
 * `__AURA3D_GAME__.state === "playing"`.
 */

const APP_DIR = "showcase-orbital-defense";
const ROUTE_FLAG = "route-orbital-defense";
const EVIDENCE_GLOBAL = "__AURA3D_SHOWCASE_ORBITAL_DEFENSE__";
// Top-level keys the legacy route published before the T1.10 tree move.
const LEGACY_EVIDENCE_KEYS = [
  "status", "appId", "frameCount", "score", "wave", "planetIntegrity",
  "heat", "activeEnemies", "activeProjectiles", "replayChecksum",
  "controls", "systems", "claimBoundary"
] as const;

test.describe("orbital-defense dispatch (T1.10)", () => {

  test("flag off boots legacy with the same evidence keys and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/`);
      await expect.poll(() =>
        page.evaluate((g) => Boolean((window as Record<string, unknown>)[g]), EVIDENCE_GLOBAL),
        { timeout: 30_000 }).toBe(true);
      const keys = await page.evaluate(
        (g) => Object.keys((window as Record<string, unknown>)[g] as object), EVIDENCE_GLOBAL);
      for (const key of LEGACY_EVIDENCE_KEYS) {
        expect(keys, `legacy evidence key "${key}" missing after the move`).toContain(key);
      }
      const v2 = await page.evaluate(() => (window as Record<string, unknown>).__AURA3D_GAME__);
      expect(v2).toBeUndefined();
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("`?a3d-qr=route-orbital-defense` boots v2 to state playing", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() =>
        page.evaluate(() => (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined),
        { timeout: 30_000 }).toBe(true);
      const state = await page.evaluate(() =>
        ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string }).state);
      expect(state).toBe("playing");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
