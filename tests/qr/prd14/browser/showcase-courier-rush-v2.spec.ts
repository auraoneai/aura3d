import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Courier Rush v2): under `?a3d-qr=route-courier-rush` the route must
 * boot to `playing`, run a scripted drive with zero console/page errors,
 * reach every §7.2.1 required condition by deadline (delivery.completed >= 1
 * via the seeded autopilot leg), pass canvasBlankCheck on every shot, accept
 * keyboard-only AND touch-only driving, pause on visibilitychange, and expose
 * the same appliedLook on every scenario URL. Browser specs run remote-only
 * (lane workflow / macos-14).
 */

const APP_DIR = "showcase-courier-rush";
const ROUTE_FLAG = "route-courier-rush";
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

test.describe("showcase-courier-rush v2 (T2.6)", () => {
  test.use({ hasTouch: true });

  test("boots to playing, autopilot completes a delivery by deadline, look parity", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      // The seeded autopilot drives the real dispatch loop: the van reaches
      // the pickup zone (trigger-enter loads the parcel) and the drop zone.
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&autopilot=1`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const state = await page.evaluate(() =>
        ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string }).state);
      expect(state).toBe("playing");
      await shot(page, "01-title");

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
      const delivery = await page.evaluate(() => eval(EVIDENCE + ".delivery") as { completed?: number });
      expect(delivery.completed ?? 0).toBeGreaterThanOrEqual(1);

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

  test("keyboard-only playthrough: W accelerates the van", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      await page.keyboard.down("KeyW");
      await expect.poll(async () => page.evaluate(() =>
        Math.abs((eval(EVIDENCE + ".van") as { speed?: number })?.speed ?? 0)),
        { timeout: 10_000, intervals: [200] }).toBeGreaterThan(0.5);
      await page.keyboard.up("KeyW");
      const van = await page.evaluate(() => eval(EVIDENCE + ".van"));
      expect(van).toBeTruthy();
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: right-half hold accelerates", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      // Right-half pointer hold = throttle pedal.
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: r.x + r.width * 0.8,
          clientY: r.y + r.height * 0.6,
          pointerId: 1,
          bubbles: true
        }));
      });
      await expect.poll(async () => page.evaluate(() =>
        Math.abs((eval(EVIDENCE + ".van") as { speed?: number })?.speed ?? 0)),
        { timeout: 10_000, intervals: [200] }).toBeGreaterThan(0.5);
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent("pointerup", {
          clientX: r.x + r.width * 0.8,
          clientY: r.y + r.height * 0.6,
          pointerId: 1,
          bubbles: true
        }));
      });
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
      for (const scenario of ["autopilot", "traffic", "strike"]) {
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
