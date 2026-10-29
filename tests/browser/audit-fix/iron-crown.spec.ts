import { existsSync, readFileSync } from "node:fs";
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

/** The dev server resolves /aura-assets/* against the repo-root public/ only; the fighter rigs live in the app's public/. */
async function routeAppAssets(context: BrowserContext): Promise<void> {
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
})();`;

async function lumaStats(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, dark = 0, clip = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 12) dark++;
      if (y <= 2 || y >= 253) clip++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
  }, png.toString("base64"));
}

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

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}, canvasOnly = true): Promise<void> {
  const handle = canvasOnly ? await page.addStyleTag({ content: CANVAS_ONLY }) : null;
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  await handle?.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target, id, canvasOnly, ...extra, ...stats, info: await engineInfo(page), state: await gameState(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
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
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
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

  test("ic-desktop", async ({ browser }) => {
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

  test("ic-phone", async ({ browser }) => {
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
    await page.evaluate(() => document.querySelector("[data-control='right']")?.dispatchEvent(new Event("touchstart", { bubbles: true })));
    await page.waitForTimeout(25_000);
    const m1 = await gameState(page);
    await page.evaluate(() => document.querySelector("[data-control='right']")?.dispatchEvent(new Event("touchend", { bubbles: true })));
    probe(T, "touch-right", { before: b1, during: m1, dx: (m1?.p1.x ?? 0) - (b1?.p1.x ?? 0) });
    await grab(page, T, "after-touch-walk");

    // New touch buttons (AFTER only): throw and dash.
    for (const name of ["dash", "throw"]) {
      const exists = await page.evaluate((n) => Boolean(document.querySelector(`[data-ic-touch='${n}']`)), name);
      if (!exists) { probe(T, `touch-${name}`, { button: "absent" }); continue; }
      const before = await gameState(page);
      await page.evaluate((n) => document.querySelector(`[data-ic-touch='${n}']`)?.dispatchEvent(new Event("touchstart", { bubbles: true })), name);
      await page.waitForTimeout(12_000);
      await page.evaluate((n) => document.querySelector(`[data-ic-touch='${n}']`)?.dispatchEvent(new Event("touchend", { bubbles: true })), name);
      await page.waitForTimeout(4000);
      const after = await gameState(page);
      probe(T, `touch-${name}`, { before, after, dx: (after?.p1.x ?? 0) - (before?.p1.x ?? 0) });
    }
    await grab(page, T, "after-touch-buttons", {}, false);
    await context.close();
  });

  test("ic-neo-tokyo", async ({ browser }) => {
    const T = "ic-neo-tokyo";
    const { context, page } = await open(browser, server, T, false);
    await pickStage(page, "neo-tokyo-rooftop");
    await page.waitForFunction("window.__AURA3D_SHOWCASE_IRON_CROWN__?.stage?.id === 'neo-tokyo-rooftop'", undefined, { timeout: 300_000, polling: 500 });
    const swapped = Date.now();
    await settle(page, T, swapped, [10, 40, 75], "neo");
    await context.close();
  });

  test("ic-stages", async ({ browser }) => {
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
});
