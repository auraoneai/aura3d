import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Bunker Zero audit-fix captures (lane G11). Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so
 * everything goes to the log, in the format of tests/browser/game-luma-capture.spec.ts:
 *   GL_META <json>                         luma stats, game evidence and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG (or the full page for HUD and screen shots), chunked
 *   GL_STATE <json>                        gameplay probe results (QA hook targets)
 * The software-GL runner presents about one frame every 5 to 10 s, so the first shot is never trusted: judge the later ones.
 * Gameplay targets step the sim through window.__AURA_BUNKER_ZERO_QA__ (simulated time, no wait for rendered frames). When a
 * hook method is missing (the pre-fix build) the target logs GL_SKIP and still captures what it can.
 * Select batches with `--grep=@tag` in SPECS (a `|` regex cannot ride in SPECS).
 */
const SETTLE = (process.env.GL_SETTLE ?? "25,60").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true'";
const APP = "/apps/showcase-bunker-zero/";
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const CARD = { width: 1440, height: 900 };

/** Luma stats of a PNG plus a JPEG re-encode made in the page, so each shot costs one screenshot (software GL makes each one slow). */
async function lumaStats(page: Page, png: Buffer, jpegQuality: number) {
  return page.evaluate(async ([b64, q]) => {
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
    // region means: top third (ceiling), middle third (walls), bottom third (floor)
    const band = [0, 0, 0], bandN = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y < 12) dark++;
      if (y >= 250) clip++;
      const row = Math.floor((i / 4) / c.width);
      const b = Math.min(2, Math.floor((row * 3) / c.height));
      band[b]! += y; bandN[b]!++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    const jpg = c.toDataURL("image/jpeg", q as number).split(",")[1] ?? "";
    return {
      jpg,
      w: c.width, h: c.height, mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95),
      darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4),
      bands: band.map((s, k) => +(s / Math.max(1, bandN[k]!)).toFixed(2))
    };
  }, [png.toString("base64"), jpegQuality] as const);
}

async function gameInfo(page: Page) {
  return page.evaluate(() => {
    const g = globalThis as any;
    const ev = g.__gameEvidence ?? null;
    const app = g.__AURA3D_LIVE_APPS__?.all?.()[0];
    let diag: any = null;
    try {
      const dg = app?.diagnostics?.();
      diag = {
        renderPath: dg?.renderPath?.path ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null,
        drawCalls: dg?.drawCalls ?? null, triangles: dg?.triangles ?? null,
        droppedPasses: dg?.renderPath?.droppedPasses ?? dg?.droppedPasses ?? null
      };
    } catch (e) { diag = { err: String(e) }; }
    const game = ev ? {
      mode: ev.mode, floor: ev.floor, time: ev.time, simSteps: ev.simSteps, hp: ev.player?.hp, weapon: ev.player?.weapon,
      mag: ev.player?.mag, kills: ev.kills, enemiesAlive: ev.enemiesAlive, paused: ev.paused ?? null, outcome: ev.outcome ?? null,
      eventsDrained: ev.eventsDrained ?? null, frameErrors: ev.frameErrors ?? null, drawCalls: ev.drawCalls ?? null
    } : null;
    return { diag, game };
  });
}

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}, withHud = false): Promise<void> {
  const handle = withHud ? null : await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  await handle?.evaluate((el) => el.remove());
  const { jpg, ...stats } = await lumaStats(page, png, withHud ? 0.84 : 0.72);
  log(`GL_META ${JSON.stringify({ target, id, hud: withHud, ...extra, ...stats, ...(await gameInfo(page)) })}`);
  const b64 = jpg;
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/**
 * The shared dev server resolves /aura-assets/* only from the root public tree; the game's own admitted GLBs live in
 * apps/showcase-bunker-zero/public/aura-assets (merged at the origin root in the deploy), so serve those here.
 */
const APP_ASSETS = path.resolve("apps/showcase-bunker-zero/public/aura-assets");
async function serveAppAssets(page: Page): Promise<void> {
  await page.route("**/aura-assets/**", async (route) => {
    const file = path.join(APP_ASSETS, path.basename(new URL(route.request().url()).pathname));
    if (existsSync(file)) await route.fulfill({ status: 200, body: readFileSync(file), contentType: file.endsWith(".glb") ? "model/gltf-binary" : undefined });
    else await route.fallback();
  });
}

async function open(page: Page, server: ExampleDevServer, name: string, url: string, viewport: { width: number; height: number }, scale = 1): Promise<number> {
  await serveAppAssets(page);
  page.on("pageerror", (e) => log(`GL_ERR ${name} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`GL_CONSOLE ${name} ${m.type()} ${m.text().slice(0, 240)}`); });
  await page.setViewportSize(viewport);
  void scale;
  await page.goto(`${server.origin}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
  // the onboarding card (C27) pauses a first visit; close it so before and after builds both run the sim
  await page.evaluate(() => (globalThis as any).__AURA_BUNKER_ZERO_QA__?.dismissIntro?.());
  // phones: a first touch shows the touch layer even where (pointer: coarse) does not match in the emulated context
  if (viewport.width < 500) await page.evaluate(() => window.dispatchEvent(new Event("touchstart")));
  return Date.now();
}

async function settle(page: Page, name: string, loaded: number, seconds: readonly number[], withHudLast = false): Promise<void> {
  for (let i = 0; i < seconds.length; i++) {
    const wait = seconds[i]! * 1000 - (Date.now() - loaded);
    if (wait > 0) await page.waitForTimeout(wait);
    await grab(page, name, `settle-${seconds[i]}s`, { sinceReadyMs: Date.now() - loaded });
  }
  if (withHudLast) await grab(page, name, "hud", { sinceReadyMs: Date.now() - loaded }, true);
}

/** Call a QA hook method if it exists; returns `undefined` (and logs GL_SKIP) on the pre-fix build. */
async function qa(page: Page, name: string, method: string, ...args: unknown[]): Promise<unknown> {
  const out = await page.evaluate(([m, a]) => {
    const rig = (globalThis as any).__AURA_BUNKER_ZERO_QA__;
    if (!rig || typeof rig[m as string] !== "function") return { __missing: true };
    try { return { value: rig[m as string](...(a as unknown[])) ?? null }; } catch (e) { return { __error: String(e) }; }
  }, [method, args] as const);
  const o = out as { __missing?: boolean; __error?: string; value?: unknown };
  if (o.__missing) { log(`GL_SKIP ${name} qa.${method} missing`); return undefined; }
  if (o.__error) { log(`GL_STATE ${JSON.stringify({ target: name, step: method, error: o.__error })}`); return undefined; }
  log(`GL_STATE ${JSON.stringify({ target: name, step: method, value: o.value })}`);
  return o.value;
}

/** Phone targets run in a touch context (coarse pointer), like a real phone: the touch layer shows at mount. */
async function phonePage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  return ctx.newPage();
}

const click = (page: Page, selector: string) => page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), selector);

