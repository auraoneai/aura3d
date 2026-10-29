import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura Hoops 3D audit-fix captures (lane G07). Remote only (tools/remote-acr/run.sh, software WebGL2). The ACR run has no
 * artifact egress, so everything goes to the log:
 *   GL_META <json>                         stats + evidence per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  JPEG, chunked (decode with evidence/aura-hoops-3d/audit-fix-2026-10-29/decode.mjs)
 * Runs on the base commit (BEFORE) and the lane branch (AFTER); features the base lacks are logged, not assumed.
 * Software GL presents about one frame every few seconds, so first frames are never judged: every number that matters is
 * taken after a settle of 25 s or more.
 */
const ROUTE = "/apps/showcase-aura-hoops-3d/index.html";
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true'";
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

async function lumaStats(page: Page, jpg: Buffer, crop?: { x0: number; y0: number; x1: number; y1: number }) {
  return page.evaluate(async ({ b64, crop }) => {
    const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const r = crop ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
    const x0 = Math.floor(r.x0 * c.width), y0 = Math.floor(r.y0 * c.height), w = Math.max(1, Math.floor((r.x1 - r.x0) * c.width)), h = Math.max(1, Math.floor((r.y1 - r.y0) * c.height));
    const d = ctx.getImageData(x0, y0, w, h).data;
    let sum = 0, dark = 0, clip = 0;
    const n = d.length / 4;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y; if (y <= 8) dark++; if (y >= 250) clip++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4), w: c.width, h: c.height };
  }, { b64: jpg.toString("base64"), crop });
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.() ?? {};
      let lighting: unknown = null;
      try { lighting = app.lighting?.diagnostics?.() ?? null; } catch { lighting = "err"; }
      const cs = (lighting as any)?.contactShadows ?? dg?.contactShadows ?? dg?.lighting?.contactShadows ?? null;
      return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null, triangles: dg?.triangles ?? dg?.renderer?.triangles ?? null, contactShadows: cs };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => {
    const w = window as any;
    const e = w.__AURA3D_GAME_EVIDENCE__ ?? w.__AURA3D_GAME__?.evidence ?? null;
    if (!e) return null;
    const p0 = (e.athleteClips ?? []).find((a: any) => a.id === "p0");
    return {
      phase: e.phase, mode: e.mode, venue: e.venue, score: e.score, possession: e.possession, mustClear: e.mustClear, menuOpen: e.menuOpen ?? null,
      difficulty: e.difficulty, kits: e.kits ?? null, ball: e.ball, p0, framesRendered: e.framesRendered, stats: e.stats ?? null,
      lastEvents: (e.eventLog?.events ?? e.eventLog ?? []).slice?.(-8)?.map?.((r: any) => r.label) ?? null,
      touch: e.touch ?? null
    };
  });
}

async function emitJpg(target: string, id: string, jpg: Buffer): Promise<void> {
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Canvas-only luma shot (the look) plus the full-page JPEG (the HUD), both logged. */
async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}, opts: { canvas?: boolean; full?: boolean; quality?: number; crop?: { x0: number; y0: number; x1: number; y1: number } } = {}): Promise<void> {
  const out: Record<string, unknown> = { target, id, ...extra };
  if (opts.canvas !== false) {
    const handle = await page.addStyleTag({ content: CANVAS_ONLY });
    await page.waitForTimeout(250);
    const jpg = await page.screenshot({ type: "jpeg", quality: 80 });
    await handle.evaluate((el) => el.remove());
    out.canvas = await lumaStats(page, jpg);
    if (opts.crop) out.crop = await lumaStats(page, jpg, opts.crop);
    await emitJpg(target, `${id}-canvas`, jpg);
  }
  if (opts.full !== false) {
    const full = await page.screenshot({ type: "jpeg", quality: opts.quality ?? 80 });
    out.full = await lumaStats(page, full);
    await emitJpg(target, id, full);
  }
  out.info = await engineInfo(page);
  out.evidence = await evidence(page);
  log(`GL_META ${JSON.stringify(out)}`);
}

async function open(page: Page, query: string, name: string): Promise<number> {
  page.on("pageerror", (e) => log(`GL_ERR ${name} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${name} ${m.text().slice(0, 200)}`); });
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
  return Date.now();
}
const waitUntil = async (page: Page, since: number, sec: number) => { const w = sec * 1000 - (Date.now() - since); if (w > 0) await page.waitForTimeout(w); };

async function phoneContext(browser: Browser, scale = 1): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
}

/* ---------------- RH-05 retake: same file names and sizes as evidence/aura-hoops-3d/screens/final ---------------- */

