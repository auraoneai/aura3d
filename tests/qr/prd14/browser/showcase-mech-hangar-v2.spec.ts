import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Mech Hangar v2): under `?a3d-qr=route-mech-hangar` the route must boot
 * to `playing` in the hangar, and under `?autorun=1` drive the real lock-in →
 * pit transition so loading.sceneId === "pit" lands, the scripted bout lands
 * combat.lastHit === "heavy" with fx.liveCount > 0, and
 * loading.fetchCount.mechHeroDecimated === 1 stays true throughout — all within
 * the §7.2.1 deadlines. Every shot passes canvasBlankCheck, keyboard-only AND
 * touch-only playthroughs work, visibilitychange pauses, and scenario URLs
 * share the same appliedLook.
 */

const APP_DIR = "showcase-mech-hangar";
const ROUTE_FLAG = "route-mech-hangar";
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

test.describe("showcase-mech-hangar v2 (T2.6)", () => {
  test.use({ hasTouch: true });

  test("boots to playing, autorun bout meets all conditions, canvas healthy", async ({ page }) => {
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
      await shot(page, "02-opening");

      // Autorun: lock at ~0.4 s → countdown (~1.2 s) → advance + strike script.
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 20_000);
      const started = Date.now();
      let allMet = false;
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        await page.waitForTimeout(250);
      }
      await shot(page, "04-action");
      expect(allMet, "§7.2.1 required conditions not reached by deadline").toBe(true);

      const sceneSwaps = await page.evaluate(() => eval(EVIDENCE + ".loading.sceneSwaps"));
      expect(sceneSwaps).toBe(0);
      const sceneId = await page.evaluate(() => eval(EVIDENCE + ".loading.sceneId"));
      expect(sceneId).toBe("pit");

      await shot(page, "03-mid");

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

  test("keyboard-only playthrough: digits+arrows build, Enter locks, K strikes", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);

      // Hangar: cycle arms, then lock.
      await page.keyboard.press("Digit2");
      await page.keyboard.press("ArrowRight");
      const selection = await page.evaluate(() => eval(EVIDENCE + ".hangar.selection.arms"));
      expect(selection).toBe(1);
      await page.keyboard.press("Enter");
      await expect.poll(async () =>
        page.evaluate(() => eval(EVIDENCE + ".loading.sceneId")), { timeout: 10_000 })
        .toBe("pit");

      // Wait out the countdown, then advance and throw heavies until one lands.
      const started = Date.now();
      let lastHitKind = "none";
      while (Date.now() - started < 25_000) {
        await page.keyboard.down("KeyD");
        await page.waitForTimeout(180);
        await page.keyboard.up("KeyD");
        await page.keyboard.press("KeyK");
        const hit = await page.evaluate(() => eval(EVIDENCE + ".combat.lastHit"));
        if (hit === "light" || hit === "heavy") { lastHitKind = hit as string; break; }
      }
      expect(lastHitKind, "no player strike landed").not.toBe("none");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: tap locks, zone taps strike", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const r = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const b = (c ?? document.body).getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      const tap = async (nx: number, ny: number, pid: number) => {
        await page.evaluate(({ x, y, w, h, nx, ny, pid }) => {
          const c = document.querySelector("canvas") ?? document.body;
          c.dispatchEvent(new PointerEvent("pointerdown", {
            pointerId: pid, bubbles: true,
            clientX: x + w * nx, clientY: y + h * ny
          }));
          c.dispatchEvent(new PointerEvent("pointerup", { pointerId: pid, bubbles: true }));
        }, { ...r, nx, ny, pid });
      };
      // Tap anywhere in hangar locks and enters the pit.
      await tap(0.5, 0.5, 51);
      await expect.poll(async () =>
        page.evaluate(() => eval(EVIDENCE + ".loading.sceneId")), { timeout: 10_000 })
        .toBe("pit");
      // Strike zone: upper-right of canvas = heavy.
      const started = Date.now();
      let lastHitKind = "none";
      while (Date.now() - started < 25_000) {
        await tap(0.75, 0.3, 52);
        await tap(0.85, 0.3, 53);
        const hit = await page.evaluate(() => eval(EVIDENCE + ".combat.lastHit"));
        if (hit === "light" || hit === "heavy") { lastHitKind = hit as string; break; }
        // held-left strip press to close range
        await page.evaluate(({ x, y, w, h }) => {
          const c = document.querySelector("canvas") ?? document.body;
          c.dispatchEvent(new PointerEvent("pointerdown", {
            pointerId: 54, bubbles: true, clientX: x + w * 0.35, clientY: y + h * 0.5
          }));
        }, r);
        await page.waitForTimeout(220);
        await page.evaluate(({ }) => {
          const c = document.querySelector("canvas") ?? document.body;
          c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 54, bubbles: true }));
        }, {});
      }
      const engaged = await page.evaluate(() => eval(EVIDENCE + ".run.touchEngaged"));
      expect(engaged).toBe(true);
      expect(lastHitKind, "no touch strike landed").not.toBe("none");
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("scenario URLs keep the same appliedLook", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const { server, url } = await serve(root!);
    try {
      for (const scenario of ["arena", "autorun"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}&scenario=${scenario}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        const look = await page.evaluate(() => {
          const l = eval(EVIDENCE + ".appliedLook") as Record<string, unknown>;
          const { applied, ...rest } = l;
          return rest;
        });
        expect(look.rigId).toBe("mech-hangar.fighting");
        expect(look.fov).toBe(52);
        if (scenario === "arena") {
          await expect.poll(async () =>
            page.evaluate(() => eval(EVIDENCE + ".loading.sceneId")), { timeout: 10_000 })
            .toBe("pit");
        }
        await shot(page, `scenario-${scenario}`);
      }
    } finally {
      server.close();
    }
  });
});
