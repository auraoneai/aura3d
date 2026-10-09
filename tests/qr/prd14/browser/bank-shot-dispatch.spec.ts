import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { join } from "node:path";

/**
 * T1.10 (Bank Shot): the route-flag dispatcher boots legacy by default and v2
 * under `?a3d-qr=route-bank-shot`. Flag-off keeps the same evidence global and
 * zero console errors; flag-on reaches `__AURA3D_GAME__.state === "playing"`.
 */

const APP_DIR = "showcase-bank-shot";
const ROUTE_FLAG = "route-bank-shot";
const EVIDENCE_GLOBAL = "__BANK_SHOT_EVIDENCE__";
// Top-level keys the legacy route published before the T1.10 tree move.
const LEGACY_EVIDENCE_KEYS = [
  "aimAngle", "appId", "audioCues", "backend", "ballsRemaining", "charging",
  "charge", "claimBoundary", "clockMs", "comboStreak", "controls",
  "evidenceScenario", "frameCount", "lastShot", "lastShotObject",
  "liveBallCount", "mountedAtEpochMs", "physicsBodyCount",
  "physicsLiveBallCount", "potted", "rackClockLimitMs", "renderer",
  "resetHashMatch", "resolvedNodeHandles", "sensorEventCount",
  "sessionComplete", "shotCount", "shotHash", "spin", "suitCleared",
  "ballsRemainingInSuit", "systems"
] as const;

test.describe("bank-shot dispatch (T1.10)", () => {

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
      // The v2 beacon must NOT publish under flag-off.
      const v2 = await page.evaluate(() => (window as Record<string, unknown>).__AURA3D_GAME__);
      expect(v2).toBeUndefined();
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("`?a3d-qr=route-bank-shot` boots v2 to state playing", async ({ page }) => {
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