const ACTION = (i: number) => `03-action-${String(i).padStart(2, "0")}-route-showcase-aura-hoops-3d-state-p`;
async function screensSet(page: Page, vp: string, actions: number): Promise<void> {
  const t0 = await open(page, "?menu=1", `screens-${vp}`);
  await waitUntil(page, t0, 25);
  await grab(page, `screens-${vp}`, "01-title", {}, { canvas: false, quality: 88 });
  const t1 = await open(page, "?autostart=1&autoplay=1", `screens-${vp}`);
  await waitUntil(page, t1, 25);
  await grab(page, `screens-${vp}`, "02-early", {}, { canvas: false, quality: 88 });
  for (let i = 1; i <= actions; i++) {
    await waitUntil(page, t1, 25 + i * 14);
    await grab(page, `screens-${vp}`, ACTION(i), {}, { canvas: false, quality: 88 });
  }
  await waitUntil(page, t1, 25 + (actions + 1) * 14 + 20);
  await grab(page, `screens-${vp}`, "04-mid", {}, { canvas: false, quality: 88 });
}

test("screens 1280x720", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await screensSet(page, "1280x720", 7);
});

test("screens 390x844", async ({ browser }) => {
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  try { await screensSet(page, "390x844", 3); } finally { await ctx.close(); }
});

test("screens card", async ({ browser }) => {
  for (const scale of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    try {
      const t0 = await open(page, "?autostart=1&autoplay=1", "card");
      await waitUntil(page, t0, 40);
      await grab(page, "screens-card", `card-${scale}x`, {}, { canvas: false, quality: 88 });
    } finally { await ctx.close(); }
  }
});

/* ---------------- C1: touch play under coarse-pointer emulation ---------------- */

test("phone touch", async ({ browser }) => {
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  try {
    const t0 = await open(page, "?court=rucker", "phone-touch");
    await waitUntil(page, t0, 25);
    const boxes = await page.evaluate(() => {
      const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const btns = [...document.querySelectorAll(".a3g-tc")].map((e) => ({ control: (e as HTMLElement).dataset.control, ...box(e)! }));
      return { coarse: matchMedia("(pointer: coarse)").matches, host: box(document.querySelector(".a3g-touch")), hostHidden: document.querySelector(".a3g-touch")?.classList.contains("a3g-hidden") ?? null, buttons: btns, stick: box(document.getElementById("touch-stick")), menu: box(document.getElementById("touch-menu")) };
    });
    const before = await evidence(page);
    await grab(page, "phone-touch", "01-controls", { boxes });
    // drag the move stick up (toward the rim) and hold it
    let moved: unknown = null;
    if (boxes.stick && boxes.stick.w > 0) {
      const cx = boxes.stick.x + boxes.stick.w / 2, cy = boxes.stick.y + boxes.stick.h / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy - boxes.stick.h * 0.45, { steps: 4 });
      await page.waitForTimeout(40_000);
      const mid = await evidence(page);
      await grab(page, "phone-touch", "02-stick-held", { held: true });
      await page.mouse.up();
      moved = { from: before?.p0, to: mid?.p0, phase: mid?.phase };
    }
    // tap SHOOT
    const shoot = boxes.buttons.find((b: any) => b.control === "light");
    if (shoot && shoot.w > 0) {
      await page.touchscreen.tap(shoot.x + shoot.w / 2, shoot.y + shoot.h / 2);
      await page.waitForTimeout(25_000);
    }
    const after = await evidence(page);
    await grab(page, "phone-touch", "03-after-shoot");
    log(`GL_META ${JSON.stringify({ target: "phone-touch", id: "result", boxes, moved, after })}`);
    expect(boxes.host && boxes.host.w * boxes.host.h, ".a3g-touch has a non-zero box on a coarse pointer").toBeGreaterThan(0);
    expect(boxes.buttons.filter((b: any) => b.w > 0 && b.h > 0).length).toBeGreaterThanOrEqual(4);
  } finally { await ctx.close(); }
});

/* ---------------- C2 / C14: one Escape opens the menu, and the open menu pauses play ---------------- */

