import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Blockfall Reactor v2): under `?a3d-qr=route-blockfall-reactor` the
 * route must boot to `playing`, reach both §7.2.1 required conditions by
 * deadline (board.stackHeight >= 4 from the seeded opening stack;
 * board.linesClearedThisRound >= 1 && fx.liveCount > 0 once the 60 s
 * demonstration replay lands its first clear — all within 20 s under
 * ?autorun=1), pass canvasBlankCheck on every shot, accept keyboard-only AND
 * touch-only play, pause on visibilitychange, and expose the same appliedLook
 * on every scenario URL.
 */

const APP_DIR = "showcase-blockfall-reactor";
const ROUTE_FLAG = "route-blockfall-reactor";
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

test.describe("showcase-blockfall-reactor v2 (T2.6)", () => {
  test.use({ hasTouch: true });

  test("boots to playing, autorun replay meets both conditions, canvas healthy", async ({ page }) => {
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

      // The 60 s demonstration replay drives real moves/rotates/hard-drops;
      // the seeded stack already satisfies stackHeight >= 4 and its first
      // scripted clear satisfies linesClearedThisRound >= 1 with fx live.
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 12_000);
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
      await shot(page, "03-mid");

      // Instanced-pool parity: the projected board view must equal kit state.
      const parity = await page.evaluate(() => eval(EVIDENCE + ".boardView.lastParityMatch"));
      expect(parity).toBe(true);
      const sceneSwaps = await page.evaluate(() => eval(EVIDENCE + ".loading.sceneSwaps"));
      expect(sceneSwaps).toBe(0);

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

  test("keyboard-only playthrough: arrows move, Z/X rotate, Space hard-drops, C holds", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const before = await page.evaluate(() => eval(EVIDENCE + ".board.piecesPlaced"));
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("KeyZ");
      await page.keyboard.press("KeyC");
      await page.keyboard.press("Space");
      await expect.poll(async () =>
        page.evaluate(() => eval(EVIDENCE + ".board.piecesPlaced")), { timeout: 10_000 })
        .toBeGreaterThan(before as number);
      const hold = await page.evaluate(() => eval(EVIDENCE + ".board.hold"));
      expect(hold).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: side taps move, centre tap rotates, swipe hard-drops", async ({ page }) => {
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
      const before = await page.evaluate(() => eval(EVIDENCE + ".board.piecesPlaced"));
      await page.evaluate(({ x, y, w, h }) => {
        const c = document.querySelector("canvas") ?? document.body;
        // Left-zone tap = move left.
        c.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 51, bubbles: true,
          clientX: x + w * 0.2, clientY: y + h * 0.4
        }));
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 51, bubbles: true }));
        // Centre tap = rotate.
        c.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 52, bubbles: true,
          clientX: x + w * 0.5, clientY: y + h * 0.4
        }));
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 52, bubbles: true }));
        // Right-zone tap + downward swipe = move right then hard drop.
        c.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 53, bubbles: true,
          clientX: x + w * 0.8, clientY: y + h * 0.4
        }));
        c.dispatchEvent(new PointerEvent("pointermove", {
          pointerId: 53, bubbles: true,
          clientX: x + w * 0.8, clientY: y + h * 0.7
        }));
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 53, bubbles: true }));
      }, r);
      await page.waitForTimeout(400);
      const engaged = await page.evaluate(() => eval(EVIDENCE + ".gameplay.touchEngaged"));
      expect(engaged).toBe(true);
      await expect.poll(async () =>
        page.evaluate(() => eval(EVIDENCE + ".board.piecesPlaced")), { timeout: 10_000 })
        .toBeGreaterThan(before as number);
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
      const looks: unknown[] = [];
      for (const scenario of ["clear-line", "tall-stack", "replay"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}&scenario=${scenario}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        await page.waitForTimeout(300);
        looks.push(await page.evaluate(() => eval(EVIDENCE + ".appliedLook")));
      }
      expect(looks[0]).toBeTruthy();
      expect(looks[0]).toEqual(looks[1]);
      expect(looks[1]).toEqual(looks[2]);
    } finally {
      server.close();
    }
  });
});
