import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * T1.10 (Aura Clash Arena): the route-flag dispatcher boots legacy by default
 * and v2 under `?a3d-qr=route-aura-clash`. Flag-off keeps the same evidence
 * global and zero console errors; flag-on reaches
 * `__AURA3D_GAME__.state === "playing"`.
 */

const APP_DIR = "aura-clash-showcase";
const ROUTE_FLAG = "route-aura-clash";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const EVIDENCE_GLOBAL = "__AURA_CLASH_ARENA_PROOF__";
// Top-level keys the legacy route published before the T1.10 tree move.
const LEGACY_EVIDENCE_KEYS = [
  "schemaVersion", "route", "app", "release", "version", "status", "error",
  "frame", "roundTime", "totalHits", "lastHitFrame", "callout",
  "visibleFighterAsset", "fighterAssets", "noPrimitiveFighters", "physics",
  "renderer"
] as const;

test.describe("aura-clash dispatch (T1.10)", () => {
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

  test("`?a3d-qr=route-aura-clash` boots v2 to state playing", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
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
