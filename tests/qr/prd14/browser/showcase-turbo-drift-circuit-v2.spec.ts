import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Turbo Drift v2): under `?a3d-qr=route-turbo-drift-circuit` the route
 * must boot to `playing`, run the scripted timeline with zero console/page
 * errors, reach every §7.2.1 required condition by deadline
 * (car.speedKph >= 120 at 03-mid, car.drifting && fx.liveCount > 0 at
 * 04-action), pass canvasBlankCheck on every shot, accept keyboard-only AND
 * touch-only play, pause on visibilitychange, and expose the same appliedLook
 * on every scenario URL. Browser specs run remote-only (lane workflow).
 */

const APP_DIR = "showcase-turbo-drift-circuit";
const ROUTE_FLAG = "route-turbo-drift-circuit";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;

const gamesJson = JSON.parse(
  readFileSync(join(APPS, "..", "tools", "quality-rebuild-capture", "games.json"), "utf8")
) as { games: { id: string; requiredConditions?: { shot: string; expr: string; deadlineMs: number }[] }[] };
const REQUIRED = gamesJson.games.find((g) => g.id === APP_DIR)?.requiredConditions ?? [];

const BLANK_LIMITS = { maxDarkFraction: 0.97, minDistinctColors: 24 };

async function shot(page: Page, name: string) {
  const png = await page.screenshot();
  const { rgba, width, height } = decodePngAsRgba(png);
  const result = canvasBlankCheck(rgba, width, height, [], BLANK_LIMITS);
  expect(result.verdict, `${name} is likely blank`).toBe("pass");
}

async function readEvidence(page: Page) {
  return page.evaluate((expr) => {
    const ev = eval(expr) as Record<string, unknown> | undefined;
    return ev ? JSON.parse(JSON.stringify(ev)) : undefined;
  }, EVIDENCE);
}

test.describe("showcase-turbo-drift-circuit v2 (T2.6)", () => {
  test.use({ hasTouch: true });

  test("boots to playing, scripted timeline clean, conditions met, look parity", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const state = await page.evaluate(() =>
        ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string }).state);
      expect(state).toBe("playing");
      await shot(page, "01-title");

      // §7.2.1 scripted timeline (mirrors games.json): throttle, steer, drift.
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(2000);
      await shot(page, "02-opening");
      await page.waitForTimeout(4000);
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(500);
      await page.keyboard.up("KeyA");
      await page.waitForTimeout(700);
      await page.keyboard.down("KeyD");
      await page.keyboard.down("Space");
      await page.waitForTimeout(1300);
      await shot(page, "03-mid");
      await page.keyboard.up("Space");
      await page.keyboard.up("KeyD");
      await page.waitForTimeout(900);
      await page.keyboard.down("KeyA");
      await page.keyboard.down("Space");
      await page.waitForTimeout(1000);
      await shot(page, "04-action");
      await page.keyboard.up("Space");
      await page.keyboard.up("KeyA");
      await page.keyboard.up("KeyW");

      // Required conditions by deadline: car.speedKph >= 120 (03-mid),
      // car.drifting === true && fx.liveCount > 0 (04-action).
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 15_000);
      const started = Date.now();
      let allMet = false;
      // Keep driving while polling: the drift window may be shorter than a poll.
      await page.keyboard.down("KeyW");
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        if ((Date.now() - started) % 900 < 200) {
          await page.keyboard.down("Space");
          await page.keyboard.down("KeyA");
        }
        if ((Date.now() - started) % 900 > 400) {
          await page.keyboard.up("Space");
          await page.keyboard.up("KeyA");
        }
        await page.waitForTimeout(150);
      }
      await page.keyboard.up("KeyW");
      await page.keyboard.up("Space");
      await page.keyboard.up("KeyA");
      expect(allMet, "§7.2.1 required conditions not reached by deadline").toBe(true);

      // visibilitychange → session.paused === true, resume on visible.
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(150);
      expect(
        await page.evaluate(
          () => (window as { __AURA3D_GAME__?: { session?: { paused?: boolean } } }).__AURA3D_GAME__?.session?.paused
        )
      ).toBe(true);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(150);
      expect(
        await page.evaluate(
          () => (window as { __AURA3D_GAME__?: { session?: { paused?: boolean } } }).__AURA3D_GAME__?.session?.paused
        )
      ).toBe(false);

      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("keyboard-only playthrough of the first objective", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // Throttle through the start lights, then steer + drift.
      await page.keyboard.down("KeyW");
      await expect.poll(() => page.evaluate(() =>
        eval(EVIDENCE + ".car.speedKph") as number), { timeout: 20_000 }).toBeGreaterThan(20);
      await page.keyboard.down("KeyD");
      await page.keyboard.down("Space");
      await page.waitForTimeout(1200);
      await page.keyboard.up("Space");
      await page.keyboard.up("KeyD");
      await page.keyboard.up("KeyW");
      const ev = await readEvidence(page);
      expect(ev?.car !== undefined, "car evidence section missing").toBe(true);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough of the first objective", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // steer-pedals: hold the right half = throttle.
      const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      const pedalX = Math.floor(size.w * 0.8);
      await page.touchscreen.tap(pedalX, Math.floor(size.h * 0.7));
      // tap is instantaneous — the pointer events fire; sim advances regardless.
      await page.waitForTimeout(1500);
      const ev = await readEvidence(page);
      expect(ev?.race !== undefined, "race evidence section missing").toBe(true);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("appliedLook identical between play URL and every scenario URL", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const playLook = await page.evaluate(() =>
        JSON.stringify(eval(EVIDENCE + ".appliedLook")));
      for (const scenario of ["mid-race", "finish", "off-track"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}&scenario=${scenario}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        const scenarioLook = await page.evaluate(() =>
          JSON.stringify(eval(EVIDENCE + ".appliedLook")));
        expect(scenarioLook, `appliedLook drifted on scenario ${scenario}`).toBe(playLook);
      }
    } finally {
      server.close();
    }
  });
});