test.describe("bunker zero audit-fix", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  // ---- steady-state luma (LIGHT-03, RH-03, C24, RP-05) -----------------------------------------------------------
  test("bz-desktop-f1 @luma", async ({ page }) => {
    const loaded = await open(page, server, "desktop-f1", APP, DESKTOP);
    await qa(page, "desktop-f1", "snapshot");
    await settle(page, "desktop-f1", loaded, SETTLE, true);
    log("GL_DONE desktop-f1");
  });

  test("bz-desktop-f6 @luma", async ({ page }) => {
    const loaded = await open(page, server, "desktop-f6", APP, DESKTOP);
    await click(page, '.floor-btn[data-aura-floor="5"]');
    await settle(page, "desktop-f6", loaded, SETTLE, true);
    log("GL_DONE desktop-f6");
  });

  test("bz-desktop-f1-production @ab", async ({ page }) => {
    const loaded = await open(page, server, "desktop-f1-production", `${APP}?aura3d-render=production`, DESKTOP);
    await settle(page, "desktop-f1-production", loaded, SETTLE);
    log("GL_DONE desktop-f1-production");
  });

  test("bz-desktop-f1-nocontact @ab", async ({ page }) => {
    const loaded = await open(page, server, "desktop-f1-nocontact", `${APP}?bz-contact-shadows=0`, DESKTOP);
    await settle(page, "desktop-f1-nocontact", loaded, SETTLE);
    log("GL_DONE desktop-f1-nocontact");
  });

  test("bz-phone-f1 @phone", async ({ browser }) => {
    const page = await phonePage(browser);
    const loaded = await open(page, server, "phone-f1", APP, PHONE);
    await settle(page, "phone-f1", loaded, SETTLE.slice(1), true);
    log("GL_DONE phone-f1");
  });

  // ---- gameplay states through the QA hook (C1, C3, C4, C13, C12) ------------------------------------------------
  test("bz-states-desktop @states", async ({ page }) => {
    const name = "states-desktop";
    const loaded = await open(page, server, name, APP, DESKTOP);
    await page.waitForTimeout(Math.max(0, 20_000 - (Date.now() - loaded)));
    // C1: the boss summons guards and the game keeps running (no throw in the pose code, the sim still advances)
    await qa(page, name, "bossSummon");
    await qa(page, name, "advance", 3);
    await qa(page, name, "unfreeze");
    const t0 = await qa(page, name, "snapshot");
    await page.waitForTimeout(20_000);
    const t1 = await qa(page, name, "snapshot");
    log(`GL_STATE ${JSON.stringify({ target: name, step: "c1-after-summon", before: t0, after: t1 })}`);
    await grab(page, name, "boss-summoned", {}, false);
    await grab(page, name, "boss-summoned-hud", {}, true);
    // C3: campaign complete shows the results panel once, with no banner loop
    await qa(page, name, "campaignComplete");
    await page.waitForTimeout(9_000);
    const r = await page.evaluate(() => ({ results: !document.getElementById("bz-results")?.hidden, text: document.getElementById("bz-results")?.textContent?.replace(/\s+/g, " ").slice(0, 400) ?? null }));
    log(`GL_STATE ${JSON.stringify({ target: name, step: "c3-results", ...r, snap: await qa(page, name, "snapshot") })}`);
    await grab(page, name, "results", {}, true);
    // C4: Kill House time-out reads TIME UP, not CLEAR
    await qa(page, name, "killhouseTimeout");
    await page.waitForTimeout(1_500);
    const b = await page.evaluate(() => document.getElementById("bz-banner")?.textContent ?? null);
    log(`GL_STATE ${JSON.stringify({ target: name, step: "c4-banner", banner: b, snap: await qa(page, name, "snapshot") })}`);
    await grab(page, name, "killhouse-timeup", {}, true);
    // C13: P pauses (sim time frozen), the overlay shows, P resumes
    await click(page, "#bz-btn-play");
    await page.waitForTimeout(3_000);
    await page.keyboard.press("KeyP");
    const p0 = await qa(page, name, "snapshot");
    await page.waitForTimeout(15_000);
    const p1 = await qa(page, name, "snapshot");
    log(`GL_STATE ${JSON.stringify({ target: name, step: "c13-paused", before: p0, after: p1, overlay: await page.evaluate(() => !document.getElementById("bz-pause")?.hidden) })}`);
    await grab(page, name, "paused", {}, true);
    await page.keyboard.press("KeyP");
    log("GL_DONE states-desktop");
  });

  test("bz-states-phone @phone", async ({ browser }) => {
    const page = await phonePage(browser);
    const name = "states-phone";
    const loaded = await open(page, server, name, APP, PHONE);
    await page.waitForTimeout(Math.max(0, 25_000 - (Date.now() - loaded)));
    const touch = await page.evaluate(() => {
      const host = document.getElementById("bz-touch");
      const rects = [...document.querySelectorAll<HTMLElement>("#bz-touch [data-control]")].map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.control, w: Math.round(r.width), h: Math.round(r.height) }; });
      const feed = document.getElementById("bz-feed")?.getBoundingClientRect();
      const status = document.getElementById("bz-status")?.getBoundingClientRect();
      return { touchVisible: host ? !host.hidden : null, rects, feedBottom: feed ? Math.round(feed.bottom) : null, statusTop: status ? Math.round(status.top) : null };
    });
    log(`GL_STATE ${JSON.stringify({ target: name, step: "c12-touch", ...touch })}`);
    await grab(page, name, "touch-hud", {}, true);
    log("GL_DONE states-phone");
  });

  // ---- RH-05: the inventory screens (same names and sizes as evidence/showcase-bunker-zero/screens/final) -----------
  for (const [vp, label] of [[DESKTOP, "1280"], [PHONE, "390"]] as const) {
    test(`bz-screens-${label} @screens${label}`, async ({ browser, page: desktopPage }) => {
      const page = label === "390" ? await phonePage(browser) : desktopPage;
      const name = `screens-${label}`;
      const loaded = await open(page, server, name, APP, vp);
      await page.waitForTimeout(Math.max(0, 20_000 - (Date.now() - loaded)));
      // the title shot shows the onboarding card a first visit gets (open() closed it so the scene could settle)
      await page.evaluate(() => { const el = document.getElementById("bz-intro"); if (el) el.hidden = false; });
      await grab(page, name, `${label}-01-title`, {}, true);
      await qa(page, name, "dismissIntro");
      await click(page, "#bz-btn-play");
      await qa(page, name, "autopilot", true);
      await qa(page, name, "advance", 6);
      await qa(page, name, "unfreeze");
      await page.waitForTimeout(15_000);
      await grab(page, name, `${label}-02-early`, {}, true);
      await qa(page, name, "advance", 14);
      await qa(page, name, "unfreeze");
      await page.waitForTimeout(15_000);
      await grab(page, name, `${label}-03-action`, {}, true);
      await qa(page, name, "advance", 20);
      await qa(page, name, "unfreeze");
      await page.waitForTimeout(15_000);
      await grab(page, name, `${label}-04-mid`, {}, true);
      await click(page, "#bz-btn-menu");
      await page.waitForTimeout(8_000);
      await grab(page, name, `${label}-05-modes`, {}, true);
      log(`GL_DONE ${name}`);
    });
  }

  test("bz-screens-card @screens390", async ({ page }) => {
    const name = "screens-card";
    const loaded = await open(page, server, name, APP, CARD);
    await page.waitForTimeout(Math.max(0, 20_000 - (Date.now() - loaded)));
    await qa(page, name, "dismissIntro");
    await click(page, "#bz-btn-play");
    await qa(page, name, "autopilot", true);
    await qa(page, name, "advance", 30);
    await qa(page, name, "unfreeze");
    await page.waitForTimeout(20_000);
    await grab(page, name, "card-2x", {}, true);
    log(`GL_DONE ${name}`);
  });
});
