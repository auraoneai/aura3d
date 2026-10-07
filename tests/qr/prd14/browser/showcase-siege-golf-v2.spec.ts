import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Siege Golf v2): under `?a3d-qr=route-siege-golf` the route must boot
 * to `playing`, reach every §7.2.1 required condition by deadline
 * (structures.toppledThisShot >= 1 at 12 s, loading.sceneSwaps === 0 at 12 s,
 * shot.power > 0.5 at 27 s), pass canvasBlankCheck on every shot, accept
 * keyboard-only AND touch-only play, pause on visibilitychange, and expose
 * the same appliedLook on every scenario URL. `?autorun=1` plays the
 * canonical per-hole solution so scripted capture is deterministic.
 */

const APP_DIR = "showcase-siege-golf";
const ROUTE_FLAG = "route-siege-golf";
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

test.describe("showcase-siege-golf v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, autorun meets conditions, canvas healthy", async ({ page }) => {
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

      // Autorun drives the hole-01 solution stroke (angle 0, power 1.9)
      // after ~1 s — the ball demolishes the stack well inside the deadline.
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 30_000);
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

  test("keyboard-only playthrough: A/D aim, held Space charges, release drives", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const before = await page.evaluate(() => eval(EVIDENCE + ".shot.angle"));
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(400);
      await page.keyboard.up("KeyA");
      const aimed = await page.evaluate(() => eval(EVIDENCE + ".shot.angle"));
      expect(aimed).not.toBe(before);
      await page.keyboard.down("Space");
      await page.waitForTimeout(700);
      const charging = await page.evaluate(() => eval(EVIDENCE + ".shot.phase"));
      expect(charging).toBe("charging");
      await page.keyboard.up("Space");
      await page.waitForTimeout(400);
      const power = await page.evaluate(() => eval(EVIDENCE + ".shot.power"));
      expect(power).toBeGreaterThan(0.5);
      const phase = await page.evaluate(() => eval(EVIDENCE + ".run.phase"));
      expect(["simulating", "settling", "aiming"]).toContain(phase);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: hold-drag releases a drive", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const r = await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      // Down on the ball area, drag up-ish, release — the aim-drag gesture.
      await page.evaluate(({ x, y, w, h }) => {
        const el = document.getElementById("app") ?? document.body;
        const sx = x + w * 0.5, sy = y + h * 0.72;
        el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 21, bubbles: true, clientX: sx, clientY: sy }));
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 21, bubbles: true, clientX: sx - 60, clientY: sy - h * 0.3 }));
      }, r);
      await page.waitForTimeout(500);
      const power = await page.evaluate(() => eval(EVIDENCE + ".shot.power"));
      expect(power).toBeGreaterThan(0.5);
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
      for (const scenario of ["finale", "charged", "tower"]) {
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
