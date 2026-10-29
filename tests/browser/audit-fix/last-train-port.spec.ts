import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lamplight Line (last-train-port) audit fix D-07 / RP-07. Remote only (tools/remote-acr/run.sh); never local Playwright.
 *
 * Loads the plain page (no `?capture=1` / `?qa=1`, so the drawing buffer is not preserved, as on the live site), lets it settle,
 * then calls `window.__AURA_LAST_TRAIN__.pixels()` in its own evaluate, a later task than any render. Before the fix it read a
 * cleared canvas (mean 0, litFraction 0). The run has no artifact egress, so output goes to the log:
 *   GL_META <json>                         pixels() result, page-screenshot luma stats and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * The first shot is not trusted (environment bake lands seconds after first frame): judge the later ones.
 */
const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "5,25,60").split(",").map(Number);
const CHUNK = 16000;
const URL_PATH = "/examples/last-train-port/";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

interface Pixels { width: number; height: number; litFraction: number; mean: number }

async function lumaStats(page: Page, png: Buffer, mime = "image/png") {
  return page.evaluate(async ([b64, type]) => {
    const blob = await (await fetch(`data:${type};base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4) };
  }, [png.toString("base64"), mime] as const);
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try { const dg = app.diagnostics?.(); return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null }; } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

/** pixels() in its own task, then a page screenshot as the reference for what is really on screen. */
async function grab(page: Page, id: string, extra: Record<string, unknown>): Promise<Pixels> {
  const pixels = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN__: { pixels(): Pixels } }).__AURA_LAST_TRAIN__.pixels());
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target: "last-train", id, ...extra, pixels, screenshot: stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG last-train ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return pixels;
}

test.describe("audit-fix last-train-port", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("pixels() QA hook reads a lit canvas on the plain page (D-07)", async ({ page }) => {
    page.on("pageerror", (e) => log(`GL_ERR last-train pageerror ${e.message.slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE last-train ${m.text().slice(0, 200)}`); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${URL_PATH}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const w = window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean }; __AURA_LAST_TRAIN_ERROR__?: string };
      return w.__AURA_LAST_TRAIN__?.ready() === true || Boolean(w.__AURA_LAST_TRAIN_ERROR__);
    }, undefined, { timeout: 420_000, polling: 500 });
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN_ERROR__?: string }).__AURA_LAST_TRAIN_ERROR__ ?? null);
    expect(bootError).toBeNull();
    const loaded = Date.now();
    const shots: Pixels[] = [];
    for (const sec of SETTLE_SECONDS) {
      const wait = sec * 1000 - (Date.now() - loaded);
      if (wait > 0) await page.waitForTimeout(wait);
      shots.push(await grab(page, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded }));
    }
    log("GL_DONE last-train");
    // Steady state only: the later shots.
    for (const px of shots.slice(1)) {
      expect(px.mean, "pixels() mean at steady state").toBeGreaterThan(20);
      expect(px.litFraction, "pixels() lit fraction at steady state").toBeGreaterThan(0.5);
    }
  });
});

/* ------------------------------------------------------------------ wave 3: game logic, touch, HUD, memory, steady-state frames */

type Api = Record<string, (...args: any[]) => any>;
const W = "__AURA_LAST_TRAIN__";

async function bootGame(page: Page, query: string): Promise<void> {
  page.on("pageerror", (e) => log(`GL_ERR last-train pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE last-train ${m.text().slice(0, 200)}`); });
  await page.goto(`${server.origin}${URL_PATH}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const w = window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean }; __AURA_LAST_TRAIN_ERROR__?: string };
    return w.__AURA_LAST_TRAIN__?.ready() === true || Boolean(w.__AURA_LAST_TRAIN_ERROR__);
  }, undefined, { timeout: 600_000, polling: 1000 });
  const bootError = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN_ERROR__?: string }).__AURA_LAST_TRAIN_ERROR__ ?? null);
  expect(bootError).toBeNull();
}

/** Calls a QA hook by name; returns undefined when the hook does not exist (the base build lacks the new ones). */
async function call<T = any>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([w, n, a]) => {
    const api = (window as unknown as Record<string, Api>)[w as string]!;
    const fn = api[n as string];
    return typeof fn === "function" ? await fn(...(a as unknown[])) : undefined;
  }, [W, name, args] as const) as Promise<T>;
}

async function fullInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.() ?? {};
      const info = app.info ?? {};
      const warn = (dg.warnings ?? []).map((w: any) => (typeof w === "string" ? w : w?.code ?? w?.message ?? "?")).slice(0, 40);
      return { app: true, renderPath: dg.renderPath ?? null, post: dg.post ?? null, warnings: warn, drawCalls: dg.drawCalls ?? null,
        approximateGpuMemoryBytes: info.approximateGpuMemoryBytes ?? null, memory: info.memory ?? null, renderSize: dg.renderSize ?? null };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

