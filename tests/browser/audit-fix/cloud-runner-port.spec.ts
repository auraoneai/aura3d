import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane g25 (Cumulus Dash, `cloud-runner-port`): before/after capture for the 2026-10-29 live-games audit rows.
 * Remote only (tools/remote-acr/run.sh); never local Playwright. The ACR run has no artifact egress, so output goes to the log:
 *   CR_META <json>                        luma stats, gameplay probes, diagnostics
 *   CR_JPG  <shot> <i>/<n> <b64>          JPEG frames, chunked (canvas only unless the shot name ends in "-page")
 * Works on the base commit (hook `__AURA_KID_GOKU__`) and on the lane branch (hook `__AURA_CUMULUS_DASH__`).
 * Software GL renders one frame every few seconds and the environment probe lands seconds after the first frame, so the spec
 * waits before the first measured shot and measures the second render at each place, never the first frame.
 */
const LAB = "/examples/kid-goku-beyond-the-clouds-port/?manual=1";
const CHUNK = 16000;
const POINTS = [60, 520, 1100, 1420, 1700];
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

type Api = Record<string, any>;
declare global { interface Window { __AURA_KID_GOKU__?: Api; __AURA_CUMULUS_DASH__?: Api } }

async function boot(page: Page, origin: string, url = LAB): Promise<void> {
  page.on("pageerror", (e) => log(`CR_ERR pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`CR_CONSOLE ${m.text().slice(0, 200)}`); });
  await page.goto(`${origin}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)?.ready === true, undefined, { timeout: 420_000, polling: 1000 });
  log(`CR_META ${JSON.stringify({ hook: await page.evaluate(() => (window.__AURA_CUMULUS_DASH__ ? "__AURA_CUMULUS_DASH__" : "__AURA_KID_GOKU__")) })}`);
}

/** Render once more, then read the canvas PNG and compute luma stats (whole frame, corners, centre, saturation). */
async function measure(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const api = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
    api.render(1 / 60);
    const b64: string = await api.capture();
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const w = bmp.width, h = bmp.height, d = ctx.getImageData(0, 0, w, h).data;
    const hist = new Uint32Array(256);
    let sum = 0, sat = 0, dark = 0, clip = 0, corner = 0, cornerN = 0, centre = 0, centreN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      hist[Math.round(l)]!++; sum += l;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx > 0 ? (mx - mn) / mx : 0;
      if (l <= 8) dark++; if (l >= 250) clip++;
      const cx = x < w * 0.1 || x > w * 0.9, cy = y < h * 0.12 || y > h * 0.88;
      if (cx && cy) { corner += l; cornerN++; }
      if (x > w * 0.4 && x < w * 0.6 && y > h * 0.4 && y < h * 0.6) { centre += l; centreN++; }
    }
    const n = w * h;
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { w, h, mean: r2(sum / n), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), sat: r2(sat / n), corner: r2(corner / cornerN), centre: r2(centre / centreN), darkFrac: r2(dark / n), clipFrac: r2(clip / n) };
  });
}

