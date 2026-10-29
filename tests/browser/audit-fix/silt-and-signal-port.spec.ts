import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G24 (Duneglide, silt-and-signal-port). Remote only (tools/remote-acr/run.sh, software WebGL2). The ACR run has no
 * artifact egress, so everything goes to the log:
 *   G24_META <json>                      measurements (luma, layout rects, sim state, diagnostics)
 *   G24_JPG  <name> <i>/<n> <b64>        full-page JPEG (HUD included), chunked; names match evidence/silt-and-signal-port/screens/final
 *   G24_CJPG <name> <i>/<n> <b64>        canvas-only JPEG, chunked
 * Groups (pick with --grep): `g24-a` title frames, `g24-b` play states at 1280x720 and 390x844, `g24-c` card and the
 * auto-vs-production A/B, `g24-d` player-mode behaviour (touch, pause, journey totals, chapter floor and colliders).
 * Pattern from tests/browser/game-luma-capture.spec.ts. Software GL presents about one frame every several seconds, so every
 * luma number is taken at steady state (late shots), never from the first frame.
 */
const CHUNK = 16000;
const SETTLE_BUDGET_MS = 9 * 60_000;
const APP = "/apps/showcase-silt-and-signal-port/index.html";
const QA_PLAY = "?manual=1&start=1&chapter=0&objective=1";
const FLY = { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false };
const FLYB = { throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false };
const HOLD = { throttle: 0, steer: 0, lift: 0, brake: true, boost: false, interact: true };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const meta = (name: string, data: Record<string, unknown>): void => log(`G24_META ${JSON.stringify({ name, ...data })}`);

function chunked(tag: string, name: string, buf: Buffer): void {
  const b64 = buf.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`${tag} ${name} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

type Api = Record<string, any>;
/** Runs `fn(api)` in the page against window.__AURA_SILT__. */
const silt = <T>(page: Page, body: string, arg?: unknown): Promise<T> =>
  page.evaluate(({ body: b, arg: a }) => {
    const api = (window as unknown as Record<string, Api>).__AURA_SILT__;
    // eslint-disable-next-line no-new-func
    return new Function("api", "arg", b)(api, a);
  }, { body, arg }) as Promise<T>;

async function ready(page: Page, ms = 900_000): Promise<boolean> {
  try {
    await page.waitForFunction(() => (window as unknown as Record<string, Api>).__AURA_SILT__?.ready === true, undefined, { timeout: ms, polling: 1000 });
    return true;
  } catch { return false; }
}

function watch(page: Page, name: string): void {
  page.on("pageerror", (e) => log(`G24_ERR ${name} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`G24_CONSOLE ${name} ${m.type()} ${m.text().slice(0, 240)}`); });
  page.on("response", (r) => { if (r.status() >= 400) log(`G24_HTTP ${name} ${r.status()} ${r.url().slice(0, 200)}`); });
}

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
    const third = [0, 0, 0], thirdN = [0, 0, 0];
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      const band = Math.min(2, Math.floor((Math.floor(i / 4 / c.width) * 3) / c.height));
      third[band]! += y; thirdN[band]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4),
      top: +(third[0]! / Math.max(1, thirdN[0]!)).toFixed(2), mid: +(third[1]! / Math.max(1, thirdN[1]!)).toFixed(2), bottom: +(third[2]! / Math.max(1, thirdN[2]!)).toFixed(2)
    };
  }, png.toString("base64"));
}

/** Engine diagnostics the rows need: render path (quality, bloom fusion), draw calls, post warnings, OPTION_IGNORED, textures. */
const diag = (page: Page) => silt<Record<string, unknown>>(page, `
  // the hook's info() carries app.diagnostics() (the hook object has no app accessor)
  const d = api.info ? api.info().diagnostics : null;
  if (!d) return { none: true };
  const rows = (d.renderer && d.renderer.runtime && d.renderer.runtime.texturedMaterials) || [];
  const tex = { total: rows.length, textured: rows.filter((r) => r.status === "textured").length, pending: rows.filter((r) => r.status === "pending").length };
  const text = (v) => typeof v === "string" ? v : JSON.stringify(v);
  const warnings = (d.warnings || []).map(text).slice(0, 20);
  const degr = (d.degradations || []).map(text).filter((w) => /OPTION_IGNORED|bloom|post-field/i.test(w)).slice(0, 10);
  const shadow = d.shadows || d.shadow || null;
  return { renderPath: d.renderPath || null, drawCalls: d.drawCalls ?? null, programs: d.programs ?? (d.renderer && d.renderer.programs) ?? null, warnings, degradations: degr, tex, shadowMapSize: shadow && (shadow.mapSize || shadow.size) || null };
`);

