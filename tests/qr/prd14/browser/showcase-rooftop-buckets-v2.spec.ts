import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Rooftop Buckets v2): under `?a3d-qr=route-rooftop-buckets` the route
 * must boot to `playing`, run the scripted timeline with zero console/page
 * errors, reach every §7.2.1 required condition by deadline (a made shot with
 * both skinned athletes applied + charge meter > 0.5), pass canvasBlankCheck
 * on every shot, accept keyboard-only AND touch-only play (hold/release Space
 * or press/release to charge + shoot), pause on visibilitychange, and expose
 * the same appliedLook on every scenario URL. Browser specs run remote-only
 * (lane workflow / macos-14).
 */

const APP_DIR = "showcase-rooftop-buckets";
const ROUTE_FLAG = "route-rooftop-buckets";
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

/** Hold Space to charge to ~sweetPower (0.6 at 1.6/s ping-pong ≈ 375 ms). */
async function shootAtSweetSpot(page: Page, ms = 390) {
  await page.keyboard.down("Space");
  await page.waitForTimeout(ms);
  await page.keyboard.up("Space");
}

test.describe("showcase-rooftop-buckets v2 (T2.6)", () => {
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

      // §7.2.1 timeline: charge past 0.5, release at sweetPower — flight,
      // contacts, and scoring all run through the real solver.
      await shootAtSweetSpot(page);
      await page.waitForTimeout(400);
      await shot(page, "02-opening");

      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 20_000);
      const started = Date.now();
      let allMet = false;
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        const shotState = await page.evaluate(() =>
          eval(EVIDENCE + ".shot") as { inFlight?: boolean; result?: string | null } | undefined);
        if (!shotState?.inFlight) {
          // Re-shoot until a make lands (moving-hoop sway can rim-out a look).
          await shootAtSweetSpot(page);
        }
        await page.waitForTimeout(250);
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

  test("keyboard-only playthrough: charge + release starts a flight", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      await shootAtSweetSpot(page);
      await expect.poll(async () => page.evaluate(() =>
        (eval(EVIDENCE + ".shot") as { inFlight?: boolean; meter?: number })?.inFlight ?? false),
        { timeout: 10_000, intervals: [200] }).toBe(true);
      // Spot change via ArrowRight keeps the route playable without a pointer.
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      const ev = await readEvidence(page);
      expect(ev).toBeTruthy();
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: press-and-hold charges, release shoots", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const box = await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      // aim-drag: press, hold to charge, release to shoot.
      const cx = box.x + box.w * 0.5;
      const cy = box.y + box.h * 0.55;
      await page.touchscreen.tap(cx, cy); // wake + first gesture
      await page.waitForTimeout(200);
      // Long-press via touch: dispatch pointer events (tap holds don't exist).
      await page.evaluate(([x, y]) => {
        const el = document.getElementById("app") ?? document.body;
        el.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
      }, [cx, cy]);
      await page.waitForTimeout(420);
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      });
      await expect.poll(async () => page.evaluate(() =>
        (eval(EVIDENCE + ".shot") as { inFlight?: boolean })?.inFlight ?? false),
        { timeout: 10_000, intervals: [200] }).toBe(true);
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
      for (const scenario of ["charged", "made", "brick"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}&scenario=${scenario}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        const scenarioLook = await page.evaluate(() =>
          JSON.stringify(eval(EVIDENCE + ".appliedLook")));
        expect(scenarioLook).toBe(playLook);
      }
    } finally {
      server.close();
    }
  });
});
