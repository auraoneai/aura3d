import { expect, test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G15 (Craterline GP, `strange-orbit-port`): the player-facing fixes, driven through the real page.
 * Remote only (tools/remote-acr/run.sh). The run has no artifact egress, so everything goes to the log:
 *   SOP_META <json>                      measured facts per step
 *   SOP_JPG  <name> <i>/<n> <b64>        full-page JPEG (UI included), chunked
 * The same file runs on the base (BEFORE) and on the lane branch (AFTER). Facts that need the lane's new hooks or DOM
 * are logged as null on the base, and the assertions only run when the lane's hooks exist (`isAfter`).
 *
 * - phone 390x844 with touch emulation: menu layout (rider screen position against the menu panel, SO-5); a race driven
 *   only by CDP touch events (SO-1: hold the steer pad to ride, drag to steer, a second finger on Boost); HUD pause and
 *   sound buttons, mute saved across a reload (SO-9).
 * - desktop 1280x720: menu and racing at steady state; a 1-lap race finished 6th shows no medal (SO-2).
 * Software GL presents one frame every few seconds; every shot waits for several presented frames first.
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const PAGE = "/examples/strange-orbit-port/index.html";
type Api = Record<string, (...args: unknown[]) => unknown>;

async function frames(page: Page): Promise<number> {
  return page.evaluate(() => Number((globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.frames?.() ?? -1));
}
async function waitFrames(page: Page, n: number, minMs: number): Promise<void> {
  const start = await frames(page);
  const t0 = Date.now();
  await page.waitForFunction((t) => Number((globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.frames?.() ?? 0) >= t, start + n, { timeout: 240_000, polling: 250 })
    .catch(() => log(`SOP_WARN frames did not advance by ${n} from ${start}`));
  const left = minMs - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
}
async function shot(page: Page, name: string): Promise<void> {
  await waitFrames(page, 3, 4000);
  const b64 = (await page.screenshot({ type: "jpeg", quality: 82 })).toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`SOP_JPG ${name} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}
const call = <T = unknown>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => {
    const api = (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__;
    const target = api?.[f as string];
    return (typeof target === "function" ? target(...(a as unknown[])) : null) as T;
  }, [fn, args] as const);
const state = (page: Page) => call<Record<string, any>>(page, "state");

async function open(browser: Browser, server: ExampleDevServer, query: string, viewport: { width: number; height: number }, mobile: boolean): Promise<Page> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`SOP_ERR pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`SOP_ERR console ${m.text().slice(0, 300)}`); });
  await page.goto(`${server.origin}${PAGE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.ready?.() === true, undefined, { timeout: 540_000, polling: 500 });
  return page;
}

const rect = (page: Page, sel: string) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none" };
}, sel);

test.describe("strange-orbit-port play", () => {
  test.setTimeout(2_400_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("play phone touch", async ({ browser }) => {
    const page = await open(browser, server, "?manual=1", { width: 390, height: 844 }, true);
    const isAfter = (await page.evaluate(() => typeof (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.touch)) === "function";
    await waitFrames(page, 4, 20_000);
    // SO-5: where the menu bike lands against the menu panel
    const panel = await rect(page, "#menu .panel");
    const riders = await call<({ x: number; y: number } | null)[] | null>(page, "riderScreen");
    log(`SOP_META ${JSON.stringify({ step: "menu-390", isAfter, panel, player: riders?.[0] ?? null, rivals: riders?.slice(1) ?? null })}`);
    await shot(page, "menu-390");
    if (isAfter) {
      expect(riders?.[0]?.y, "menu rider in the lower third").toBeGreaterThan(0.62);
      expect((riders![0]!.y * 844) > panel!.y + panel!.h, "menu rider below the menu panel").toBe(true);
    }

    // SO-1: start by tapping the button, then race on touch alone
    await page.tap("#start");
    await call(page, "stepFrames", 200);
    const overlay = await rect(page, "#touch-steer");
    const boostBtn = await rect(page, '#touch-buttons button[data-touch="boost"]');
    log(`SOP_META ${JSON.stringify({ step: "touch-overlay", phase: (await state(page)).phase, overlay, boostBtn })}`);
    const cdp = await page.context().newCDPSession(page);
    const pad = { x: 90, y: 700 };
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
    const s0 = await state(page);
    await touch("touchStart", [{ ...pad, id: 1 }]);
    await call(page, "stepFrames", 180);
    const afterHold = await state(page);
    await touch("touchMove", [{ x: pad.x + 50, y: pad.y, id: 1 }]);
    await call(page, "stepFrames", 30);
    const afterSteer = await state(page);
    await touch("touchMove", [{ ...pad, id: 1 }]);
    let boosted: Record<string, any> | null = null;
    if (boostBtn?.visible) {
      const b = { x: boostBtn.x + boostBtn.w / 2, y: boostBtn.y + boostBtn.h / 2 };
      await touch("touchStart", [{ ...pad, id: 1 }, { ...b, id: 2 }]);
      await call(page, "stepFrames", 30);
      boosted = await state(page);
      await touch("touchEnd", [{ ...pad, id: 1 }]);
    }
    await call(page, "stepFrames", 30);
    log(`SOP_META ${JSON.stringify({ step: "touch-drive", start: { s: s0.s, phase: s0.phase }, hold: { s: afterHold.s, speed: afterHold.speed, lane: afterHold.lane }, steer: { lane: afterSteer.lane, heading: afterSteer.heading }, boost: boosted ? { boosting: boosted.boosting, boostTime: boosted.boostTime } : null })}`);
    if (isAfter) {
      expect(afterHold.s - s0.s, "holding the steer pad rides forward").toBeGreaterThan(40);
      expect(afterHold.speed).toBeGreaterThan(15);
      expect(afterSteer.heading - afterHold.heading, "dragging right steers right").not.toBe(0);
      expect(boosted?.boostTime ?? 0, "Boost button boosts").toBeGreaterThan(0);
    }
    // hold the pad again for a steady racing frame with the controls visible
    await touch("touchStart", [{ ...pad, id: 1 }]);
    await call(page, "stepFrames", 240);
    await shot(page, "race-touch-390");
    await touch("touchEnd", []);

    // SO-9: HUD pause, the sound switch, and the saved mute
    const pauseBtn = await rect(page, "#hud-pause");
    if (pauseBtn?.visible) {
      await page.tap("#hud-pause");
      const paused = (await state(page)).phase;
      await page.tap("#pause-mute");
      const muted = await call(page, "muted");
      await shot(page, "pause-390");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.ready?.() === true, undefined, { timeout: 540_000, polling: 500 });
      const mutedAfterReload = await call(page, "muted");
      const label = await page.textContent("#hud-mute");
      log(`SOP_META ${JSON.stringify({ step: "pause-mute", paused, muted, mutedAfterReload, label })}`);
      expect(paused).toBe("paused");
      expect(muted).toBe(true);
      expect(mutedAfterReload).toBe(true);
    } else log(`SOP_META ${JSON.stringify({ step: "pause-mute", hudPause: null })}`);
    await page.context().close();
  });

  test("play desktop", async ({ browser }) => {
    const page = await open(browser, server, "?manual=1", { width: 1280, height: 720 }, false);
    const isAfter = (await page.evaluate(() => typeof (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.touch)) === "function";
    await waitFrames(page, 4, 30_000);
    await shot(page, "menu-1280");
    const touchVisible = await rect(page, "#touch-controls");
    await call(page, "begin");
    await call(page, "stepFrames", 200);
    await call(page, "setAutopilot", true);
    await call(page, "stepFrames", 60 * 20);
    const racing = await state(page);
    log(`SOP_META ${JSON.stringify({ step: "race-1280", isAfter, touchOverlay: touchVisible, phase: racing.phase, s: racing.s, place: racing.place, lap: racing.lap })}`);
    await shot(page, "race-1280");
    await shot(page, "race-1280-later");

    // SO-2: a 1-lap race finished 6th
    await page.evaluate(() => {
      const w = globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api; __orbit?: { race: { laps: number; s: number; speed: number; rivals: { s: number; speed: number }[] } } };
      w.__AURA_STRANGE_ORBIT__?.setAutopilot?.(false);
      w.__AURA_STRANGE_ORBIT__?.reset?.();
      w.__AURA_STRANGE_ORBIT__?.stepFrames?.(200);
      const race = w.__orbit!.race;
      race.laps = 1;
      for (const r of race.rivals) { r.s = 1449; r.speed = 40; }
      race.s = 1440;
      race.speed = 30;
      w.__AURA_STRANGE_ORBIT__?.stepFrames?.(90, { pedal: true });
    });
    const fin = await state(page);
    const heading = await page.textContent("#result-medal");
    const menuBtn = await rect(page, "#results-menu");
    log(`SOP_META ${JSON.stringify({ step: "results-6th", phase: fin.phase, place: fin.end?.place ?? null, medal: fin.end?.medal ?? null, heading, menuButton: menuBtn })}`);
    await shot(page, "results-6th-1280");
    if (isAfter) {
      expect(fin.end?.place).toBe(6);
      expect(fin.end?.medal).toBeNull();
      expect(heading).toBe("No medal · finished 6th");
      expect(menuBtn?.visible).toBe(true);
      expect(touchVisible?.visible ?? false, "touch overlay stays hidden on a desktop pointer").toBe(false);
    }
    await page.context().close();
  });
});

test.describe("strange-orbit-port play trial", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  // SO-E3: a finished time trial saves a personal best and its ghost; the next trial shows the ghost ahead of a slower run.
  test("play trial ghost", async ({ browser }) => {
    const page = await open(browser, server, "?mode=trial&laps=1&manual=1", { width: 960, height: 540 }, false);
    const isAfter = (await page.evaluate(() => typeof (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api }).__AURA_STRANGE_ORBIT__?.touch)) === "function";
    await call(page, "begin");
    await call(page, "stepFrames", 200);
    await call(page, "setAutopilot", true);
    const done = await call<Record<string, unknown>>(page, "runToFinish");
    const best = await page.textContent("#result-best").catch(() => null);
    await shot(page, "trial-results-960");
    // second run: pedal without boost, so the saved ghost pulls ahead
    await page.evaluate(() => {
      const w = globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api };
      w.__AURA_STRANGE_ORBIT__?.setAutopilot?.(false);
      w.__AURA_STRANGE_ORBIT__?.reset?.();
      w.__AURA_STRANGE_ORBIT__?.stepFrames?.(200);
    });
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => {
        const w = globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Api; __orbit?: { race: { lane: number; heading: number } } };
        const r = w.__orbit!.race;
        w.__AURA_STRANGE_ORBIT__?.stepFrames?.(60, { pedal: true, steer: Math.max(-1, Math.min(1, -r.lane * 0.6 - r.heading * 1.5)) });
      });
    }
    await waitFrames(page, 3, 4000);
    const screen = await call<({ x: number; y: number; depth: number } | null)[] | null>(page, "riderScreen");
    const s = await state(page);
    log(`SOP_META ${JSON.stringify({ step: "trial-ghost", isAfter, finished: done, best, s: s.s, ghost: screen?.[6] ?? null, player: screen?.[0] ?? null })}`);
    await shot(page, "trial-ghost-960");
    if (isAfter) {
      expect(best ?? "").toMatch(/personal best/i);
      expect(screen?.[6], "ghost is drawn ahead of the player").toBeTruthy();
      expect(screen![6]!.depth).toBeGreaterThan(screen![0]!.depth);
    }
    await page.context().close();
  });
});
