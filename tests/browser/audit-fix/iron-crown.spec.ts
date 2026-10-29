import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Iron Crown audit-fix capture (lane G05). Remote only: tools/remote-acr/run.sh. The ACR run has no artifact egress, so all
 * output goes to the log (pattern copied from tests/browser/game-luma-capture.spec.ts):
 *   GL_META  <json>                          luma stats + engine diagnostics per shot
 *   GL_PROBE <json>                          gameplay probe results (touch walk, hold-back walk, special gate, gamepad pause)
 *   GL_JPG   <target> <shot> <i>/<n> <b64>   JPEG, chunked
 * The software-GL runner presents about one frame every 5 to 10 s, so the first shot is not trusted: judge the later ones.
 * The spec runs unchanged on the base commit (BEFORE) and the lane branch (AFTER); probes for features the base lacks log
 * "absent" instead of failing.
 *
 * Run: SPECS="tests/browser/audit-fix/iron-crown.spec.ts" CONTEXT_PROFILE=slim EXTRA_DIRS="apps/showcase-iron-crown apps/showcase-port-shared"
 *      PUBLIC_ASSETS="<the stage GLBs>" tools/remote-acr/run.sh
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true'";
const ROUTE = "/apps/showcase-iron-crown/";
const APP_PUBLIC = path.resolve("apps/showcase-iron-crown/public");
// Luma stats and JPEG encoding run in Node (sharp), not in the page: the page's main thread is busy with software GL for
// seconds per frame, so every page.evaluate costs at least one frame.
const sharp = createRequire(import.meta.url)("sharp");

/** The dev server resolves /aura-assets/* against the repo-root public/ only; the fighter rigs live in the app's public/. */
async function routeAppAssets(context: BrowserContext): Promise<void> {
  // The page's relative ./fonts/* resolve under /apps/showcase-iron-crown/, which the dev server does not map to public/.
  await context.route("**/apps/showcase-iron-crown/fonts/**", async (route) => {
    const file = path.join(APP_PUBLIC, "fonts", path.basename(new URL(route.request().url()).pathname));
    if (!existsSync(file)) return route.continue();
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".woff2") ? "font/woff2" : file.endsWith(".woff") ? "font/woff" : "font/ttf";
    await route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  await context.route("**/aura-assets/ironcrown*", async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/+/, "");
    const file = path.join(APP_PUBLIC, rel);
    if (!existsSync(file)) return route.continue();
    await route.fulfill({ status: 200, contentType: file.endsWith(".glb") ? "model/gltf-binary" : "image/svg+xml", body: readFileSync(file) });
  });
}

/** Fake gamepad: navigator.getGamepads() returns window.__icPad when set (standard mapping: 9 = Start, 1 = B). */
const FAKE_GAMEPAD = `(() => {
  const pressed = new Set();
  window.__icPadSet = (index, down) => { if (down) pressed.add(index); else pressed.delete(index); };
  const pad = () => ({ id: "audit-fake-pad", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.has(i), touched: pressed.has(i), value: pressed.has(i) ? 1 : 0 })) });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad(), null, null, null] });
  // Synthetic touch with a touches list (the engine's touch listener reads touches[0]).
  window.touchEv = (type) => {
    const list = type === "touchend" ? [] : [{ identifier: 1, clientX: 10, clientY: 10, target: document.body }];
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "touches", { value: list });
    Object.defineProperty(ev, "changedTouches", { value: [{ identifier: 1, clientX: 10, clientY: 10, target: document.body }] });
    return ev;
  };
})();`;
declare function touchEv(type: "touchstart" | "touchend"): Event;

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      const text = JSON.stringify(dg ?? {});
      let contactShadows: unknown = null;
      try { contactShadows = app.lighting?.diagnostics?.()?.contactShadows ?? null; } catch (e) { contactShadows = String(e); }
      return {
        app: true,
        renderPath: dg?.renderPath?.path ?? null,
        bloomFusion: dg?.renderPath?.bloomFusion ?? null,
        drawCalls: dg?.drawCalls ?? null,
        optionIgnored: (text.match(/OPTION_IGNORED/g) ?? []).length,
        contactShadows
      };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function gameState(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __AURA3D_SHOWCASE_IRON_CROWN__?: any }).__AURA3D_SHOWCASE_IRON_CROWN__;
    if (!s) return null;
    return {
      frame: s.frame, mode: s.mode, phase: s.phase, stage: s.stage?.id,
      p1: { x: s.fighters?.p1?.position?.[0], clip: s.fighters?.p1?.clip, health: s.fighters?.p1?.health, meter: s.fighters?.p1?.meter },
      cpu: { x: s.fighters?.cpu?.position?.[0], clip: s.fighters?.cpu?.clip, health: s.fighters?.cpu?.health, meter: s.fighters?.cpu?.meter },
      stats: s.bout?.stats, pips: s.bout?.pips, round: s.bout?.round,
      paused: !(document.getElementById("menu-pause") as HTMLElement | null)?.hidden,
      result: (document.getElementById("menu-result") as HTMLElement | null)?.hidden === false ? document.getElementById("result-title")?.textContent : null
    };
  });
}

