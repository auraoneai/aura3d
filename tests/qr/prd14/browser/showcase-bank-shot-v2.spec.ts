import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Bank Shot v2): under `?a3d-qr=route-bank-shot` the route must boot to
 * `playing`, run the scripted timeline with zero console/page errors, reach
 * every §7.2.1 required condition by deadline, pass canvasBlankCheck on every
 * shot, accept keyboard-only AND touch-only play of the first objective,
 * pause on visibilitychange, and expose the same appliedLook on every
 * scenario URL. Browser specs run remote-only (lane workflow / macos-14).
 */

const APP_DIR = "showcase-bank-shot";
const ROUTE_FLAG = "route-bank-shot";
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

test.describe("showcase-bank-shot v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, scripted timeline clean, conditions met, look parity", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const state = await page.evaluate(() =>
        ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string }).state);
      expect(state).toBe("playing");
      await shot(page, "01-title");

      // §7.2.1 scripted timeline (mirrors games.json): hold Space, aim, strike.
      await page.waitForTimeout(300);
      await page.keyboard.down("Space");
      await page.waitForTimeout(850);
      await page.keyboard.up("Space");
      await page.waitForTimeout(500);
      await shot(page, "02-opening");
      await page.waitForTimeout(4600);
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(400);
      await page.keyboard.up("KeyD");
      await page.keyboard.down("Space");
      await page.waitForTimeout(700);
      await shot(page, "05-charge");
      await page.keyboard.up("Space");
      await page.waitForTimeout(400);
      await shot(page, "03-mid");

      // Required conditions by deadline: pottedThisShot >= 1, maxAngularSpeed > 0.
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 15_000);
      const started = Date.now();
      let allMet = false;
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        await page.waitForTimeout(150);
      }
      await shot(page, "04-action");
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
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // Aim via arrows, charge via Space, release to strike.
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(300);
      await page.keyboard.up("ArrowRight");
      await page.keyboard.down("Space");
      await page.waitForTimeout(600);
      await page.keyboard.up("Space");
      await expect.poll(() => page.evaluate(() =>
        eval(EVIDENCE + ".table.phase") as string), { timeout: 15_000 }).toBe("shooting");
      // Settle back to a non-shooting phase within 20 s.
      await expect.poll(() => page.evaluate(() =>
        eval(EVIDENCE + ".table.phase") as string), { timeout: 20_000 }).not.toBe("shooting");
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
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // Tap to arm the charge, tap again to strike (aim-drag preset semantics).
      await page.touchscreen.tap(400, 400);
      await page.waitForTimeout(400);
      await page.touchscreen.tap(400, 400);
      await expect.poll(() => page.evaluate(() =>
        eval(EVIDENCE + ".table.phase") as string), { timeout: 15_000 }).toBe("shooting");
      await expect.poll(() => page.evaluate(() =>
        eval(EVIDENCE + ".table.phase") as string), { timeout: 20_000 }).not.toBe("shooting");
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
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const playLook = await page.evaluate(() =>
        JSON.stringify(eval(EVIDENCE + ".appliedLook")));
      for (const scenario of ["pocket", "foul", "eight-finish", "rack-fail"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&scenario=${scenario}`);
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
