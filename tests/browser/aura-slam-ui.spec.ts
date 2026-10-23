import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * aura-slam-ui (gate G4, docs/aura-slam/ARCHITECTURE.md): drives the native UI shell with real key events and a
 * synthetic touch swipe. Remote-only (tools/remote-acr/run.sh); never run under local Playwright.
 *
 * The page's `main.ts` (M-RENDER) is replaced by `ui-harness/harness.ts`: the real shell, HUD, menu, input mapper and QA hooks
 * on a 2D-canvas renderer. By default the harness uses a fake engine that scores a point on a timer so the UI flow is
 * deterministic; `?engine=real` runs the native simulation.
 */

const PAGE = "/examples/aura-slam/";
const HARNESS = 'import "/examples/aura-slam/ui-harness/harness.ts";';

interface Control { getState(): Record<string, any>; }
type Win = Window & { __TOP_TENNIS_CONTROL__: Control; advanceTime(ms: number): void; render_game_to_text(): string; __SLAM_UI_HARNESS__: { sounds: string[]; renderer: { frames: number } } };

async function open(page: Page, origin: string, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route("**/examples/aura-slam/main.ts", (route) => route.fulfill({ contentType: "text/javascript", body: HARNESS }));
  await page.goto(`${origin}${PAGE}?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 240_000 });
  return errors;
}
const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__TOP_TENNIS_CONTROL__.getState());
const advance = (page: Page, ms: number) => page.evaluate((n) => (window as unknown as Win).advanceTime(n), ms);
const text = (page: Page, selector: string) => page.locator(selector).first().innerText();

test.describe("aura-slam-ui", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("serves, rallies and scores a point with real keys; the HUD follows; P pauses and resumes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await open(page, server.origin, "");
    await expect(page.locator("#match-hud")).not.toHaveClass(/hidden/);
    expect(await text(page, "#hud-you-points")).toBe("0");
    expect(await text(page, "#hud-score-status")).toBe("1ST SERVE");
    expect((await state(page)).phase).toBe("serve");

    await page.keyboard.press("Space");
    expect((await state(page)).phase).toBe("serveToss");
    await advance(page, 700);
    expect((await state(page)).phase).toBe("rally");
    expect(JSON.parse(await page.evaluate(() => (window as unknown as Win).render_game_to_text())).phase).toBe("rally");

    await page.keyboard.press("KeyP");
    expect((await state(page)).paused).toBe(true);
    const pausedTick = (await state(page)).tick;
    await advance(page, 500);
    expect((await state(page)).tick, "paused sim does not advance").toBe(pausedTick);
    await page.keyboard.press("KeyP");
    expect((await state(page)).paused).toBe(false);

    await advance(page, 1200);
    expect((await state(page)).score.playerPoints).toBe(1);
    expect(await text(page, "#hud-you-points")).toBe("15");
    expect((await page.evaluate(() => (window as unknown as Win).__SLAM_UI_HARNESS__.renderer.frames))).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });

  test("the native simulation serves from real key presses and decides a point", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await open(page, server.origin, "engine=real");
    expect((await state(page)).phase).toBe("serve");
    let total = 0;
    for (let attempt = 0; attempt < 8 && total === 0; attempt++) {
      await page.keyboard.press("Space");
      await advance(page, 120);
      expect((await state(page)).phase, "toss begins").not.toBe("serve");
      await advance(page, 430);
      await page.keyboard.press("Space");
      await advance(page, 400);
      if (attempt === 0) {
        const struck = await state(page);
        expect(struck.ball.active || struck.phase !== "serveToss", "the strike launches the ball").toBe(true);
      }
      await advance(page, 12_000);
      const now = await state(page);
      total = now.score.playerPoints + now.score.aiPoints + now.score.playerGames + now.score.aiGames;
    }
    const end = await state(page);
    expect(total, `a point was played out (phase ${end.phase}, serve ${end.serveNumber})`).toBeGreaterThan(0);
    const scoreboard = await text(page, "#scoreboard");
    expect(scoreboard).toMatch(/PLAYER|ALEX|YOU/i);
    expect(errors).toEqual([]);
  });

  test("rebinding a key in the controls dialog persists across a reload and drives the game", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await open(page, server.origin, "");
    await page.keyboard.press("KeyP");
    await page.locator("#pause-menu [data-control-settings]").first().click();
    await expect(page.locator("#control-settings")).toHaveAttribute("open", "");
    await page.locator('#control-settings [data-control-device="keyboard"]').click();
    await page.locator('#control-settings [data-binding-action="hit"][data-binding-slot="0"]').click();
    await page.keyboard.press("KeyJ");
    await page.locator("#control-settings-apply").click();
    await expect(page.locator("#control-settings-status")).toContainText("saved");
    const stored = await page.evaluate(() => window.localStorage.getItem("baseline.controls.v1"));
    expect(stored).toContain("KeyJ");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 240_000 });
    expect((await state(page)).phase).toBe("serve");
    await page.keyboard.press("Space");
    expect((await state(page)).phase, "Space no longer hits").toBe("serve");
    await page.keyboard.press("KeyJ");
    expect((await state(page)).phase, "J now hits").toBe("serveToss");
    expect(errors).toEqual([]);
  });

  test("the start menu walks to a match; unfinished modes are disabled", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await open(page, server.origin, "menu=1");
    await expect(page.locator("#mode-tournament")).toBeDisabled();
    await expect(page.locator("#mode-online")).toBeDisabled();
    await expect(page.locator("#mode-single")).toBeEnabled();
    expect((await state(page)).mode).not.toBe("playing");
    await page.locator("#mode-single").click();
    await page.locator("#setup-next").click();
    expect(await page.locator("#player-name").evaluate((el) => (el as HTMLInputElement).validationMessage), "a name is required").not.toBe("");
    await page.locator("#player-name").fill("Sam");
    await page.locator('.difficulty-btn[data-difficulty="club"]').click();
    await page.locator("#setup-next").click();
    await page.locator('.venue-btn[data-venue="clay"]').click();
    await page.locator("#start-btn").click();
    await advance(page, 3500);
    const playing = await state(page);
    expect(playing.mode).toBe("playing");
    expect(playing.venue).toBe("clay");
    expect(playing.difficulty).toBe("club");
    expect(errors).toEqual([]);
  });

  test.describe("mobile", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
    test("a synthetic swipe fires a shot", async ({ page, context }) => {
      const errors = await open(page, server.origin, "swipe=1");
      expect((await state(page)).phase).toBe("serve");
      const box = (await page.locator("#game").boundingBox())!;
      const cdp = await context.newCDPSession(page);
      const at = (fx: number, fy: number) => ({ x: Math.round(box.x + box.width * fx), y: Math.round(box.y + box.height * fy), id: 1 });
      const touch = (type: string, point: ReturnType<typeof at> | null) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] } as never);
      await touch("touchStart", at(0.5, 0.85));
      for (const [i, fy] of [0.75, 0.62, 0.5, 0.4].entries()) {
        await page.waitForTimeout(25 + i);
        await touch("touchMove", at(0.5 + i * 0.01, fy));
      }
      await touch("touchEnd", null);
      await page.waitForFunction(() => (window as unknown as Win).__TOP_TENNIS_CONTROL__.getState().lastShotType === "swipe", undefined, { timeout: 5000 });
      await advance(page, 100);
      expect((await state(page)).phase, "the swipe serves").not.toBe("serve");
      expect(errors).toEqual([]);
    });
  });
});