function emit(id: string, b64: string): void {
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG last-train ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Canvas-only frame through the game's `frame()` hook (renders, then reads in the same task). */
async function canvasShot(page: Page, id: string, w: number, h: number, extra: Record<string, unknown> = {}) {
  const b64 = await call<string>(page, "frame", w, h, 0.72);
  const stats = await lumaStats(page, Buffer.from(b64, "base64"), "image/jpeg");
  log(`GL_META ${JSON.stringify({ target: "last-train", id, kind: "canvas", ...extra, stats, state: await call(page, "state"), memory: await call(page, "memory") })}`);
  emit(id, b64);
  return stats;
}

/** Whole page with the HUD (what a player sees). */
async function pageShot(page: Page, id: string, extra: Record<string, unknown> = {}) {
  await call(page, "render");
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  const stats = await lumaStats(page, jpg, "image/jpeg");
  log(`GL_META ${JSON.stringify({ target: "last-train", id, kind: "page", ...extra, stats, state: await call(page, "state") })}`);
  emit(id, jpg.toString("base64"));
  return stats;
}

const text = (page: Page, sel: string) => page.evaluate((q) => document.querySelector(q)?.textContent?.trim() ?? null, sel);

/** Runs the autopilot (sim only) until the attempt completes, then renders once. */
async function runToComplete(page: Page): Promise<any> {
  await call(page, "setAutopilot", true);
  for (let i = 0; i < 40; i++) {
    const st = await call(page, "advance", 3000);
    if (st.attempt === "complete" && st.phase === "ready") break;
  }
  await call(page, "setAutopilot", false);
  await call(page, "stepFrames", 1);
  return call(page, "state");
}

async function advanceUntil(page: Page, phase: string, input?: unknown): Promise<any> {
  return page.evaluate(([w, ph, inp]) => {
    const api = (window as unknown as Record<string, Api>)[w as string]!;
    let st = api.state!();
    for (let g = 0; g < 4000 && st.phase !== ph; g++) st = inp === null ? api.advance!(10) : api.advance!(10, inp);
    return st;
  }, [W, phase, input ?? null] as const);
}

let server: ExampleDevServer;
test.describe("audit-fix last-train-port wave3", () => {
  test.setTimeout(3_000_000);
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("wave3 desktop 1280x720: steady-state frames, memory, results card, keep riding, R mid-service, second service", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await bootGame(page, "?manual=1");
    await page.evaluate(() => { try { localStorage.removeItem("aura3d.lasttrain.best"); } catch { /* */ } });
    await page.waitForTimeout(30_000);
    log(`GL_META ${JSON.stringify({ target: "last-train", id: "info-dock-day", info: await fullInfo(page), diag: await call(page, "diag"), memory: await call(page, "memory") })}`);
    await canvasShot(page, "dock-day", 1280, 720);
    // Depart and drive part of the first leg, then let it settle before the judged frame.
    await call(page, "doors");
    await advanceUntil(page, "ready");
    await call(page, "depart");
    await call(page, "setAutopilot", true);
    await call(page, "advance", 900);
    await call(page, "setAutopilot", false);
    await call(page, "stepFrames", 1);
    await page.waitForTimeout(20_000);
    await canvasShot(page, "mid-leg-day", 1280, 720);
    await pageShot(page, "mid-leg-day-hud");

    // D-05: R twice mid-service.
    const beforeR = await call(page, "state");
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(300);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(300);
    const afterR = await call(page, "state");
    log(`GL_META ${JSON.stringify({ target: "last-train", id: "d05-r-mid-service", beforeR, afterR, toast: await text(page, "#toast") })}`);
    expect.soft(afterR.leg === 0 && afterR.distance === 0 && afterR.phase === "docked", "R twice abandons the running service (D-05)").toBe(true);

    // Service 1 to the results card.
    const s1 = await runToComplete(page);
    await page.waitForTimeout(4000);
    const card1 = { grade: await text(page, "#res-grade"), score: await text(page, "#res-score"), grid: await text(page, "#res-grid"), rule: await text(page, "#res-rule"), hint: await text(page, "#results .meta:last-child") };
    log(`GL_META ${JSON.stringify({ target: "last-train", id: "results-1", s1, card1 })}`);
    await pageShot(page, "results-1-hud");

    // D-02: Enter keeps riding: hold W and the tram moves.
    await page.keyboard.press("Enter");
    await page.keyboard.down("KeyW");
    await call(page, "advance", 1);
    const ride = await call(page, "advance", 600);
    await page.keyboard.up("KeyW");
    log(`GL_META ${JSON.stringify({ target: "last-train", id: "d02-keep-riding", ride })}`);
    expect.soft(ride.speed > 1 && (ride.distance > 5 || ride.phase === "enroute"), "Enter then W moves the tram (D-02)").toBe(true);

    // D-03: a second service scores on its own.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(300);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(300);
    const s2 = await runToComplete(page);
    await page.waitForTimeout(4000);
    const card2 = { grade: await text(page, "#res-grade"), score: await text(page, "#res-score"), grid: await text(page, "#res-grid") };
    log(`GL_META ${JSON.stringify({ target: "last-train", id: "results-2", s2, card2 })}`);
    const n1 = Number(/Score (\d+)/.exec(card1.score ?? "")?.[1] ?? NaN), n2 = Number(/Score (\d+)/.exec(card2.score ?? "")?.[1] ?? NaN);
    expect.soft(Math.abs(n2 - n1) / n1, "second service scored on its own (D-03)").toBeLessThan(0.2);
    expect.soft(card1.grade, "a clean autopilot run reaches Gold (D-06)").toBe("Gold");
    expect.soft(card1.grid ?? "", "card says Tips lost, not Riders lost (D-04)").toContain("Tips lost");

    // Night, steady state.
    await page.keyboard.press("Enter");
    await call(page, "setTimeOfDay", "night");
    await page.waitForTimeout(25_000);
    log(`GL_META ${JSON.stringify({ target: "last-train", id: "info-night", info: await fullInfo(page), memory: await call(page, "memory") })}`);
    await canvasShot(page, "night", 1280, 720);
    log("GL_DONE last-train wave3 desktop");
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

    test("wave3 phone 390x844: touch bar drives the tram (D-01), HUD on a narrow screen (E-06)", async ({ page }) => {
      await bootGame(page, "?manual=1");
      await page.waitForTimeout(20_000);
      await pageShot(page, "phone-dock");
      const buttons = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("#touch [data-code]")).map((b) => {
        const r = b.getBoundingClientRect();
        return { code: b.dataset.code, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, visible: r.width > 0 && getComputedStyle(b).visibility !== "hidden" };
      }));
      log(`GL_META ${JSON.stringify({ target: "last-train", id: "phone-touch-buttons", buttons, coarse: await page.evaluate(() => matchMedia("(pointer: coarse)").matches) })}`);
      expect.soft(buttons.length, "touch bar present (D-01)").toBe(4);
      if (buttons.length !== 4) { log("GL_DONE last-train wave3 phone (no touch bar)"); return; }
      for (const b of buttons) { expect.soft(b.w, `${b.code} width`).toBeGreaterThanOrEqual(44); expect.soft(b.h, `${b.code} height`).toBeGreaterThanOrEqual(44); }
      const at = (code: string) => buttons.find((b) => b.code === code)!;
      const cdp: CDPSession = await page.context().newCDPSession(page);
      const touch = async (type: "touchStart" | "touchEnd", code: string) => {
        const b = at(code);
        await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: b.x, y: b.y, id: 1 }] });
      };
      // Go at the platform opens the doors.
      await touch("touchStart", "KeyW"); await touch("touchEnd", "KeyW");
      const opened = await call(page, "state");
      expect.soft(opened.phase, "Go at the platform opens the doors").not.toBe("docked");
      await advanceUntil(page, "ready");
      // Hold Go: depart and accelerate.
      await touch("touchStart", "KeyW");
      await call(page, "advance", 1);
      const going = await call(page, "advance", 420);
      expect.soft(going.speed, "holding Go accelerates").toBeGreaterThan(2);
      await pageShot(page, "phone-enroute-touch");
      await touch("touchEnd", "KeyW");
      // Hold Lean left.
      await touch("touchStart", "KeyA");
      const leaning = await call(page, "advance", 90);
      await touch("touchEnd", "KeyA");
      expect.soft(leaning.trim, "holding Lean left trims left").toBeLessThan(-0.3);
      // Hold Brake.
      const v0 = (await call(page, "state")).speed;
      await touch("touchStart", "Space");
      const braking = await call(page, "advance", 60);
      await touch("touchEnd", "Space");
      expect.soft(braking.speed, "holding Brake slows the tram").toBeLessThan(v0);
      const released = await call(page, "state");
      expect.soft(released.keys ?? [], "every key is released after touchEnd").toEqual([]);
      log(`GL_META ${JSON.stringify({ target: "last-train", id: "phone-touch-play", opened: opened.phase, going: going.speed, trim: leaning.trim, v0, braked: braking.speed, keys: released.keys })}`);
      // Results card buttons on a phone.
      await runToComplete(page);
      await page.waitForTimeout(3000);
      await pageShot(page, "phone-results");
      await page.tap("#res-keep");
      const kept = await call(page, "state");
      expect.soft(kept.attempt, "Keep riding button starts a new attempt").toBe("active");
      log("GL_DONE last-train wave3 phone");
    });
  });
});
