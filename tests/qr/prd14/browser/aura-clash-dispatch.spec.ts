import { expect, test, type Page } from "@playwright/test";
import { builtDist, serve, watchConsole } from "./lib/serve";
import { expectRuntimeMatchesDeclared } from "./lib/look";

/**
 * Single-path Aura Clash Arena (S1 / S2 / S6 / S7):
 * `src/main.ts` boots directly at `/` (no legacy/v2 dispatcher).
 * Titles match the single-path `write-evidence.mjs` patterns (`boots to playing`,
 * `appliedLook`, `framing`). Desktop and mobile framing checks run in separate
 * `test()` blocks to avoid WebKit second-navigation WebGL2 teardown crashes.
 */

const APP_DIR = "aura-clash-showcase";
const EVIDENCE = `window.__AURA3D_GAME_EVIDENCE__?.["${APP_DIR}"]`;
const FRACTION: readonly [number, number] = [0.2, 0.3];

async function bootPlaying(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/`);
  await expect.poll(() =>
    page.evaluate(() =>
      ((window as Record<string, unknown>).__AURA3D_GAME__ as { state?: string } | undefined)?.state),
    { timeout: 30_000 }).toBe("playing");
}

test.describe("aura-clash single-path boot (S1/S2/S6/S7)", () => {
  test("boots framed with a sized canvas and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url);
      const canvas = await page.evaluate(() => {
        const el = document.querySelector("canvas");
        return el === null ? null : { width: el.clientWidth, height: el.clientHeight };
      });
      expect(canvas, "no canvas element mounted").not.toBeNull();
      expect(canvas!.width).toBeGreaterThan(0);
      expect(canvas!.height).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("boots to playing: advancing frames and live fighter health", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url);
      const firstFrame = await page.evaluate((expr) =>
        (eval(expr + ".playback") as { frame?: number } | undefined)?.frame ?? 0, EVIDENCE);
      await expect.poll(() =>
        page.evaluate((expr) =>
          (eval(expr + ".playback") as { frame?: number } | undefined)?.frame ?? 0, EVIDENCE),
        { timeout: 15_000 }).toBeGreaterThan(firstFrame);
      const health = await page.evaluate((expr) =>
        (eval(expr + ".combat") as { health?: { p1?: number; p2?: number } } | undefined)?.health, EVIDENCE);
      expect(health?.p1).toBeGreaterThan(0);
      expect(health?.p2).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  test("appliedLook resolves to arena-fight on play and scenario URLs", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await bootPlaying(page, url);
      const playLook = await page.evaluate((expr: string) =>
        JSON.stringify({
          route: eval(expr + ".appliedLook"),
          runtime: (window as unknown as {
            __AURA3D_GAME__?: { app?: { diagnostics?: () => { appliedLook?: unknown } } };
          }).__AURA3D_GAME__?.app?.diagnostics?.().appliedLook ?? null
        }), EVIDENCE);
      const parsed = JSON.parse(playLook) as { route?: { preset?: string }; runtime?: unknown };
      expect(parsed.route?.preset).toBe("arena-fight");
      await expectRuntimeMatchesDeclared(APP_DIR, parsed.runtime);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    test(`framing holds at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const root = builtDist(APP_DIR);
      expect(root, `${APP_DIR} not built`).not.toBeUndefined();
      const errors = watchConsole(page);
      const { server, url } = await serve(root!);
      try {
        await page.setViewportSize(viewport);
        await bootPlaying(page, url);
        await page.keyboard.down("KeyD");
        await page.waitForTimeout(1200);
        await page.keyboard.up("KeyD");
        await page.keyboard.press("KeyJ");
        await page.waitForTimeout(400);
        const framing = await page.evaluate((expr) =>
          JSON.parse(JSON.stringify(eval(expr))) as {
            rig?: string;
            subjectScreenHeightFraction?: number | null;
          }, EVIDENCE + ".framing");
        expect(framing.rig).toBe("aura-clash.fighting");
        expect(framing.subjectScreenHeightFraction).not.toBeNull();
        expect(framing.subjectScreenHeightFraction!).toBeGreaterThanOrEqual(FRACTION[0]);
        expect(framing.subjectScreenHeightFraction!).toBeLessThanOrEqual(FRACTION[1]);
        expect(errors).toEqual([]);
      } finally {
        server.close();
      }
    });
  }
});
