import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * The Bellkeeper's Walk (`where-the-wind-wanders-port`) audit-fix capture, lane G23. Remote only (tools/remote-acr/run.sh);
 * never local Playwright. The ACR run has no artifact egress, so everything goes to the log:
 *   WW_META <json>                 state, HUD boxes, engine diagnostics and canvas luma
 *   WW_JPG  <name> <i>/<n> <b64>   full-page JPEG (HUD included), chunked
 * The same spec runs on the base build and on the lane branch. Hooks that exist only after the fix (`realtime`, `bellAngle`,
 * `audioState`) are optional; every check is logged, nothing fails the run, so the before and after logs line up.
 *
 * Tests:
 *   `screens`  evidence screens with the file names and sizes of evidence/where-the-wind-wanders-port/screens/final.
 *   `live`     the showcase route at 1280x720, real time, steady-state luma at 3, 25 and 60 s, GLB bytes, load-status texts.
 *   `bloom`    default quality against `?aura3d-render=production` on the letter-glow frame (RP-05): mean and max diff.
 *   `touch`    390x844 touch device on the showcase route: HUD boxes, Begin under the pad, credit under the pad, pad drives,
 *              letter pickup with the journal, pause.
 *   `ending`   captions against the game clock (intro vs first letter), the bell swing, the epilogue reached by play,
 *              leaving it, then "Walk again".
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const APP = "/apps/showcase-where-the-wind-wanders-port/";
const LAB = "/examples/where-the-wind-wanders-port/";
const REPLAY = JSON.parse(readFileSync(resolve("tests/browser/data/where-the-wind-wanders-reference-replay.json"), "utf8")) as { script: { keys: string; act: "E" | "Space" | null; steps: number }[] };

type Hooks = Record<string, any>;
const hook = <T>(page: Page, body: string): Promise<T> => page.evaluate(`(async (w) => { ${body} })(window.__AURA_WIND__)`) as Promise<T>;

async function waitReady(page: Page, timeout = 900_000): Promise<void> {
  await page.waitForFunction(() => {
    const w = window as unknown as { __AURA_WIND__?: Hooks; __AURA_WIND_ERROR__?: string };
    return w.__AURA_WIND__?.ready?.() === true || Boolean(w.__AURA_WIND_ERROR__);
  }, undefined, { timeout, polling: 1000 });
  const err = await page.evaluate(() => (window as unknown as { __AURA_WIND_ERROR__?: string }).__AURA_WIND_ERROR__ ?? null);
  if (err) log(`WW_ERR boot ${err.slice(0, 400)}`);
}

/** HUD boxes, captions and engine numbers. */
async function probe(page: Page) {
  return page.evaluate(() => {
    const w = (window as unknown as { __AURA_WIND__?: Hooks }).__AURA_WIND__;
    const box = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const shown = cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
      return shown ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null;
    };
    const sels = { quest: "#quest", hint: "#hint", bar: "#wwui-bar", journal: "#wwui-journal", title: "#wwui-title .card", begin: "#wwui-begin", touch: "#wwui-touch", pad: "#wwui-pad", acts: "#wwui-acts", pause: "#wwui-pause-btn", credit: ".aura-credit", creditLink: ".aura-credit a", caption: "#wwui-caption", prompt: "#wwui-prompt", epilogue: "#wwui-epilogue", again: "#wwui-again", fade: "#wwui-fade" };
    const boxes: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(sels)) boxes[k] = box(s);
    const overlap = (a: any, b: any) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const pairs: string[] = [];
    const hudKeys = ["quest", "hint", "bar", "pad", "acts", "creditLink"];
    for (let i = 0; i < hudKeys.length; i++) for (let j = i + 1; j < hudKeys.length; j++) if (overlap(boxes[hudKeys[i]!], boxes[hudKeys[j]!])) pairs.push(`${hudKeys[i]}~${hudKeys[j]}`);
    if (overlap(boxes.begin, boxes.pad)) pairs.push("begin~pad");
    const cap = document.getElementById("wwui-caption");
    const dg = w?.diagnostics ?? null;
    const warnings = ((dg?.warnings ?? []) as unknown[]).map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter((x) => /deprecat|bloom|qualityProfile|OPTION_IGNORED|QUALITY/i.test(x)).map((x) => x.slice(0, 160));
    let state: unknown = null;
    try { state = w?.state?.(); } catch { /* not ready */ }
    return {
      url: location.pathname + location.search,
      state,
      boxes,
      overlaps: pairs,
      caption: cap ? { text: cap.textContent, on: cap.classList.contains("on"), ariaLive: cap.getAttribute("aria-live") } : null,
      journalOpen: !!boxes.journal,
      titleVisible: !!boxes.title,
      paused: !!document.querySelector("#wwui-pause:not(.hide)"),
      drawCalls: dg?.drawCalls ?? null,
      renderPath: dg?.renderPath ?? null,
      warnings,
      errors: (dg?.errors ?? []).length,
      bellAngle: typeof w?.bellAngle === "number" ? +w.bellAngle.toFixed(4) : null,
      audio: w?.audioState ?? null
    };
  });
}

