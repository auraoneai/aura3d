import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Gravity Post v2): under `?a3d-qr=route-gravity-post` the route must
 * boot to `playing`, reach the §7.2.1 required condition by deadline
 * (pod.state === "in-flight" && pod.launchedBy === "keyboard" at 10 s — the
 * Enter-key launch path the wave-3 P0 wired), pass canvasBlankCheck on every
 * shot, accept keyboard-only AND touch-only play, pause on visibilitychange,
 * and expose the same appliedLook on every scenario URL.
 */

const APP_DIR = "showcase-gravity-post";
const ROUTE_FLAG = "route-gravity-post";
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

test.describe("showcase-gravity-post v2 (T2.6)", () => {
  test.use({ hasTouch: true });

  test("boots to playing, keyboard launch meets conditions, canvas healthy", async ({ page }) => {
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

      // Enter launches along the seeded origin→destination bearing — the
      // §7.2.1 pair in-flight + launchedBy==="keyboard" must read by 10 s.
      await page.keyboard.press("Enter");
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

  test("keyboard-only playthrough: arrows steer the aim, Enter launches", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(300);
      await page.keyboard.up("KeyA");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const podState = await page.evaluate(() => eval(EVIDENCE + ".pod.state"));
      expect(podState).toBe("in-flight");
      const launchedBy = await page.evaluate(() => eval(EVIDENCE + ".pod.launchedBy"));
      expect(launchedBy).toBe("keyboard");
      const speed = await page.evaluate(() => eval(EVIDENCE + ".pod.speed"));
      expect(speed).toBeGreaterThan(0.1);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: drag on the canvas aims and releases", async ({ page }) => {
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
      // Drag left-to-right across the canvas, release = drag-aim launch.
      await page.evaluate(({ x, y, w, h }) => {
        const c = document.querySelector("canvas") ?? document.body;
        const sx = x + w * 0.4, sy = y + h * 0.55;
        c.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 41, bubbles: true, clientX: sx, clientY: sy
        }));
        c.dispatchEvent(new PointerEvent("pointermove", {
          pointerId: 41, bubbles: true, clientX: sx + w * 0.25, clientY: sy - h * 0.2
        }));
        c.dispatchEvent(new PointerEvent("pointerup", {
          pointerId: 41, bubbles: true, clientX: sx + w * 0.25, clientY: sy - h * 0.2
        }));
      }, r);
      await page.waitForTimeout(400);
      const podState = await page.evaluate(() => eval(EVIDENCE + ".pod.state"));
      expect(podState).toBe("in-flight");
      const launchedBy = await page.evaluate(() => eval(EVIDENCE + ".pod.launchedBy"));
      expect(launchedBy).toBe("pointer");
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
      for (const scenario of ["delivery-1", "hazard-mail", "dock-approach"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&scenario=${scenario}`);
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