test("escape menu pause", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const t0 = await open(page, "?court=rucker&autoplay=1", "escape");
  await waitUntil(page, t0, 30);
  const pre = await evidence(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(12_000);
  const isOpen = await page.evaluate(() => document.getElementById("menu-overlay")?.classList.contains("open") ?? false);
  const a = await evidence(page);
  await page.waitForTimeout(25_000);
  const b = await evidence(page);
  await grab(page, "escape", "01-menu-open", { isOpen });
  const frozen = Boolean(a && b && JSON.stringify(a.ball?.position) === JSON.stringify(b.ball?.position) && JSON.stringify(a.p0) === JSON.stringify(b.p0));
  // close with a second Escape and check play resumes
  await page.keyboard.press("Escape");
  await page.waitForTimeout(20_000);
  const isOpenAfter = await page.evaluate(() => document.getElementById("menu-overlay")?.classList.contains("open") ?? false);
  const inert = await page.evaluate(() => { const m = document.getElementById("menu-overlay"); return { inert: m?.hasAttribute("inert") ?? null, ariaHidden: m?.getAttribute("aria-hidden") ?? null }; });
  const c = await evidence(page);
  log(`GL_META ${JSON.stringify({ target: "escape", id: "result", isOpen, frozen, isOpenAfter, inertWhenClosed: inert, pre: pre?.phase, a: { ball: a?.ball?.position, p0: a?.p0, frames: a?.framesRendered }, b: { ball: b?.ball?.position, p0: b?.p0, frames: b?.framesRendered }, c: { ball: c?.ball?.position, phase: c?.phase } })}`);
  await grab(page, "escape", "02-closed");
  expect(isOpen, "one Escape press opens the menu").toBe(true);
  expect(frozen, "play is paused behind the open menu").toBe(true);
  expect(isOpenAfter).toBe(false);
});

/* ---------------- C22 (4) / checklist: results card ---------------- */

test("results card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const t0 = await open(page, "?court=rucker&autoplay=1&diag=1&qaTarget=2&simsteps=6", "results");
  let reached = false;
  for (let i = 0; i < 90 && Date.now() - t0 < 480_000; i++) {
    const e = await evidence(page);
    if (e?.phase === "gameover") { reached = true; break; }
    await page.waitForTimeout(5_000);
  }
  await page.waitForTimeout(8_000);
  const card = await page.evaluate(() => { const r = document.getElementById("results"); return r ? { hidden: r.hidden, text: r.innerText.replace(/\s+/g, " ").slice(0, 400) } : null; });
  await grab(page, "results", "05-results", { reached, card }, { quality: 88 });
  log(`GL_META ${JSON.stringify({ target: "results", id: "result", reached, card, sinceReadyMs: Date.now() - t0 })}`);
  expect(reached, "a short game reaches game over").toBe(true);
  expect(card?.hidden).toBe(false);
});

/* ---------------- C12 / LIGHT-06: six courts at steady state, and AO on/off pairs ---------------- */

const COURTS = ["rucker", "venice", "athens", "manila", "shanghai", "orbit"] as const;
for (const court of COURTS) {
  test(`courts ${court}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const t0 = await open(page, `?court=${court}`, `court-${court}`);
    for (const sec of [25, 60]) {
      await waitUntil(page, t0, sec);
      await grab(page, `court-${court}`, `settle-${sec}s`, { sinceReadyMs: Date.now() - t0 }, { full: false, crop: { x0: 0.3, y0: 0.4, x1: 0.7, y1: 0.9 } });
    }
  });
}

for (const court of ["rucker", "shanghai"] as const) {
  for (const ao of ["0", "1"] as const) {
    test(`ao ${court} ao=${ao}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const t0 = await open(page, `?court=${court}&diag=1&qaAo=${ao}`, `ao-${court}-${ao}`);
      await waitUntil(page, t0, 60);
      // the handler at the check stands near the frame centre in the chase camera: crop the feet and ball area
      await grab(page, `ao-${court}`, `ao${ao}-60s`, { sinceReadyMs: Date.now() - t0 }, { full: false, crop: { x0: 0.35, y0: 0.45, x1: 0.65, y1: 0.85 } });
    });
  }
}

/* ---------------- One page, every court: load once, then switch courts with the top-bar buttons ----------------
 * A full page load costs about 8 minutes of software GL, so the six-court and AO sweeps reuse one page. Each court is
 * measured 60 s after its switch (the later shots), never right after the rebuild. */
async function cycleCourts(page: Page, label: string, query: string, courts: readonly string[], settleSec = 60): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  const t0 = await open(page, `?court=${courts[0]}${query}`, label);
  for (let i = 0; i < courts.length; i++) {
    const court = courts[i]!;
    if (i > 0) await page.evaluate((c) => (document.querySelector(`[data-court="${c}"]`) as HTMLElement | null)?.click(), court);
    const since = Date.now();
    await page.waitForTimeout(settleSec * 1000);
    await grab(page, `${label}-${court}`, `settle-${settleSec}s`, { sinceSwitchMs: Date.now() - since, sinceReadyMs: Date.now() - t0 }, { full: false, crop: { x0: 0.35, y0: 0.45, x1: 0.65, y1: 0.85 } });
  }
}

test("courts all", async ({ page }) => {
  await cycleCourts(page, "courts", "", COURTS);
});

for (const ao of ["0", "1"] as const) {
  test(`ao cycle ao=${ao}`, async ({ page }) => {
    await cycleCourts(page, `ao${ao}`, `&diag=1&qaAo=${ao}`, ["rucker", "shanghai", "orbit"]);
  });
}