async function canvasLuma(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas#world") as HTMLCanvasElement | null;
    const w = (window as unknown as { __AURA_WIND__?: Hooks }).__AURA_WIND__;
    if (!c || !w) return null;
    w.stepFrames?.(0);
    const out = document.createElement("canvas");
    out.width = 320; out.height = Math.max(1, Math.round(320 * c.height / Math.max(1, c.width)));
    const ctx = out.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(c, 0, 0, out.width, out.height);
    const d = ctx.getImageData(0, 0, out.width, out.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, dark = 0, clip = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
  });
}

async function shot(page: Page, name: string, extra: Record<string, unknown> = {}, scale: "css" | "device" = "css"): Promise<void> {
  const meta = await probe(page);
  const luma = await canvasLuma(page).catch(() => null);
  log(`WW_META ${JSON.stringify({ name, ...extra, luma, ...meta })}`);
  const jpg = await page.screenshot({ type: "jpeg", quality: 84, scale });
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`WW_JPG ${name} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

function watchPage(page: Page, tag: string): void {
  page.on("pageerror", (e) => log(`WW_ERR ${tag} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`WW_CONSOLE ${tag} ${m.type()} ${m.text().slice(0, 240)}`); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) log(`WW_NAV ${tag} ${f.url()}`); });
}

async function phoneContext(browserContext: BrowserContext): Promise<BrowserContext> {
  const browser = browserContext.browser()!;
  return browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
}

