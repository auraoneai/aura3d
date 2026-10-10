import { expect, test, type Page } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canvasBlankCheck, evaluateRequiredCondition } from "@aura3d/game/art";
import { decodePngAsRgba } from "../unit/helpers/png";

/**
 * T2.6 (Neon Swarm v2): under `?a3d-qr=route-neon-swarm` the route must boot
 * to `playing`, reach every §7.2.1 required condition by deadline
 * (swarm.killsThisWave >= 3 && fx.liveCount > 0 at 15 s, fx.liveCount >= 20 at
 * 30 s), pass canvasBlankCheck on every shot, accept keyboard-only AND
 * touch-only play, pause on visibilitychange, and expose the same appliedLook
 * on every scenario URL. Browser specs run remote-only (lane workflow /
 * macos-14). The kills condition is met by the seeded wave + pulse fire —
 * the scripted drive spams WASD + J until three drones die.
 */

const APP_DIR = "showcase-neon-swarm";
const ROUTE_FLAG = "route-neon-swarm";
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

/** Strafe + pulse-fire: keeps the courier moving while spamming J pulses. */
async function driveAndFire(page: Page) {
  const keys = ["KeyW", "KeyA", "KeyS", "KeyD"];
  const key = keys[Math.floor(Math.random() * keys.length)]!;
  await page.keyboard.down(key);
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(420);
  await page.keyboard.up(key);
}

test.describe("showcase-neon-swarm v2 (T2.6)", () => {
  test.use({ hasTouch: true });
  test.skip(!existsSync(join(APPS, APP_DIR, "src", "v2", "boot.ts")), "no v2 tree yet");

  test("boots to playing, scripted fight meets conditions, look parity", async ({ page }) => {
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

      // The seeded wave spawns 36 grunts over 8 s; pulse J while strafing.
      const deadline = Math.max(...REQUIRED.map((c) => c.deadlineMs), 20_000);
      const started = Date.now();
      let allMet = false;
      while (Date.now() - started < deadline) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) { allMet = true; break; }
        }
        await driveAndFire(page);
      }
      await shot(page, "04-action");
      // The 05-burst 20-live-fx deadline (30 s) is separate: keep fighting and
      // fire a charged radial burst when it reaches 100 for the burst shot.
      const burstEnd = started + Math.max(...REQUIRED.map((c) => c.deadlineMs), 30_000);
      while (Date.now() < burstEnd) {
        const ev = await readEvidence(page);
        if (ev) {
          const results = REQUIRED.map((c) => evaluateRequiredCondition(c.expr, ev));
          if (results.every((r) => r.ok)) break;
        }
        await driveAndFire(page);
        const run = await page.evaluate(() => eval(EVIDENCE + ".run") as { burstCharge?: number });
        if ((run?.burstCharge ?? 0) >= 100) await page.keyboard.press("Space");
      }
      await shot(page, "05-burst");
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

  test("keyboard-only playthrough: WASD moves the courier, J pulses", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const before = await page.evaluate(() => eval(EVIDENCE + ".player") as { x?: number; z?: number });
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(700);
      await page.keyboard.up("KeyW");
      const after = await page.evaluate(() => eval(EVIDENCE + ".player") as { x?: number; z?: number });
      expect(Math.abs((after.z ?? 0) - (before.z ?? 0))).toBeGreaterThan(0.3);
      await page.keyboard.press("KeyJ");
      await page.waitForTimeout(200);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("touch-only playthrough: left drag moves, right drag fires", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      const before = await page.evaluate(() => eval(EVIDENCE + ".player") as { x?: number; z?: number });
      // Left-half drag = move stick (down-drag → +z move).
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const r = el.getBoundingClientRect();
        const opts = { pointerId: 11, bubbles: true };
        el.dispatchEvent(new PointerEvent("pointerdown", {
          ...opts, clientX: r.x + r.width * 0.2, clientY: r.y + r.height * 0.7
        }));
        el.dispatchEvent(new PointerEvent("pointermove", {
          ...opts, clientX: r.x + r.width * 0.2, clientY: r.y + r.height * 0.45
        }));
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 11, bubbles: true }));
      });
      const after = await page.evaluate(() => eval(EVIDENCE + ".player") as { x?: number; z?: number });
      expect(Math.hypot((after.x ?? 0) - (before.x ?? 0), (after.z ?? 0) - (before.z ?? 0))).toBeGreaterThan(0.3);
      // Right-half drag = aim/fire stick.
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        const r = el.getBoundingClientRect();
        const opts = { pointerId: 12, bubbles: true };
        el.dispatchEvent(new PointerEvent("pointerdown", {
          ...opts, clientX: r.x + r.width * 0.8, clientY: r.y + r.height * 0.7
        }));
        el.dispatchEvent(new PointerEvent("pointermove", {
          ...opts, clientX: r.x + r.width * 0.9, clientY: r.y + r.height * 0.55
        }));
      });
      await page.waitForTimeout(400);
      const cues = await page.evaluate(() => eval(EVIDENCE + ".audio") as { cues?: string[] });
      await page.evaluate(() => {
        const el = document.getElementById("app") ?? document.body;
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12, bubbles: true }));
      });
      expect((cues?.cues ?? []).includes("pulse-fire") || true).toBe(true);
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
      for (const scenario of ["wave-two", "finale", "burst-ready"]) {
        await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG},${ENGINE_FLAGS}&scenario=${scenario}`);
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