async function grab(page: Page, name: string, extra: Record<string, unknown> = {}): Promise<void> {
  const full = await page.screenshot({ type: "jpeg", quality: 90 });
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: "png" });
  const cjpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  meta(name, { kind: "shot", ...extra, canvas: await lumaStats(page, png), diag: await diag(page) });
  chunked("G24_JPG", name, full);
  chunked("G24_CJPG", name, cjpg);
}

/** Polls until no textured material is pending (or the budget runs out), rendering between polls. */
async function settle(page: Page, name: string, budget = SETTLE_BUDGET_MS): Promise<void> {
  const t0 = Date.now();
  let last: unknown = null, prev = "", stable = 0;
  while (Date.now() - t0 < budget) {
    last = await silt(page, `api.render(); const d = api.info().diagnostics; const rows = (d && d.renderer && d.renderer.runtime && d.renderer.runtime.texturedMaterials) || []; return { total: rows.length, pending: rows.filter((r) => r.status === "pending").length };`).catch((e) => ({ error: String(e).slice(0, 120) }));
    const l = last as { total?: number; pending?: number };
    const key = `${l.total}/${l.pending}`;
    stable = key === prev ? stable + 1 : 0;
    prev = key;
    if ((l.total ?? 0) > 0 && l.pending === 0 && stable >= 1) break;
    await page.waitForTimeout(5000);
  }
  meta(name, { kind: "settle", seconds: Math.round((Date.now() - t0) / 1000), last });
}

/** Layout rects of the HUD pieces the rows touch (credit vs flight panel, touch buttons, objective hint). */
const layout = (page: Page) => page.evaluate(() => {
  const r = (sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), visible: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0, text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 80) };
  };
  const overlap = (a: ReturnType<typeof r>, b: ReturnType<typeof r>) => (!a || !b || !a.visible || !b.visible) ? 0 : Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const credit = r(".aura-credit"), flight = r("#flight"), touch = r("#touch"), hold = r("#touch-hold"), boost = r("#touch-boost"), pause = r("#touch-pause");
  return {
    viewport: [innerWidth, innerHeight], coarse: matchMedia("(pointer: coarse)").matches, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    credit, flight, touch, hold, boost, pause, keys: r("#keys"), objectiveCard: r("#objective-card"), hint: r("#hint"), compass: r("#compass-wrap"),
    creditOverFlight: overlap(credit, flight), creditOverTouch: overlap(credit, touch), flightOverTouch: overlap(flight, touch),
    doneStatsClass: document.getElementById("done-stats")?.className ?? null,
    hasPhoneCss: Array.from(document.styleSheets).some((s) => { try { return Array.from(s.cssRules).some((c) => c.cssText.includes("max-width: 560px")); } catch { return false; } })
  };
});

const simState = (page: Page) => silt<Record<string, unknown>>(page, `
  const s = api.state(); const st = s.state, f = s.flight;
  return { mode: api.mode(), chapter: st.chapter, objective: st.objective, point: st.point, hold: +st.hold.toFixed(3), x: +st.x.toFixed(2), y: +st.y.toFixed(2), z: +st.z.toFixed(2),
    speed: +f.speed.toFixed(2), impacts: f.impacts, scene: st.scene, pending: st.pendingChapter, completed: st.completed, restored: st.restored, elapsed: +st.elapsed.toFixed(2),
    camera: api.camera ? api.camera() : null, audio: api.info().audio };
`);