async function nodeLuma(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hist = new Uint32Array(256);
  let sum = 0, dark = 0, clip = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const y = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    hist[y]!++; sum += y;
    if (y <= 12) dark++;
    if (y <= 2 || y >= 253) clip++;
  }
  const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
  return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
}

/**
 * Canvas frame in one page round trip: needs `capture=1` in the URL (preserveDrawingBuffer), which `open` adds. Every
 * page.evaluate waits for a software-GL frame (about 20 s here), and a page screenshot about 100 s, so canvas-only shots
 * use this; UI shots (evidence screens) still use page.screenshot.
 */
async function grabCanvas(page: Page, target: string, id: string, extra: Record<string, unknown> = {}): Promise<Buffer | null> {
  const t0 = Date.now();
  const got = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#game") as HTMLCanvasElement | null ?? document.querySelector("canvas");
    const url = canvas?.toDataURL("image/png") ?? null;
    const reg = (globalThis as any).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    let info: unknown = null;
    try {
      const dg = app?.diagnostics?.();
      info = { renderPath: dg?.renderPath?.path ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null, drawCalls: dg?.drawCalls ?? null,
        optionIgnored: (JSON.stringify(dg ?? {}).match(/OPTION_IGNORED/g) ?? []).length, contactShadows: app?.lighting?.diagnostics?.()?.contactShadows ?? null };
    } catch (e) { info = String(e); }
    const s = (window as any).__AURA3D_SHOWCASE_IRON_CROWN__;
    const state = s ? { frame: s.frame, mode: s.mode, phase: s.phase, stage: s.stage?.id, p1: { x: s.fighters?.p1?.position?.[0], clip: s.fighters?.p1?.clip, health: s.fighters?.p1?.health, meter: s.fighters?.p1?.meter, tint: s.fighters?.p1?.tint },
      cpu: { x: s.fighters?.cpu?.position?.[0], clip: s.fighters?.cpu?.clip, health: s.fighters?.cpu?.health }, stats: s.bout?.stats, pips: s.bout?.pips, perf: s.perf ?? null, attackLayer: s.attackLayer ?? null } : null;
    return { url, info, state, size: canvas ? [canvas.width, canvas.height] : null };
  });
  if (!got.url) { log(`GL_ERR ${target} ${id} no canvas`); return null; }
  const png = Buffer.from(got.url.split(",")[1]!, "base64");
  const jpg: Buffer = await sharp(png).jpeg({ quality: 72 }).toBuffer();
  const stats = await nodeLuma(png);
  log(`GL_META ${JSON.stringify({ target, id, canvasOnly: true, method: "toDataURL", size: got.size, ...extra, ...stats, timing: { totalMs: Date.now() - t0 }, info: got.info, state: got.state })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return png;
}

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}, canvasOnly = true): Promise<Buffer> {
  if (canvasOnly && page.url().includes("capture=1")) {
    const png = await grabCanvas(page, target, id, extra);
    if (png) return png;
  }
  const t0 = Date.now();
  const handle = canvasOnly ? await page.addStyleTag({ content: CANVAS_ONLY }) : null;
  const t1 = Date.now();
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  const t2 = Date.now();
  await handle?.evaluate((el) => el.remove());
  const jpg: Buffer = await sharp(png).jpeg({ quality: 72 }).toBuffer();
  const stats = await nodeLuma(png);
  const info = await engineInfo(page);
  const state = await gameState(page);
  const timing = { styleMs: t1 - t0, shotMs: t2 - t1, evalMs: Date.now() - t2 };
  log(`GL_META ${JSON.stringify({ target, id, canvasOnly, ...extra, ...stats, timing, info, state })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return png;
}

/** Mean RGB and luma spread inside a canvas-relative rect (fighter region checks for the Player Studio tints). */
async function regionStats(png: Buffer, rect: { x: number; y: number; w: number; h: number }) {
  const meta = await sharp(png).metadata();
  const left = Math.round(rect.x * meta.width), top = Math.round(rect.y * meta.height);
  const width = Math.round(rect.w * meta.width), height = Math.round(rect.h * meta.height);
  const { data } = await sharp(png).extract({ left, top, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, s = 0, s2 = 0;
  const n = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    r += data[i]; g += data[i + 1]; b += data[i + 2];
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    s += y; s2 += y * y;
  }
  const mean = s / n;
  return { r: +(r / n).toFixed(1), g: +(g / n).toFixed(1), b: +(b / n).toFixed(1), lumaMean: +mean.toFixed(2), lumaStd: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(2) };
}

const probe = (target: string, name: string, data: Record<string, unknown>): void => log(`GL_PROBE ${JSON.stringify({ target, name, ...data })}`);

async function open(browser: Browser, server: ExampleDevServer, target: string, phone: boolean, query = ""): Promise<{ context: BrowserContext; page: Page; loaded: number }> {
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await routeAppAssets(context);
  await context.addInitScript({ content: FAKE_GAMEPAD });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`GL_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target} ${m.text().slice(0, 240)}`); });
  page.on("requestfailed", (r) => log(`GL_REQFAIL ${target} ${r.url().slice(-120)}`));
  const t0 = Date.now();
  // capture=1 keeps the drawing buffer so canvas shots are one round trip (grabCanvas). ic-desktop keeps the page
  // screenshot path, matching its first BEFORE run.
  const q = target === "ic-desktop" ? query : `${query}${query ? "&" : "?"}capture=1`;
  await page.goto(`${server.origin}${ROUTE}${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 500 });
  log(`GL_READY ${target} ${Date.now() - t0}ms`);
  return { context, page, loaded: Date.now() };
}

async function settle(page: Page, target: string, loaded: number, seconds: readonly number[], prefix: string): Promise<void> {
  for (const sec of seconds) {
    const wait = sec * 1000 - (Date.now() - loaded);
    if (wait > 0) await page.waitForTimeout(wait);
    await grab(page, target, `${prefix}-${sec}s`, { sinceReadyMs: Date.now() - loaded });
  }
}

async function pickStage(page: Page, stage: string): Promise<void> {
  await page.evaluate((s) => (document.querySelector(`#ic-venues button[data-stage="${s}"]`) as HTMLElement | null)?.click(), stage);
}

