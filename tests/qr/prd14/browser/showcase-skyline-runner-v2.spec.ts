import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Skyline Runner v2): under `?a3d-qr=route-skyline-runner` the route must
 * boot to `playing`, reach both §7.2.1 required conditions by deadline
 * (level.act >= 2 from the autorun mid-course respawn; player.airborne &&
 * fx.liveCount > 0 once the scripted run takes its first jump), pass
 * canvasBlankCheck on every shot, accept keyboard-only AND touch-only play,
 * pause on visibilitychange, and expose the same appliedLook on every
 * scenario URL.
 */

const APP_DIR = "showcase-skyline-runner";
const ROUTE_FLAG = "route-skyline-runner";
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

test.describe("showcase-skyline-runner v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, autorun meets both conditions, canvas healthy", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&autorun=1`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const state = await page.evaluate(() =>
        ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string }).state);
      expect(state).toBe("playing");
      await shot(page, "01-title");

      // Autorun respawns at the first act-2 checkpoint through the kit's own
      // reset path, then drives real moves/jumps/dashes — act >= 2 is live
      // immediately and the first scripted jump fires airborne + fx.
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

  test("keyboard-only playthrough: run, jump and dash move the kit forward", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const startX = await page.evaluate(() => eval(EVIDENCE + ".player.x") as number);
      await page.keyboard.down("KeyD");
      await page.keyboard.press("Space");
      await page.keyboard.press("ShiftLeft");
      await page.waitForTimeout(900);
      await page.keyboard.up("KeyD");
      const after = await page.evaluate(() => eval(EVIDENCE + ".player.x") as number);
      expect(after).toBeGreaterThan(startX + 0.5);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: side press moves, centre tap jumps", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const r = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const b = (c ?? document.body).getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      const startX = await page.evaluate(() => eval(EVIDENCE + ".player.x") as number);
      // Hold the right third to run, then tap centre to jump.
      await page.evaluate(({ x, y, w, h }) => {
        const c = document.querySelector("canvas") ?? document.body;
        c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, clientX: x + w * 0.85, clientY: y + h * 0.5, bubbles: true }));
      }, r);
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const c = document.querySelector("canvas") ?? document.body;
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, bubbles: true }));
        c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 8, clientX: window.innerWidth * 0.5, clientY: window.innerHeight * 0.5, bubbles: true }));
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 8, bubbles: true }));
      });
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => eval(EVIDENCE + ".player.x") as number);
      expect(after).toBeGreaterThan(startX);
      const engaged = await page.evaluate(() => eval(EVIDENCE + ".run.touchEngaged"));
      expect(engaged).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("scenario URLs share the play appliedLook", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      const looks: Record<string, unknown>[] = [];
      for (const scenario of ["mid-run", "summit"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&scenario=${scenario}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        looks.push(await page.evaluate(() => eval(EVIDENCE + ".appliedLook")));
      }
      expect(looks[0]?.key).toEqual(looks[1]?.key);
      expect(looks[0]?.scene).toBe(looks[1]?.scene);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