test.describe("where-the-wind-wanders-port audit fix (G23)", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("screens", async ({ page, context }) => {
    watchPage(page, "screens");
    await page.setViewportSize({ width: 1280, height: 720 });
    // title card: the real-time page, judged after it has run for a while
    await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.waitForTimeout(20_000);
    await shot(page, "title-settle.1280x720");
    await page.waitForTimeout(15_000);
    await shot(page, "title.1280x720");

    await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await hook(page, "w.stepFrames(60); return 0;");
    await page.waitForTimeout(4000);
    await shot(page, "gameplay-early-settle.1280x720");
    await hook(page, "w.stepFrames(1); return 0;");
    await shot(page, "gameplay-early.1280x720");
    await hook(page, "w.stepFrames(120, 'D'); return 0;");
    await shot(page, "key-walk.1280x720");
    // card: the key-walk frame at 720x450, 2x
    await page.setViewportSize({ width: 720, height: 450 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(1500);
    await hook(page, "w.stepFrames(1); return 0;");
    await shot(page, "card.1x", {}, "css");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(1500);
    await hook(page, "w.stepFrames(180, 'D'); return 0;");
    await shot(page, "mid-walk.1280x720");
    // results: the epilogue reached by play (the original's recorded run rings the bell), then 9 s + 6 s on the game clock
    await hook(page, `w.reset(); w.runScript(${JSON.stringify(REPLAY.script)}); return 0;`);
    const hasRealtime = await hook<boolean>(page, "return typeof w.realtime === 'function';");
    if (hasRealtime) await hook(page, "w.realtime(9.5 + 6); return 0;");
    else await hook(page, "w.epilogue(6); return 0;");
    await page.waitForTimeout(1500);
    await shot(page, "results.1280x720", { reachedByPlay: hasRealtime });

    // 2x card in its own context (deviceScaleFactor 2)
    const card = await context.browser()!.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    const cp = await card.newPage();
    watchPage(cp, "card");
    await cp.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await waitReady(cp);
    await hook(cp, "w.stepFrames(180, 'D'); return 0;");
    await cp.waitForTimeout(1500);
    await hook(cp, "w.stepFrames(1); return 0;");
    await shot(cp, "card.2x.1440x900", {}, "device");
    await card.close();

    // phone
    const phone = await phoneContext(context);
    const pp = await phone.newPage();
    watchPage(pp, "screens-phone");
    await pp.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await waitReady(pp);
    await pp.waitForTimeout(20_000);
    await shot(pp, "title.390x844");
    await pp.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await waitReady(pp);
    await hook(pp, "w.stepFrames(60); return 0;");
    await pp.waitForTimeout(3000);
    await hook(pp, "w.stepFrames(1); return 0;");
    await shot(pp, "gameplay-early.390x844");
    await hook(pp, "w.stepFrames(120, 'D'); return 0;");
    await shot(pp, "key-walk.390x844");
    await phone.close();
    log("WW_DONE screens");
  });

  test("live", async ({ page }) => {
    watchPage(page, "live");
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __WW_LOADING__: string[] }).__WW_LOADING__ = seen;
      const watch = () => {
        const el = document.getElementById("loading-status");
        if (!el) return void requestAnimationFrame(watch);
        seen.push(el.textContent ?? "");
        new MutationObserver(() => { const t = el.textContent ?? ""; if (seen[seen.length - 1] !== t) seen.push(t); }).observe(el, { childList: true, characterData: true, subtree: true });
      };
      document.addEventListener("DOMContentLoaded", watch);
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}${APP}?start=1`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const loaded = Date.now();
    const glbs = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\.glb(\?|$)/.test(e.name)).map((e) => {
      const r = e as PerformanceResourceTiming;
      return { file: r.name.split("/").pop(), encoded: r.encodedBodySize, decoded: r.decodedBodySize };
    }));
    const total = glbs.reduce((s, g) => s + (g.decoded || 0), 0);
    log(`WW_META ${JSON.stringify({ name: "live-assets", glbs, totalDecodedBytes: total, loadingTexts: await page.evaluate(() => (window as unknown as { __WW_LOADING__?: string[] }).__WW_LOADING__ ?? []) })}`);
    const routeHealth = await hook(page, "return w.routeHealth?.() ?? null;").catch((e) => ({ error: String(e) }));
    const diag = await hook<any>(page, "const d = w.diagnostics; return d ? { drawCalls: d.drawCalls, renderPath: d.renderPath, triangles: d.triangles ?? d.renderer?.triangles ?? null, warnings: (d.warnings ?? []).map((x) => typeof x === 'string' ? x : (x.code ?? '') + ' ' + (x.message ?? '')).slice(0, 40) } : null;");
    log(`WW_META ${JSON.stringify({ name: "live-diagnostics", routeHealth, diag })}`);
    for (const sec of [3, 25, 60]) {
      const wait = sec * 1000 - (Date.now() - loaded);
      if (wait > 0) await page.waitForTimeout(wait);
      await shot(page, `live-settle-${sec}s.1280x720`, { sinceReadyMs: Date.now() - loaded });
    }
    log("WW_DONE live");
  });

  test("bloom", async ({ page }) => {
    watchPage(page, "bloom");
    await page.setViewportSize({ width: 640, height: 360 });
    const grab = async (q: string) => {
      await page.goto(`${server.origin}${APP}?manual=1${q}`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      await hook(page, "w.teleport(-22.5, 6.2); w.stepFrames(30); return 0;");
      await page.waitForTimeout(3000);
      const out: { rgba: string; renderPath: unknown }[] = [];
      for (const extra of [0, 60]) {
        const r = await page.evaluate((more) => {
          const w = (window as unknown as { __AURA_WIND__: Hooks }).__AURA_WIND__;
          w.stepFrames(more);
          const c = document.querySelector("canvas#world") as HTMLCanvasElement;
          const o = document.createElement("canvas");
          o.width = c.width; o.height = c.height;
          const ctx = o.getContext("2d", { willReadFrequently: true })!;
          w.stepFrames(0);
          ctx.drawImage(c, 0, 0);
          const d = ctx.getImageData(0, 0, o.width, o.height).data;
          let s = "";
          for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, Math.min(d.length, i + 8192)));
          return { rgba: btoa(s), w: o.width, h: o.height, renderPath: w.diagnostics?.renderPath ?? null };
        }, extra);
        out.push(r);
      }
      await shot(page, `bloom${q ? "-production" : "-default"}.640x360`);
      return out;
    };
    const a = await grab("");
    const b = await grab("&aura3d-render=production");
    for (let k = 0; k < a.length; k++) {
      const da = Buffer.from(a[k]!.rgba, "base64"), db = Buffer.from(b[k]!.rgba, "base64");
      let sum = 0, max = 0, over2 = 0, n = 0;
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        if ((i & 3) === 3) continue;
        const d = Math.abs(da[i]! - db[i]!);
        sum += d; n++; if (d > max) max = d; if (d > 2) over2++;
      }
      log(`WW_META ${JSON.stringify({ name: `bloom-diff-${k}`, bytes: [da.length, db.length], meanAbs: +(sum / Math.max(1, n)).toFixed(4), max, over2Frac: +(over2 / Math.max(1, n)).toFixed(5), pathDefault: a[k]!.renderPath, pathProduction: b[k]!.renderPath })}`);
    }
    log("WW_DONE bloom");
  });

  test("touch", async ({ context }) => {
    const phone = await phoneContext(context);
    const page = await phone.newPage();
    watchPage(page, "touch");
    await page.goto(`${server.origin}${APP}`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.waitForTimeout(15_000);
    await shot(page, "touch-title.390x844");
    // what a tap on the middle of the Begin button reaches, and what the pad's corners reach
    const hits = await page.evaluate(() => {
      const at = (x: number, y: number) => { const el = document.elementFromPoint(x, y) as HTMLElement | null; return el ? (el.id || el.className || el.tagName) : null; };
      const b = document.getElementById("wwui-begin")?.getBoundingClientRect();
      return { beginCenter: b ? at(b.left + b.width / 2, b.top + b.height / 2) : null };
    });
    log(`WW_META ${JSON.stringify({ name: "touch-title-hits", ...hits })}`);
    const begin = await page.evaluate(() => { const r = document.getElementById("wwui-begin")!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(begin.x, begin.y);
    await page.waitForTimeout(2500);
    await shot(page, "touch-begun.390x844");
    // grid over the pad: how many points land on the credit link instead of the pad
    const grid = await page.evaluate(() => {
      const pad = document.getElementById("wwui-pad");
      if (!pad || pad.getBoundingClientRect().width === 0) return { pad: false };
      const r = pad.getBoundingClientRect();
      let total = 0, credit = 0, padHits = 0;
      for (let y = r.top + 2; y < r.bottom; y += 8) for (let x = r.left + 2; x < r.right; x += 8) {
        total++;
        const el = document.elementFromPoint(x, y);
        if (el?.closest(".aura-credit a")) credit++;
        if (el?.closest("#wwui-pad")) padHits++;
      }
      return { pad: true, total, credit, padHits };
    });
    log(`WW_META ${JSON.stringify({ name: "touch-pad-grid", ...grid })}`);
    // drive the pad up with a real touch for 4 s
    const cdp = await phone.newCDPSession(page);
    const pad = await page.evaluate(() => { const r = document.getElementById("wwui-pad")?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom, left: r.left } : null; });
    const before = await hook<any>(page, "return w.state();");
    if (pad) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pad.x, y: pad.y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pad.x + 4, y: pad.y - 50 }] });
      await page.waitForTimeout(4000);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const after = await hook<any>(page, "return w.state();");
    log(`WW_META ${JSON.stringify({ name: "touch-drive", before: before?.pos, after: after?.pos, moved: before && after ? +Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z).toFixed(3) : null })}`);
    // tap the pad's lower-left area, where the credit link used to sit
    if (pad) {
      const urlBefore = page.url();
      await page.touchscreen.tap(pad.left + 24, pad.bottom - 18);
      await page.waitForTimeout(2500);
      log(`WW_META ${JSON.stringify({ name: "touch-pad-corner-tap", urlBefore, urlAfter: page.url(), navigated: page.url() !== urlBefore })}`);
      if (page.url() !== urlBefore) { await page.goto(`${server.origin}${APP}?start=1`, { waitUntil: "domcontentloaded" }); await waitReady(page); }
    }
    // pick up the oak letter with Act: does the journal cover the screen?
    await hook(page, "w.teleport(-24.2, 4.4); return 0;");
    await page.waitForTimeout(1500);
    await shot(page, "touch-near-letter.390x844");
    const act = await page.evaluate(() => { const r = document.getElementById("wwui-act")?.getBoundingClientRect(); return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
    if (act) await page.touchscreen.tap(act.x, act.y);
    await page.waitForTimeout(3000);
    await shot(page, "touch-letter.390x844");
    const pauseBtn = await page.evaluate(() => { const r = document.getElementById("wwui-pause-btn")?.getBoundingClientRect(); return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
    log(`WW_META ${JSON.stringify({ name: "touch-pause-button", present: !!pauseBtn })}`);
    if (pauseBtn) {
      await page.touchscreen.tap(pauseBtn.x, pauseBtn.y);
      await page.waitForTimeout(1500);
      await shot(page, "touch-paused.390x844");
      await page.touchscreen.tap(195, 422);
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(15_000);
    await shot(page, "touch-steady.390x844");
    await phone.close();
    log("WW_DONE touch");
  });

  test("ending", async ({ page }) => {
    watchPage(page, "ending");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}${APP}`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await page.waitForTimeout(3000);
    await page.keyboard.press("Enter");
    // WW-5: pick the oak letter up right away, then let 6.5 s of wall time pass (the intro used to fire at 5.6 s)
    await hook(page, "w.teleport(-24.2, 4.4); w.applyInput('', 'E'); return 0;");
    const capAt = async (label: string) => { const p = await probe(page); log(`WW_META ${JSON.stringify({ name: label, caption: p.caption, found: (p.state as any)?.found, paused: p.paused, audio: p.audio, prompt: p.boxes.prompt })}`); return p; };
    await capAt("caption-after-letter");
    await page.waitForTimeout(6500);
    await capAt("caption-6.5s-after-letter");
    // pause: the caption must not run out while paused
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(12_000);
    await capAt("caption-paused-12s");
    await page.keyboard.press("KeyP");
    // WW-11: walk to the windmill letter and read the prompt
    await hook(page, "w.teleport(16.6, -3.2); return 0;");
    await page.waitForTimeout(2500);
    await shot(page, "prompt-near-letter.1280x720");
    // WW-4 / WW-6: the original's recorded run rings the bell
    await hook(page, `w.reset(); w.runScript(${JSON.stringify(REPLAY.script)}); return 0;`);
    const angles: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(2500);
      const p = await probe(page);
      angles.push(p.bellAngle);
      if (i === 1) await shot(page, "bell-ringing.1280x720");
    }
    log(`WW_META ${JSON.stringify({ name: "bell-swing", angles })}`);
    const hasRealtime = await hook<boolean>(page, "return typeof w.realtime === 'function';");
    if (hasRealtime) await hook(page, "w.realtime(9.5); return 0;");
    await page.waitForFunction(() => !document.getElementById("wwui-epilogue")?.classList.contains("hide"), undefined, { timeout: 1_200_000, polling: 1000 });
    await page.waitForTimeout(1000);
    await shot(page, "epilogue-start.1280x720", { reachedByPlay: true });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    await shot(page, "epilogue-left.1280x720");
    await page.waitForTimeout(14_000);
    await capAt("caption-14s-after-leaving-epilogue");
    // WW-10: reach the epilogue again and press "Walk again"
    if (hasRealtime) {
      await hook(page, `w.reset(); w.runScript(${JSON.stringify(REPLAY.script)}); w.realtime(9.5 + 2); return 0;`);
      await page.waitForTimeout(1500);
      const again = await page.evaluate(() => { const r = document.getElementById("wwui-again")?.getBoundingClientRect(); return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
      log(`WW_META ${JSON.stringify({ name: "walk-again-button", present: !!again })}`);
      if (again) {
        await page.mouse.click(again.x, again.y);
        await page.waitForTimeout(600);
        await shot(page, "walk-again-fade.1280x720");
        await hook(page, "w.realtime(2); return 0;");
        await page.waitForTimeout(1500);
        await shot(page, "walk-again-title.1280x720");
      }
    }
    log("WW_DONE ending");
  });
});