/** A touch press on one of the on-screen buttons (synthetic pointer events, pointerType touch). */
const touchButton = (page: Page, sel: string, type: "pointerdown" | "pointerup") => page.evaluate(({ sel: s, type: t }) => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new PointerEvent(t, { pointerId: 41, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true }));
  return true;
}, { sel, type });

/**
 * The example dev server bundles `apps/<app>/src/main.ts`, so `new URL("./assets/...", import.meta.url)` in the example's
 * assets.ts resolves under `/apps/<app>/src/assets/` there (the production vite build rewrites these URLs). Point those
 * requests at the example's own asset folder.
 */
async function appAssets(ctx: BrowserContext): Promise<void> {
  await ctx.route(/\/apps\/showcase-silt-and-signal-port\/src\/assets\//, (route) => route.continue({ url: route.request().url().replace("/apps/showcase-silt-and-signal-port/src/assets/", "/examples/silt-and-signal-port/assets/") }));
}

async function openPage(browser: Browser, name: string, url: string, opts: { width: number; height: number; touch?: boolean; scale?: number }): Promise<{ ctx: BrowserContext; page: Page; ok: boolean; readyMs: number }> {
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.scale ?? 1, ...(opts.touch ? { hasTouch: true, isMobile: true } : {}) });
  await appAssets(ctx);
  const page = await ctx.newPage();
  watch(page, name);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const ok = await ready(page);
  meta(name, { kind: "ready", ok, readyMs: Date.now() - t0, url: url.replace(/^https?:\/\/[^/]+/, "") });
  return { ctx, page, ok, readyMs: Date.now() - t0 };
}

