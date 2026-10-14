import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * T1.10 (Pulse Tunnel): the route-flag dispatcher boots legacy by default and v2
 * under `?a3d-qr=route-pulse-tunnel`. Flag-off keeps the same evidence global and
 * zero console errors; flag-on reaches `__AURA3D_GAME__.state === "playing"`
 * and publishes `__AURA3D_GAME_EVIDENCE__["showcase-pulse-tunnel"]`.
 */

const APP_DIR = "showcase-pulse-tunnel";
const ROUTE_FLAG = "route-pulse-tunnel";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const EVIDENCE_GLOBAL = "__PULSE_TUNNEL_EVIDENCE__";

test.describe("pulse-tunnel dispatch (T1.10)", () => {
  test("flag off boots legacy with its evidence global and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/`);
      await expect.poll(() =>
        page.evaluate((g) => Boolean((window as Record<string, unknown>)[g]), EVIDENCE_GLOBAL),
        { timeout: 30_000 }).toBe(true);
      // The v2 beacon must NOT publish under flag-off.
      const v2 = await page.evaluate(() => (window as Record<string, unknown>).__AURA3D_GAME__);
      expect(v2).toBeUndefined();
      await soakIfNeeded(page);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("`?a3d-qr=route-pulse-tunnel` boots v2 to state playing with the real impl", async ({ page }) => {
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
      // Real C-24 impl publishes per-route evidence under the games.json
      // evidenceGlobal (FLAG-2).
      const evidence = await page.evaluate((app) =>
        ((window as Record<string, unknown>).__AURA3D_GAME_EVIDENCE__ as Record<string, unknown> | undefined)?.[app],
        APP_DIR);
      expect(evidence, "v2 evidence section missing").toBeTruthy();
      await soakIfNeeded(page);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
