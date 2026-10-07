import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * T1.10 (Turbo Drift Circuit): the route-flag dispatcher boots legacy by default
 * and v2 under `?a3d-qr=route-turbo-drift-circuit`. Flag-off keeps the same
 * evidence global and zero console errors; flag-on reaches
 * `__AURA3D_GAME__.state === "playing"`.
 */

const APP_DIR = "showcase-turbo-drift-circuit";
const ROUTE_FLAG = "route-turbo-drift-circuit";
const EVIDENCE_GLOBAL = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";
// Top-level keys the legacy route published before the T1.10 tree move.
const LEGACY_EVIDENCE_KEYS = [
  "schema", "appId", "status", "controls", "systems", "claimBoundary",
  "physics", "runtimeEvidence", "diagnostics", "boost", "gameFeel",
  "vehicleChassis", "vehicleContact"
] as const;

test.describe("turbo-drift dispatch (T1.10)", () => {
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

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

  test("`?a3d-qr=route-turbo-drift-circuit` boots v2 to state playing", async ({ page }) => {
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
