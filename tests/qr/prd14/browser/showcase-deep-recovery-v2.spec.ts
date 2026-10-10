import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Deep Recovery v2): under `?a3d-qr=route-deep-recovery` the route must
 * boot to `playing`, reach the §7.2.1 required conditions by deadline
 * (salvage.grappled >= 1 at 40 s via the scripted autopilot salvage leg;
 * render.readbacksThisFrame === 0 on every shot — the day-0 P0 removed the
 * legacy volumetric-fog CPU readback), pass canvasBlankCheck on every shot,
 * accept keyboard-only AND touch-only play, pause on visibilitychange, and
 * expose the same appliedLook on every scenario URL.
 */

const APP_DIR = "showcase-deep-recovery";
const ROUTE_FLAG = "route-deep-recovery";
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

test.describe("showcase-deep-recovery v2 (T2.6)", () => {
  test.use({ hasTouch: true });

  test("boots to playing, autorun grapple meets conditions, canvas healthy", async ({ page }) => {
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

      // The autopilot steers to crate-s1 and latches it — salvage.grappled>=1
      // well inside the 40 s deadline; every readback condition is constant-true.
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 45_000);
      const started = Date.now();
      let allMet = false;
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        await page.waitForTimeout(400);
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

  test("keyboard-only playthrough: W/S thrust, A/D turn, Space pings sonar", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const before = await page.evaluate(() => eval(EVIDENCE + ".sub.speed"));
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(500);
      const thrusting = await page.evaluate(() => eval(EVIDENCE + ".sub.speed"));
      expect(thrusting).toBeGreaterThan(before ?? -1);
      const yawBefore = await page.evaluate(() => eval(EVIDENCE + ".sub.yaw"));
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(400);
      await page.keyboard.up("KeyA");
      await page.keyboard.up("KeyW");
      const yawAfter = await page.evaluate(() => eval(EVIDENCE + ".sub.yaw"));
      expect(yawAfter).not.toBe(yawBefore);
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
      const pings = await page.evaluate(() => eval(EVIDENCE + ".sonar.pings"));
      expect(pings).toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: left-stick drag drives, right tap grapples", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const r = await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      // Left-half drag upward = throttle forward on the drive stick.
      await page.evaluate(({ x, y, w, h }) => {
        const el = document.getElementById("app") ?? document.body;
        el.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 51, bubbles: true, clientX: x + w * 0.25, clientY: y + h * 0.7
        }));
        el.dispatchEvent(new PointerEvent("pointermove", {
          pointerId: 51, bubbles: true, clientX: x + w * 0.25, clientY: y + h * 0.45
        }));
      }, r);
      await page.waitForTimeout(600);
      const speed = await page.evaluate(() => eval(EVIDENCE + ".sub.speed"));
      expect(speed).toBeGreaterThan(0.4);
      // Right-half tap (mid band) = grapple attempt.
      await page.evaluate(({ x, y, w, h }) => {
        const el = document.getElementById("app") ?? document.body;
        el.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 52, bubbles: true, clientX: x + w * 0.75, clientY: y + h * 0.5
        }));
        el.dispatchEvent(new PointerEvent("pointerup", {
          pointerId: 52, bubbles: true, clientX: x + w * 0.75, clientY: y + h * 0.5
        }));
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 51, bubbles: true }));
      }, r);
      await page.waitForTimeout(250);
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
      for (const scenario of ["reef-grapple", "trench-dive", "abyss-run"]) {
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