async function jpg(page: Page, shot: string, canvasOnly = true): Promise<void> {
  const b64 = canvasOnly
    ? await page.evaluate(async () => (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!.frame(480, 270, 0.7) as Promise<string>)
    : (await page.screenshot({ type: "jpeg", quality: 70 })).toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`CR_JPG ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** A trimmed copy of `app.diagnostics()`: lights, post passes and costs, so the run shows what the look and the authored nodes do. */
async function diagnostics(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const api = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
    let dg: any = null;
    try { dg = api.diagnostics?.() ?? null; } catch (e) { return { err: String(e) }; }
    if (!dg) return null;
    const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o[k]]));
    const text = JSON.stringify(dg);
    return {
      keys: Object.keys(dg),
      top: pick(dg, ["drawCalls", "triangles", "textureBytes", "approximateGpuMemoryBytes", "lightsEvaluated"]),
      renderPath: dg.renderPath ?? null,
      programs: dg.programs ? pick(dg.programs, ["compiledSinceReady", "total", "compileMs", "count"]) : null,
      post: dg.post ? JSON.stringify(dg.post).slice(0, 1800) : null,
      effects: dg.effects ? JSON.stringify(dg.effects).slice(0, 1500) : null,
      lighting: dg.lighting ? JSON.stringify(dg.lighting).slice(0, 1500) : dg.lights ? JSON.stringify(dg.lights).slice(0, 1500) : null,
      mentions: { ssao: /ssao/i.test(text), droppedSsao: /droppedPasses[^\]]*ssao/.test(text), vignette: /vignette/i.test(text), bloomRadius: /bloom\.radius/.test(text), hemisphere: (text.match(/hemisphere[^,}]{0,40}/g) ?? []).slice(0, 6) }
    };
  });
}

async function mobilePage(browser: Browser, options: Parameters<Browser["newContext"]>[0]): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, ...options });
  return ctx.newPage();
}

test.describe("audit g25 cloud-runner-port", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("desktop: steady-state luma at fixed points, diagnostics, gameplay probes, finale", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await boot(page, server.origin);
    // steady state: give the environment probe time to land, render a few frames first
    await page.evaluate(() => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(60); a.settle(2); });
    await page.waitForTimeout(30_000);
    for (const s of POINTS) {
      await page.evaluate((at) => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(at); a.settle(3); }, s);
      const first = await measure(page);
      const later = await measure(page);
      log(`CR_META ${JSON.stringify({ shot: `luma-${s}`, first, later })}`);
      await jpg(page, `luma-${s}`);
    }
    log(`CR_META ${JSON.stringify({ shot: "diagnostics", diagnostics: await diagnostics(page) })}`);

    // CR-1: the last heart lost on an obstacle must end the run
    const cr1 = await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      a.place(40, { lane: 2.6 });
      a.raw().hearts = 1;
      a.play(120);
      const g = a.game();
      const first = { snap: a.snapshot().phase, phase: g.phase, result: g.result ? { won: g.result.won } : null, score: Math.round(g.state.score) };
      a.play(600);
      return { first, after600: { phase: a.game().phase, score: Math.round(a.game().state.score) } };
    });
    log(`CR_META ${JSON.stringify({ shot: "cr1-obstacle-death", ...cr1 })}`);

    // CR-2: "Run it again" after a win (Enter on the result card) must restart from the start with no pearls
    const won = await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      a.place(1950);
      for (let i = 0; i < 40 && a.game().phase !== "result"; i++) a.play(60);
      return { phase: a.game().phase, won: a.game().result?.won ?? null };
    });
    await page.keyboard.press("Enter");
    const retry = await page.evaluate(() => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; const st = a.game().state; return { phase: a.game().phase, s: Math.round(st.s), balls: [...st.balls] }; });
    const label = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("#cr-ui [data-a='retry'], #cr-ui [data-a='again']")).map((b) => b.textContent));
    log(`CR_META ${JSON.stringify({ shot: "cr2-retry-after-win", won, retry, label })}`);

    // CR-5: finale framing and HUD
    await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      a.place(1955);
      for (let i = 0; i < 30 && a.game().phase !== "finale"; i++) a.play(10);
      a.play(60 * 5);
      a.settle(3);
    });
    await page.waitForTimeout(1500); // the HUD fades out over 0.4 s of real time
    const fin2 = await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      a.settle(1);
      const vis = (sel: string) => { const e = document.querySelector<HTMLElement>(sel); if (!e) return null; const cs = getComputedStyle(e); return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05; };
      return { phase: a.game().phase, t: a.game().finale?.t ?? null, hudTop: vis("#cr-ui .hud-top"), gauge: vis("#cr-ui .gauge"), bars: vis("#cr-ui .bars.t.on"), view: a.view?.() ?? null };
    });
    log(`CR_META ${JSON.stringify({ shot: "cr5-finale", ...fin2, stats: await measure(page) })}`);
    await jpg(page, "cr5-finale-page", false);
    log("CR_DONE desktop");
  });

  test("desktop 1280x720: steady-state luma, warnings, play still advances", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, server.origin);
    await page.evaluate(() => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(60); a.settle(2); });
    await page.waitForTimeout(30_000);
    for (const s of [60, 520, 1420]) {
      await page.evaluate((at) => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(at); a.settle(3); }, s);
      await measure(page);
      const later = await measure(page);
      log(`CR_META ${JSON.stringify({ shot: `hd-luma-${s}`, later })}`);
      await jpg(page, `hd-luma-${s}`);
    }
    const warn = await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      const dg: any = a.diagnostics?.() ?? null;
      const w = JSON.stringify(dg?.warnings ?? null).slice(0, 1500);
      return { warnings: w, optionIgnored: /OPTION_IGNORED/.test(JSON.stringify(dg ?? {})), drawCalls: dg?.drawCalls ?? null, renderPath: dg?.renderPath ? { path: dg.renderPath.path, quality: dg.renderPath.quality, bloomFusion: dg.renderPath.bloomFusion } : null };
    });
    log(`CR_META ${JSON.stringify({ shot: "hd-diagnostics", ...warn })}`);
    // Play from the start for 4 s of game time: distance and score must advance (the game still plays).
    const run = await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      a.place(30);
      const s0 = a.game().state.s;
      a.play(240);
      a.settle(2);
      return { s0: Math.round(s0), s1: Math.round(a.game().state.s), phase: a.game().phase, score: Math.round(a.game().state.score) };
    });
    log(`CR_META ${JSON.stringify({ shot: "hd-play", ...run, stats: await measure(page) })}`);
    await jpg(page, "hd-play-page", false);
    log("CR_DONE hd");
  });

  test("mobile portrait: ride-log framing, touch hints", async ({ browser }) => {
    const page = await mobilePage(browser, { isMobile: true, hasTouch: true });
    await boot(page, server.origin, `${LAB}&menu=0`);
    await page.evaluate(() => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(20); a.settle(2); });
    await page.waitForTimeout(20_000);
    const info = await page.evaluate(() => {
      const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
      a.place(20); a.play(30); a.settle(3);
      const help = document.querySelector("#cr-ui [data-q='help']")?.textContent ?? null;
      return { coarse: document.getElementById("cr-ui")?.classList.contains("coarse") ?? null, help, view: a.view?.() ?? null };
    });
    log(`CR_META ${JSON.stringify({ shot: "cr6-mobile-log", ...info, stats: await measure(page) })}`);
    await jpg(page, "cr6-mobile-log-page", false);
    log("CR_DONE mobile");
  });
});
