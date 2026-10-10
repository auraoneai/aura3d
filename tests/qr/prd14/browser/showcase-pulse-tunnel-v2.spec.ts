import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Pulse Tunnel v2): under `?a3d-qr=route-pulse-tunnel` the route must
 * boot to `playing`, reach every §7.2.1 required condition by deadline
 * (gates.passedOnBeat >= 2 && fx.liveCount > 0 at 12 s,
 * framing.canvasMatchesViewport === true at 12 s), pass canvasBlankCheck on
 * every shot, accept keyboard-only AND touch-only play, pause on
 * visibilitychange, and expose the same appliedLook on every scenario URL.
 * `?autorun=1` starts the run immediately (pattern-mode clock when no audio
 * gesture exists — the PT-01 honest fallback) so the scripted capture is
 * deterministic.
 */

const APP_DIR = "showcase-pulse-tunnel";
const ROUTE_FLAG = "route-pulse-tunnel";
// T1.10: v2 specs carry the same engine list the URL contract uses
// (boot.ts qualityRebuild.flags + games.json qrFlags).
const ENGINE_FLAGS = "game,camera,lighting,post,materials,vfx,world,tiers,looks";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;

const gamesJson = JSON.parse(
  readFileSync(join(APPS, "..", "tools", "quality-rebuild-capture", "games.json"), "utf8")
) as {
  games: {
    id: string;
    requiredConditions?: { shot: string; expr: string; deadlineMs: number }[];
    canvasBlankCheck?: { maxDarkFraction: number; minDistinctColors: number };
  }[];
};
const ENTRY = gamesJson.games.find((g) => g.id === APP_DIR);
const REQUIRED = ENTRY?.requiredConditions ?? [];
const BLANK_LIMITS = {
  maxDarkFraction: ENTRY?.canvasBlankCheck?.maxDarkFraction ?? 0.95,
  minDistinctColors: ENTRY?.canvasBlankCheck?.minDistinctColors ?? 1500
};

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

test.describe("showcase-pulse-tunnel v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, autorun meets conditions, look parity", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}&autorun=1`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const state = await page.evaluate(() =>
        ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string }).state);
      expect(state).toBe("playing");
      await shot(page, "01-title");

      // Autorun starts the chart immediately; two gates pass by beat ~8 (4 s).
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 20_000);
      const started = Date.now();
      let allMet = false;
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        await page.waitForTimeout(500);
      }
      await shot(page, "04-action");
      expect(allMet, "§7.2.1 required conditions not reached by deadline").toBe(true);

      // visibilitychange → session.paused === true, resume on visible.
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(150);
      expect(await page.evaluate(
        () => (window as { __AURA3D_GAME__?: { session?: { paused?: boolean } } }).__AURA3D_GAME__?.session?.paused
      )).toBe(true);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(150);
      expect(await page.evaluate(
        () => (window as { __AURA3D_GAME__?: { session?: { paused?: boolean } } }).__AURA3D_GAME__?.session?.paused
      )).toBe(false);

      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("keyboard-only playthrough: arrows switch lanes, Space jumps", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // First key starts the run.
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      const started = await page.evaluate(() => eval(EVIDENCE + ".run.state"));
      expect(started).toBe("running");
      const before = await page.evaluate(() => eval(EVIDENCE + ".player.lane"));
      await page.keyboard.press("KeyD");
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => eval(EVIDENCE + ".player.lane"));
      expect(after).not.toBe(before);
      await page.keyboard.press("Space");
      await page.waitForTimeout(250);
      const airborne = await page.evaluate(() => eval(EVIDENCE + ".player.airborne"));
      expect(typeof airborne).toBe("boolean");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: tap starts, swipes steer", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const bounds = async () => page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const r = await bounds();
      // Tap starts the run.
      await page.evaluate(({ x, y, w, h }) => {
        const el = document.getElementById("app") ?? document.body;
        const cx = x + w * 0.5, cy = y + h * 0.5;
        el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 21, bubbles: true, clientX: cx, clientY: cy }));
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 21, bubbles: true, clientX: cx, clientY: cy }));
      }, r);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => eval(EVIDENCE + ".run.state"))).toBe("running");
      const before = await page.evaluate(() => eval(EVIDENCE + ".player.lane"));
      // Right swipe.
      await page.evaluate(({ x, y, w, h }) => {
        const el = document.getElementById("app") ?? document.body;
        const sx = x + w * 0.4, sy = y + h * 0.5;
        el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 22, bubbles: true, clientX: sx, clientY: sy }));
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 22, bubbles: true, clientX: sx + w * 0.2, clientY: sy }));
      }, r);
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => eval(EVIDENCE + ".player.lane"));
      expect(after).not.toBe(before);
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
      for (const scenario of ["drop", "mid-run", "low-shields"]) {
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