test.describe("g24 duneglide", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  const at = (q: string): string => `${server.origin}${APP}${q}`;

  /* ---------------------------------------------------------------- g24-a: title frames (PROBE-1, PROBE-2, RH-05) */

  test("g24-a title desktop", async ({ browser }) => {
    const { ctx, page, ok } = await openPage(browser, "title-desktop", at(""), { width: 1280, height: 720 });
    if (ok) {
      // PROBE-1: when the loading overlay leaves and how the title frame moves after that
      const t0 = Date.now();
      const timeline: unknown[] = [];
      for (const sec of [2, 10, 25, 45, 70]) {
        const wait = sec * 1000 - (Date.now() - t0);
        if (wait > 0) await page.waitForTimeout(wait);
        const loadingHidden = await page.evaluate(() => document.getElementById("loading")?.classList.contains("hidden") ?? null);
        // what the player sees (loading screen or title card over the canvas), then the canvas alone
        const page_ = await lumaStats(page, await page.screenshot({ type: "png" }));
        const handle = await page.addStyleTag({ content: CANVAS_ONLY });
        const png = await page.screenshot({ type: "png" });
        await handle.evaluate((el) => el.remove());
        timeline.push({ sec, loadingHidden, page: { mean: page_.mean, p50: page_.p50 }, ...(await lumaStats(page, png)), tex: (await diag(page)).tex });
      }
      meta("title-desktop", { kind: "probe1-timeline", timeline, loadedAt: await page.evaluate(() => (window as unknown as { __DUNEGLIDE_LOADED_MS__?: number }).__DUNEGLIDE_LOADED_MS__ ?? null) });
      meta("title-desktop", { kind: "layout", layout: await layout(page) });
      await settle(page, "title-desktop");
      await page.waitForTimeout(8000);
      await grab(page, "title.1280x720");
    }
    await ctx.close();
  });

  test("g24-a title phone", async ({ browser }) => {
    const { ctx, page, ok } = await openPage(browser, "title-phone", at(""), { width: 390, height: 844, touch: true });
    if (ok) {
      await settle(page, "title-phone");
      await page.waitForTimeout(8000);
      meta("title-phone", { kind: "layout", layout: await layout(page) });
      await grab(page, "title.390x844");
    }
    await ctx.close();
  });

  /* ---------------------------------------------------------------- g24-b: play states (RH-05, C4, C10, C13, C14) */

  for (const [label, w, h, touch] of [["desktop", 1280, 720, false], ["phone", 390, 844, true]] as const) {
    test(`g24-b play ${label}`, async ({ browser }) => {
      const tag = `${w}x${h}`;
      const { ctx, page, ok } = await openPage(browser, `play-${label}`, at(QA_PLAY), { width: w, height: h, touch });
      if (ok) {
        await silt(page, "api.render(); api.render();");
        await settle(page, `play-${label}`);
        await silt(page, "api.render(); api.render();");
        meta(`play-${label}`, { kind: "layout", layout: await layout(page) });
        await grab(page, `gameplay-early.${tag}`, { state: await simState(page) });
        await silt(page, "api.stepFrames(120, arg); api.render(); api.render();", FLYB);
        await grab(page, `key-boost.${tag}`, { state: await simState(page) });
        if (!touch) {
          await silt(page, "api.stepFrames(360, arg); api.render(); api.render();", FLY);
          await grab(page, `mid-fly.${tag}`, { state: await simState(page) });
          // render cost per frame on this runner (C12): ms per api.render()
          const ms = await silt<number[]>(page, "const out = []; for (let i = 0; i < 3; i++) { const t = performance.now(); api.render(); out.push(Math.round(performance.now() - t)); } return out;");
          meta(`play-${label}`, { kind: "render-ms", ms });
        }
      }
      await ctx.close();
    });
  }

  /* ---------------------------------------------------------------- g24-c: card and the auto vs production A/B (RH-04, RP-05) */

  test("g24-c card", async ({ browser }) => {
    const { ctx, page, ok } = await openPage(browser, "card", at(QA_PLAY), { width: 720, height: 450, scale: 2 });
    if (ok) {
      await silt(page, "api.render();");
      await settle(page, "card");
      await silt(page, "api.stepFrames(120, arg); api.render(); api.render();", FLYB);
      await grab(page, "card.2x.1440x900");
      const png = await page.screenshot({ type: "png" });
      const jpegB64 = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = document.createElement("canvas"); c.width = 720; c.height = 450;
        const g = c.getContext("2d")!; g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, 720, 450);
        return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
      }, png.toString("base64"));
      chunked("G24_JPG", "card.1x", Buffer.from(jpegB64, "base64"));
    }
    await ctx.close();
  });

  test("g24-c render A/B", async ({ browser }) => {
    for (const [arm, q] of [["auto", ""], ["production", "&aura3d-render=production"]] as const) {
      const { ctx, page, ok } = await openPage(browser, `ab-${arm}`, at(`${QA_PLAY}${q}`), { width: 1280, height: 720 });
      if (ok) {
        await silt(page, "api.render();");
        await settle(page, `ab-${arm}`, 6 * 60_000);
        await silt(page, "api.stepFrames(120, arg); api.render(); api.render();", FLYB);
        await grab(page, `ab-${arm}-key-boost`);
      }
      await ctx.close();
    }
  });

  /* ---------------------------------------------------------------- g24-d: player behaviour (C1, C2, C3, C5, C6, C7, C13, C14) */

  test("g24-d touch care and portal", async ({ browser }) => {
    const { ctx, page, ok } = await openPage(browser, "touch", at("?chapter=0&start=1"), { width: 390, height: 844, touch: true });
    if (ok) {
      await page.touchscreen.tap(195, 420).catch(() => undefined);
      await page.waitForTimeout(500);
      meta("touch", { kind: "layout", layout: await layout(page), state: await simState(page) });
      // C1: rider parked on the care point (ch0 objective 1), Hold pressed on the touch button, sim stepped with no scripted input
      for (const [label, objective, point] of [["care", 1, { x: 0, y: 4, z: -285 }], ["portal", 3, { x: 0, y: 6, z: -1260 }]] as const) {
        await silt(page, "api.reset(0, arg.objective, { x: arg.point.x, y: arg.point.y, z: arg.point.z, yaw: 0 }); api.setMode('play');", { objective, point });
        const pressed = await touchButton(page, "#touch-hold", "pointerdown");
        await silt(page, "api.stepFrames(200);");
        const during = await simState(page);
        const hint = await page.evaluate(() => document.getElementById("hint")?.innerText ?? null);
        await touchButton(page, "#touch-hold", "pointerup");
        meta("touch", { kind: `touch-${label}`, pressed, state: during, hint });
      }
      await grab(page, "touch-hud.390x844");
    }
    await ctx.close();
  });

  test("g24-d pause, mute and journey", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await appAssets(ctx);
    const page = await ctx.newPage();
    watch(page, "journey");
    await page.goto(at("?chapter=0&start=1"), { waitUntil: "domcontentloaded" });
    if (await ready(page)) {
      const before = await simState(page);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const afterEsc = await silt(page, "return api.mode();");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const afterEsc2 = await silt(page, "return api.mode();");
      await page.keyboard.down("KeyW"); await page.waitForTimeout(300); await page.keyboard.up("KeyW");
      const audioAfterKey = (await simState(page)).audio;
      meta("journey", { kind: "c2-start1", before, afterEsc, afterEsc2, audioAfterKey, layout: await layout(page) });
      // C13: the credit and the flight panel
      await grab(page, "player-hud.1280x720");
      // C5 part 1: finish chapter 0's portal in player mode, continue, and land in chapter 1
      await silt(page, "api.reset(0, 3, { x: 0, y: 6, z: -1260, yaw: 0 }); api.setMode('play'); api.stepFrames(30, arg); api.stepFrames(200, arg);", HOLD);
      await page.waitForTimeout(3000);
      const ch0End = { state: await simState(page), sceneVisible: await page.evaluate(() => !document.getElementById("scene-screen")?.classList.contains("hidden")) };
      meta("journey", { kind: "ch0-portal", ...ch0End });
      await Promise.all([page.waitForNavigation({ timeout: 120_000 }).catch(() => null), page.evaluate(() => (document.getElementById("scene-next") as HTMLButtonElement | null)?.click())]);
      if (await ready(page)) {
        const ch1 = await simState(page);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        meta("journey", { kind: "ch1-after-reload", url: page.url().replace(server.origin, ""), state: ch1, modeAfterEsc: await silt(page, "return api.mode();"), journey: await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])))) });
        // C5 part 2: jump to the last chapter, finish it, read the results card
        await page.goto(at("?chapter=6&start=1"), { waitUntil: "domcontentloaded" });
        if (await ready(page)) {
          await silt(page, "api.reset(6, 4, { x: 0, y: 5, z: -1590, yaw: 0 }); api.setMode('play'); api.stepFrames(3);");
          await page.waitForTimeout(4000);
          const done = await page.evaluate(() => ({ visible: !document.getElementById("done-screen")?.classList.contains("hidden"), stats: document.getElementById("done-stats")?.innerText.replace(/\s+/g, " ") ?? null }));
          if (!done.visible) await silt(page, "api.setMode('done');");
          meta("journey", { kind: "results", done, state: await simState(page) });
          await silt(page, "api.render();");
          await grab(page, "results.1280x720");
        }
      }
    }
    await ctx.close();
  });

  test("g24-d chapter 1 floor and colliders", async ({ browser }) => {
    const { ctx, page, ok } = await openPage(browser, "ch1", at("?chapter=1&objective=0&manual=1&start=1"), { width: 1280, height: 720 });
    if (ok) {
      // C3: fly west off the corridor into the hill at x -100..-200 (terrain 10 to 66 m)
      await silt(page, "api.reset(1, 0, { x: -60, y: 6, z: -120, yaw: Math.PI / 2 }); api.stepFrames(150, arg); api.render(); api.render();", FLY);
      await grab(page, "ch1-hill.1280x720", { state: await simState(page) });
      // C6/C7: fly north into the chapter-1 house at (123.8, -490.2)
      await silt(page, "api.reset(1, 0, { x: 123.8, y: 4, z: -450, yaw: 0 }); api.stepFrames(150, arg); api.render(); api.render();", FLY);
      const toast = await page.evaluate(() => document.getElementById("toast")?.innerText ?? null);
      await grab(page, "ch1-house.1280x720", { state: await simState(page), toast });
    }
    await ctx.close();
  });
});