test.describe("iron crown audit fixes", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("ic-desktop @g1", async ({ browser }) => {
    const T = "ic-desktop";
    const { context, page, loaded } = await open(browser, server, T, false, "?icdebug=1");
    await settle(page, T, loaded, [3, 30, 60], "crown");

    // IC-06: hold away from the foe (P1 faces +x, so away is KeyA). BEFORE: guards in place. AFTER: walks back.
    const b6 = await gameState(page);
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(25_000);
    const m6 = await gameState(page);
    await page.keyboard.up("KeyA");
    probe(T, "hold-back", { before: b6, during: m6, dx: (m6?.p1.x ?? 0) - (b6?.p1.x ?? 0) });

    // IC-02: press special with an empty meter. BEFORE: the special fires (stats.specials +1). AFTER: refused.
    const b2 = await gameState(page);
    await page.keyboard.down("KeyL");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyL");
    await page.waitForTimeout(15_000);
    const a2 = await gameState(page);
    probe(T, "special-empty-meter", { meterBefore: b2?.p1.meter, before: b2?.stats, after: a2?.stats, specialsDelta: (a2?.stats?.specials ?? 0) - (b2?.stats?.specials ?? 0) });

    // IC-05: gamepad Start opens pause; pressing Start again (after a release) must close it.
    await page.evaluate(() => (window as any).__icPadSet(9, true));
    await page.waitForFunction("!document.getElementById('menu-pause').hidden", undefined, { timeout: 120_000, polling: 250 }).catch(() => undefined);
    const p5 = await gameState(page);
    await page.evaluate(() => (window as any).__icPadSet(9, false));
    await page.waitForTimeout(1500);
    await page.evaluate(() => (window as any).__icPadSet(9, true));
    await page.waitForTimeout(3000);
    await page.evaluate(() => (window as any).__icPadSet(9, false));
    await page.waitForTimeout(1500);
    const r5 = await gameState(page);
    const focused = await page.evaluate(() => document.activeElement?.id ?? null);
    probe(T, "gamepad-pause", { pausedAfterStart: p5?.paused, pausedAfterSecondStart: r5?.paused, focusedWhilePaused: focused });
    if (r5?.paused) await page.keyboard.press("Escape");

    await page.waitForTimeout(20_000);
    await grab(page, T, "after-input");

    // Results frame (AFTER only): the lane adds a ?icdebug hook; the base has none, so its results stay "not reached".
    const hasHook = await page.evaluate(() => typeof (window as any).__IRON_CROWN_DEBUG__?.finishBout === "function");
    if (hasHook) {
      await page.evaluate(() => (window as any).__IRON_CROWN_DEBUG__.finishBout(true));
      await page.waitForFunction("document.getElementById('menu-result') && !document.getElementById('menu-result').hidden", undefined, { timeout: 180_000, polling: 500 }).catch(() => undefined);
      await page.waitForTimeout(8000);
      await grab(page, T, "results", {}, false);
    } else {
      probe(T, "results", { hook: "absent" });
    }
    await context.close();
  });

  test("ic-phone @g2", async ({ browser }) => {
    const T = "ic-phone";
    const { context, page, loaded } = await open(browser, server, T, true);
    await settle(page, T, loaded, [3, 30, 60], "crown");
    await grab(page, T, "ui-60s", {}, false);

    const controls = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-control], [data-ic-touch]")].map((el) => ({
      control: el.dataset.control ?? null, icTouch: el.dataset.icTouch ?? null, visible: el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden"
    })));
    probe(T, "touch-controls", { controls });

    // IC-01: hold the touch Right button. BEFORE: it drives the undeclared action "right" and P1 does not move. AFTER: walks.
    const b1 = await gameState(page);
    await page.evaluate(() => document.querySelector("[data-control='right']")?.dispatchEvent(touchEv("touchstart")));
    await page.waitForTimeout(25_000);
    const m1 = await gameState(page);
    await page.evaluate(() => document.querySelector("[data-control='right']")?.dispatchEvent(touchEv("touchend")));
    probe(T, "touch-right", { before: b1, during: m1, dx: (m1?.p1.x ?? 0) - (b1?.p1.x ?? 0) });
    await grab(page, T, "after-touch-walk");

    // New touch buttons (AFTER only): throw and dash.
    for (const name of ["dash", "throw"]) {
      const exists = await page.evaluate((n) => Boolean(document.querySelector(`[data-ic-touch='${n}']`)), name);
      if (!exists) { probe(T, `touch-${name}`, { button: "absent" }); continue; }
      const before = await gameState(page);
      await page.evaluate((n) => document.querySelector(`[data-ic-touch='${n}']`)?.dispatchEvent(touchEv("touchstart")), name);
      await page.waitForTimeout(12_000);
      await page.evaluate((n) => document.querySelector(`[data-ic-touch='${n}']`)?.dispatchEvent(touchEv("touchend")), name);
      await page.waitForTimeout(4000);
      const after = await gameState(page);
      probe(T, `touch-${name}`, { before, after, dx: (after?.p1.x ?? 0) - (before?.p1.x ?? 0) });
    }
    await grab(page, T, "after-touch-buttons", {}, false);
    await context.close();
  });

  test("ic-neo-tokyo @g2", async ({ browser }) => {
    const T = "ic-neo-tokyo";
    const { context, page } = await open(browser, server, T, false);
    await pickStage(page, "neo-tokyo-rooftop");
    await page.waitForFunction("window.__AURA3D_SHOWCASE_IRON_CROWN__?.stage?.id === 'neo-tokyo-rooftop'", undefined, { timeout: 300_000, polling: 500 });
    const swapped = Date.now();
    await settle(page, T, swapped, [10, 40, 75], "neo");
    await context.close();
  });

  test("ic-stages @g3", async ({ browser }) => {
    const T = "ic-stages";
    const { context, page } = await open(browser, server, T, false);
    for (const stage of ["bangkok-dock", "colosseum-ruins", "desert-airbase", "himalayan-monastery"]) {
      await pickStage(page, stage);
      await page.waitForFunction(`window.__AURA3D_SHOWCASE_IRON_CROWN__?.stage?.id === '${stage}'`, undefined, { timeout: 300_000, polling: 500 });
      await page.waitForTimeout(40_000);
      await grab(page, T, stage);
    }
    await context.close();
  });
  // ---- AFTER-only checks (added after the BEFORE run; each compares states inside the lane build) ----

  /** RH-05: the evidence screens, same names and sizes as evidence/iron-crown/screens/final (UI visible). */
  for (const vp of [{ name: "1280", phone: false }, { name: "390", phone: true }] as const) {
    test(`ic-screens-${vp.name} ${vp.phone ? "@g5" : "@g4"}`, async ({ browser }) => {
      const T = `ic-screens-${vp.name}`;
      const { context, page, loaded } = await open(browser, server, T, vp.phone, "?icdebug=1");
      await page.waitForTimeout(3000);
      await grab(page, T, "01-title", {}, false);
      await page.waitForTimeout(Math.max(0, 40_000 - (Date.now() - loaded)));
      await grab(page, T, "02-early", {}, false);
      if (vp.phone) {
        await page.evaluate(() => document.querySelector("[data-control='right']")?.dispatchEvent(touchEv("touchstart")));
        await page.waitForTimeout(12_000);
        await page.evaluate(() => document.querySelector("[data-control='right']")?.dispatchEvent(touchEv("touchend")));
        await page.evaluate(() => document.querySelector("[data-control='light']")?.dispatchEvent(touchEv("touchstart")));
        await page.waitForTimeout(400);
        await page.evaluate(() => document.querySelector("[data-control='light']")?.dispatchEvent(touchEv("touchend")));
      } else {
        await page.keyboard.down("KeyD");
        await page.waitForTimeout(12_000);
        await page.keyboard.up("KeyD");
        await page.keyboard.press("KeyJ");
      }
      await page.waitForTimeout(8000);
      await grab(page, T, "03-action", {}, false);
      await page.evaluate(() => (document.getElementById("ic-autopilot") as HTMLElement | null)?.click());
      await page.waitForTimeout(40_000);
      await grab(page, T, "04-mid", {}, false);
      await page.evaluate(() => (document.getElementById("ic-autopilot") as HTMLElement | null)?.click());
      await page.evaluate(() => (document.querySelector("#ic-modes button[data-mode='versus']") as HTMLElement | null)?.click());
      await page.waitForTimeout(4000);
      await grab(page, T, "05-modes", {}, false);
      await page.evaluate(() => (document.querySelector("#menu-versus [data-menu-close]") as HTMLElement | null)?.click());
      await page.waitForTimeout(3000);
      await page.evaluate(() => (window as any).__IRON_CROWN_DEBUG__?.finishBout(true));
      await page.waitForFunction("!document.getElementById('menu-result').hidden", undefined, { timeout: 240_000, polling: 500 }).catch(() => undefined);
      await page.waitForTimeout(6000);
      await grab(page, T, "06-results", {}, false);
      await context.close();
    });
  }

  test("ic-card @g4", async ({ browser }) => {
    const T = "ic-card";
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await routeAppAssets(context);
    const page = await context.newPage();
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 500 });
    await page.evaluate(() => (document.getElementById("ic-autopilot") as HTMLElement | null)?.click());
    await page.waitForTimeout(50_000);
    await grab(page, T, "card-2x", {}, false);
    await context.close();
  });

  /** IC-09: one frame per Player Studio swatch; a multiply tint keeps the texture detail (luma spread) in the fighter region. */
  test("ic-studio @g6", async ({ browser }) => {
    const T = "ic-studio";
    const { context, page } = await open(browser, server, T, false);
    const P1_RECT = { x: 0.26, y: 0.3, w: 0.2, h: 0.62 };
    for (const swatch of ["default", "crimson", "gilded"]) {
      await page.evaluate(() => (document.querySelector("#ic-modes button[data-mode='studio']") as HTMLElement | null)?.click());
      await page.waitForTimeout(1500);
      await page.evaluate((s) => (document.querySelector(`[data-grid="palette"] button[data-pick="${s}"]`) as HTMLElement | null)?.click(), swatch);
      await page.evaluate(() => (document.getElementById("studio-apply") as HTMLElement | null)?.click());
      await page.waitForTimeout(35_000);
      const png = await grab(page, T, `swatch-${swatch}`);
      probe(T, `swatch-${swatch}`, { region: await regionStats(png, P1_RECT) });
    }
    await context.close();
  });

  /** IC-15 (opt-in ?iclayer=1): the attack plays on the upper-body layer and the feet stay where the locomotion clip puts them. */
  test("ic-layer @g5", async ({ browser }) => {
    const T = "ic-layer";
    const { context, page } = await open(browser, server, T, false, "?iclayer=1");
    await page.waitForTimeout(20_000);
    const feet = () => page.evaluate(() => {
      const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
      const anim = app?.nodes?.get("player")?.animation;
      const at = (bone: string) => { try { const s = anim?.socket?.(bone); if (!s?.valid) return null; const m = s.worldMatrix(); return [+m[12].toFixed(3), +m[13].toFixed(3), +m[14].toFixed(3)]; } catch { return null; } };
      return { leftFoot: at("LeftFoot"), rightFoot: at("RightFoot"), rightHand: at("RightHand"), leftHand: at("LeftHand"), state: anim?.animationState?.() ?? null, layer: (window as any).__AURA3D_SHOWCASE_IRON_CROWN__?.attackLayer };
    });
    const idle = await feet();
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(2500);
    const during = await feet();
    await grab(page, T, "attack");
    await page.waitForTimeout(6000);
    const after = await feet();
    probe(T, "upper-body-layer", { idle, during, after });
    await context.close();
  });

  /** Contact shadows on the night stage: Neo-Tokyo with and without the effect (compare with ic-neo-tokyo). */
  test("ic-neo-no-contact @g6", async ({ browser }) => {
    const T = "ic-neo-no-contact";
    const { context, page } = await open(browser, server, T, false, "?iccontact=0");
    await pickStage(page, "neo-tokyo-rooftop");
    await page.waitForFunction("window.__AURA3D_SHOWCASE_IRON_CROWN__?.stage?.id === 'neo-tokyo-rooftop'", undefined, { timeout: 300_000, polling: 500 });
    await settle(page, T, Date.now(), [40, 75], "neo");
    await context.close();
  });

  /** Fused bloom (default auto path) against ?aura3d-render=production on the Crown Arena (compare with ic-desktop crown-60s). */
  test("ic-bloom-production @g4", async ({ browser }) => {
    const T = "ic-bloom-production";
    const { context, page, loaded } = await open(browser, server, T, false, "?aura3d-render=production");
    await settle(page, T, loaded, [30, 60], "crown");
    await context.close();
  });
  /** IC-07 (software GL only): runtime effects on with ?vfx=on&vfxdebug=1 during an autopilot bout; log live emitters and lingering-particle notes. */
  test("ic-vfx @g5", async ({ browser }) => {
    const T = "ic-vfx";
    const { context, page } = await open(browser, server, T, false, "?vfx=on&vfxdebug=1&autoplay=1");
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(30_000);
      const vfx = await page.evaluate(() => {
        const dbg = (window as any).__AURA_VFX_DEBUG__?.();
        const s = (window as any).__AURA3D_SHOWCASE_IRON_CROWN__;
        return dbg ? { time: dbg.time, live: dbg.live, transients: dbg.transients.length, oldest: Math.max(0, ...dbg.transients.map((t: any) => t.age)), notes: (dbg.notes ?? []).map((n: any) => n.code ?? String(n)).slice(0, 8), hits: s?.bout?.stats } : null;
      });
      probe(T, `vfx-${i}`, { vfx });
      if (i === 2 || i === 5) await grab(page, T, `vfx-${i}`);
    }
    await context.close();
  });
});
