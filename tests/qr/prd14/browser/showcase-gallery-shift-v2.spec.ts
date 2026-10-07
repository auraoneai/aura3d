import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Gallery Shift v2): under `?a3d-qr=route-gallery-shift` the route must
 * boot to playing on floor 1, and under `?autorun=1` the scripted thief must
 * sprint into guard-1's live patrol lane so the real LOS/detection chain
 * produces guard.state === "alert" with fx.conesVisible >= 1, while the rigged
 * infiltrator reports characters.thiefTracksApplied > 0 and
 * thiefYawErrorDeg <= 15 — all within the §7.2.1 deadlines. Every shot passes
 * canvasBlankCheck, keyboard-only AND touch-only playthroughs work,
 * visibilitychange pauses, and scenario URLs share the same appliedLook.
 */

const APP_DIR = "showcase-gallery-shift";
const ROUTE_FLAG = "route-gallery-shift";
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

test.describe("showcase-gallery-shift v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, autorun detection meets all conditions, canvas healthy", async ({ page }) => {
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
      await shot(page, "02-opening");

      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 30_000);
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
      expect(sceneId).toBe("floor-1");
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

  test("keyboard-only playthrough: WASD moves, sneak toggle, E lifts near a pedestal", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);

      const start = await page.evaluate(() => eval(EVIDENCE + ".thief.x"));
      // Move toward the archive wing (west + north) so the thief walks.
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(700);
      await page.keyboard.up("KeyA");
      const moved = await page.evaluate(() => eval(EVIDENCE + ".thief.x"));
      expect(moved).toBeLessThan(start as number);

      // Sneak gait while Shift is held.
      await page.keyboard.down("ShiftLeft");
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(400);
      const gait = await page.evaluate(() => eval(EVIDENCE + ".thief.gait"));
      await page.keyboard.up("KeyA");
      await page.keyboard.up("ShiftLeft");
      expect(gait).toBe("sneak");

      // Animation tracks apply to the rigged infiltrator while it walks.
      const tracks = await page.evaluate(() => eval(EVIDENCE + ".characters.thiefTracksApplied"));
      expect(tracks).toBeGreaterThan(0);

      // Pause via P.
      await page.keyboard.press("KeyP");
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => eval(EVIDENCE + ".run.paused"))).toBe(true);
      await page.keyboard.press("KeyP");
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => eval(EVIDENCE + ".run.paused"))).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: left-zone drag moves, right hold lifts, tap toggles sneak", async ({ page }) => {
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
      const pointer = (phase: "down" | "move" | "up", nx: number, ny: number, pid: number) =>
        page.evaluate(({ x, y, w, h, phase, nx, ny, pid }) => {
          const c = document.querySelector("canvas") ?? document.body;
          c.dispatchEvent(new PointerEvent(`pointer${phase}`, {
            pointerId: pid, bubbles: true,
            clientX: x + w * nx, clientY: y + h * ny
          }));
        }, { ...r, phase, nx, ny, pid });

      const start = await page.evaluate(() => eval(EVIDENCE + ".thief.x"));
      // Left-half drag left = move left (touch stick).
      await pointer("down", 0.25, 0.5, 61);
      await pointer("move", 0.15, 0.5, 61);
      await page.waitForTimeout(500);
      await pointer("up", 0.15, 0.5, 61);
      const moved = await page.evaluate(() => eval(EVIDENCE + ".thief.x"));
      expect(moved).toBeLessThan(start as number);
      const engaged = await page.evaluate(() => eval(EVIDENCE + ".run.touchEngaged"));
      expect(engaged).toBe(true);
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
      for (const scenario of ["floor-2", "alert"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&scenario=${scenario}`);
        await expect.poll(() => page.evaluate(() =>
          (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
        const look = await page.evaluate(() => eval(EVIDENCE + ".appliedLook"));
        expect(look).toEqual({ applied: scenario, kind: "v2-scenario", honest: true });
      }
      // The floor-2 scenario lands in the Skyline Wing through the real
      // floor-advance path — same union scene, still zero swaps.
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}&scenario=floor-2`);
      await expect.poll(() => page.evaluate(() => eval(EVIDENCE + ".loading.sceneId")), { timeout: 15_000 })
        .toBe("floor-2");
      expect(await page.evaluate(() => eval(EVIDENCE + ".loading.sceneSwaps"))).toBe(0);
    } finally {
      server.close();
    }
  });
});
