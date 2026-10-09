import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Patrol Wing v2): under `?a3d-qr=route-patrol-wing` the route must
 * boot to `playing`, reach both §7.2.1 required conditions by deadline
 * (rings.inFrame + throttle>0.4 during the takeoff climb; drones.hitsThisSortie
 * >= 1 && fx.liveCount > 0 once the intercept wedge engages — all within
 * 30 s under ?autorun=1), pass canvasBlankCheck on every shot, accept
 * keyboard-only AND touch-only play, pause on visibilitychange, and expose
 * the same appliedLook on every scenario URL.
 */

const APP_DIR = "showcase-patrol-wing";
const ROUTE_FLAG = "route-patrol-wing";
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

test.describe("showcase-patrol-wing v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, autorun sortie meets both conditions, canvas healthy", async ({ page }) => {
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

      // The autorun sortie throttles up, threads ring 0, draws the wave-0
      // intercept wedge, and fires until the §7.2.1 pairs both read true.
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

  test("keyboard-only playthrough: Shift takes off, A/D roll, Space fires", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // Hold Shift to spool the throttle; the authored takeoff flips to
      // "airborne" once speed crosses takeoffSpeed.
      await page.keyboard.down("ShiftLeft");
      await expect.poll(async () =>
        page.evaluate(() => eval(EVIDENCE + ".flight.throttle")), { timeout: 10_000 })
        .toBeGreaterThan(0.4);
      await expect.poll(async () =>
        page.evaluate(() => eval(EVIDENCE + ".flight.grounded")), { timeout: 15_000 })
        .toBe("airborne");
      await page.keyboard.up("ShiftLeft");
      const state = await page.evaluate(() => eval(EVIDENCE + ".run.state"));
      expect(state).toBe("patrol");
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(300);
      await page.keyboard.up("KeyA");
      await page.keyboard.down("Space");
      await page.waitForTimeout(200);
      await page.keyboard.up("Space");
      const fired = await page.evaluate(() => eval(EVIDENCE + ".cannon.shotsFired"));
      expect(fired).toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: right-top hold throttles, drag carves", async ({ page }) => {
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
      // Right-half top-band hold = throttle up; left-half drag = drive stick.
      await page.evaluate(({ x, y, w, h }) => {
        const c = document.querySelector("canvas") ?? document.body;
        c.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 51, bubbles: true,
          clientX: x + w * 0.75, clientY: y + h * 0.15
        }));
        c.dispatchEvent(new PointerEvent("pointerdown", {
          pointerId: 52, bubbles: true,
          clientX: x + w * 0.25, clientY: y + h * 0.55
        }));
        c.dispatchEvent(new PointerEvent("pointermove", {
          pointerId: 52, bubbles: true,
          clientX: x + w * 0.32, clientY: y + h * 0.48
        }));
      }, r);
      await page.waitForTimeout(900);
      const throttle = await page.evaluate(() => eval(EVIDENCE + ".flight.throttle"));
      expect(throttle).toBeGreaterThan(0);
      const engaged = await page.evaluate(() => eval(EVIDENCE + ".run.touchEngaged"));
      expect(engaged).toBe(true);
      await page.evaluate(() => {
        const c = document.querySelector("canvas") ?? document.body;
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 51, bubbles: true }));
        c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 52, bubbles: true }));
      });
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
      for (const scenario of ["ring-run", "drone-hit", "low-hull"]) {
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
