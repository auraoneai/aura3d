import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura Links 3D audit-fix captures (lane G10). Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so
 * everything goes to the log, in the same format as tests/browser/game-luma-capture.spec.ts:
 *   GL_META <json>                         luma stats, game evidence and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG (or full page for HUD shots), chunked
 *   GL_STATE <json>                        gameplay probe results (QA hook targets)
 * The software-GL runner presents about one frame every 5 to 10 s, so the first shot is never trusted: judge the later ones.
 * Gameplay targets drive the game's own frame() through the `?qa=1` hook (window.__AURA_LINKS_QA__.advance), which steps game
 * logic in simulated time without waiting for rendered frames; the shot after an advance shows the state the logic reached.
 * Targets whose hook is missing (the pre-fix build) log GL_SKIP and pass.
 */
const SETTLE_SECONDS = (process.env.GL_SETTLE ?? "30,75").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true'";
const APP = "/apps/showcase-aura-links-3d/index.html";
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

interface Target {
  readonly name: string;
  readonly url: string;
  readonly viewport: { width: number; height: number };
  readonly phone?: boolean;
  /** device scale factor (card-2x) */
  readonly scale?: number;
  /** grep tag, e.g. "@w2" (SPECS cannot carry a `|` regex, so batches select by tag) */
  readonly tag?: string;
  /** steady-state render captures (default) or a gameplay probe */
  run?(page: Page, name: string): Promise<void>;
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
    let sum = 0, dark = 0, clip = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { w: c.width, h: c.height, mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
  }, png.toString("base64"));
}

async function gameInfo(page: Page) {
  return page.evaluate(() => {
    const ev = (globalThis as any).__AURA3D_GAME_EVIDENCE__ ?? null;
    const reg = (globalThis as any).__AURA3D_LIVE_APPS__;
    const app = reg?.all?.()[0];
    let diag: any = null;
    try { const dg = app?.diagnostics?.(); diag = { renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null, errors: (dg?.errors ?? []).length }; } catch (e) { diag = { err: String(e) }; }
    return {
      diag,
      game: ev ? { mode: ev.mode, phase: ev.phase, cameraMode: ev.cameraMode, course: ev.course, hole: ev.hole, strokes: ev.strokes, lie: ev.lie, club: ev.club, ballStatus: ev.ballStatus, toPar: ev.toPar, cameraEye: ev.cameraEye ?? null } : null
    };
  });
}

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}, withHud = false): Promise<void> {
  const handle = withHud ? null : await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle?.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`GL_META ${JSON.stringify({ target, id, hud: withHud, ...extra, ...stats, info: await gameInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** wait for one more presented frame after a logic advance (software GL is slow) */
async function settleFrames(page: Page, ms = 12_000): Promise<void> {
  await page.waitForTimeout(ms);
}

const hasQa = (page: Page) => page.evaluate(() => Boolean((globalThis as any).__AURA_LINKS_QA__));
const qa = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (globalThis as any).__AURA_LINKS_QA__[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

/** advance simulated time until the predicate on evidence holds or the budget runs out */
async function advanceUntil(page: Page, predicate: string, budgetS: number, stepS = 4): Promise<any> {
  let spent = 0;
  let ev: any = null;
  while (spent < budgetS) {
    ev = await qa(page, "advance", stepS);
    spent += stepS;
    if (await page.evaluate((p) => { const e = (globalThis as any).__AURA_LINKS_QA__.evidence(); return new Function("e", `return (${p});`)(e); }, predicate)) break;
  }
  return { spent, ev: await qa(page, "evidence") };
}

const steadyState = async (page: Page, name: string): Promise<void> => {
  const loaded = Date.now();
  for (const sec of SETTLE_SECONDS) {
    const wait = sec * 1000 - (Date.now() - loaded);
    if (wait > 0) await page.waitForTimeout(wait);
    await grab(page, name, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
  }
  await grab(page, name, "hud", { sinceReadyMs: Date.now() - loaded }, true);
};

/** C1/C2/C3/C19: autopilot plays hole 1 to a hole-out, the scorecard shows, hole 2 tees off on the aim camera. */
const holeOut = async (page: Page, name: string): Promise<void> => {
  if (!(await hasQa(page))) { log(`GL_SKIP ${name} no __AURA_LINKS_QA__ (pre-fix build)`); return; }
  await settleFrames(page, 15_000);
  const start = await qa<any>(page, "evidence");
  const holed = await advanceUntil(page, "e.phase === 'card' || e.hole !== 1", 400, 3);
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "hole-out", start: { hole: start.hole, strokes: start.strokes }, spentS: holed.spent, phase: holed.ev.phase, hole: holed.ev.hole, card: holed.ev.card, strokesLog: holed.ev.eventLog?.events?.filter((x: any) => x.type === "shot" || x.type === "score" || x.type === "lie").map((x: any) => x.label) ?? null })}`);
  await settleFrames(page);
  await grab(page, name, "scorecard", { probe: "hole-out" }, true);
  const next = await advanceUntil(page, "e.hole === 2 && e.phase === 'address'", 30, 0.5);
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "hole-2-address", spentS: next.spent, hole: next.ev.hole, phase: next.ev.phase, cameraMode: next.ev.cameraMode })}`);
  await settleFrames(page);
  await grab(page, name, "hole2-address", { probe: "hole-2-address" });
};

/** C8: Escape mid-flight, close the menu, the shot resumes and the hole still counts once. */
const menuMidShot = async (page: Page, name: string): Promise<void> => {
  if (!(await hasQa(page))) { log(`GL_SKIP ${name} no __AURA_LINKS_QA__ (pre-fix build)`); return; }
  await settleFrames(page, 10_000);
  const flying = await advanceUntil(page, "e.phase === 'flight'", 30, 0.25);
  const before = flying.ev;
  await page.keyboard.press("Escape");
  await qa(page, "advance", 0.1);
  const inMenu = await qa<any>(page, "evidence");
  await page.evaluate(() => (document.getElementById("menu-close") as HTMLElement | null)?.click());
  await qa(page, "advance", 0.5);
  const after = await qa<any>(page, "evidence");
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "menu-mid-shot", before: { phase: before.phase, mode: before.mode, ball: before.ball?.status, strokes: before.strokes }, inMenu: { phase: inMenu.phase }, after: { phase: after.phase, mode: after.mode, ball: after.ball?.status, ballZ: after.ballZ, strokes: after.strokes } })}`);
};

/** C14: reduced motion holds the menu camera still. */
const reducedMotion = async (page: Page, name: string): Promise<void> => {
  if (!(await hasQa(page))) { log(`GL_SKIP ${name} no __AURA_LINKS_QA__ (pre-fix build)`); return; }
  const a = await qa<any>(page, "evidence");
  await qa(page, "advance", 3);
  const b = await qa<any>(page, "evidence");
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "reduced-motion-menu", eyeA: a.cameraEye, eyeB: b.cameraEye, flagRotation: b.flagRotation ?? null })}`);
};

/** C6: frame a pond from above so its visible edge can be compared with the hazard radius. */
const pondView = async (page: Page, name: string): Promise<void> => {
  if (!(await hasQa(page))) {
    log(`GL_SKIP ${name} no __AURA_LINKS_QA__ (pre-fix build) — default tee shot instead`);
    await steadyState(page, name);
    return;
  }
  const info = await qa<any>(page, "framePond", 0);
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "pond", info })}`);
  await settleFrames(page, 25_000);
  await grab(page, name, "pond-top", { probe: "pond", info });
  await settleFrames(page, 15_000);
  await grab(page, name, "pond-top-2", { probe: "pond", info });
};

/** C1/C19: autopilot plays all nine holes; the closing scorecard (hole-by-hole, totals) shows at round over. */
const roundOut = async (page: Page, name: string): Promise<void> => {
  if (!(await hasQa(page))) { log(`GL_SKIP ${name} no __AURA_LINKS_QA__ (pre-fix build)`); return; }
  await settleFrames(page, 15_000);
  const done = await advanceUntil(page, "e.phase === 'roundover'", 1500, 4);
  const card = await page.evaluate(() => ({
    shown: document.getElementById("final-card")?.classList.contains("show") ?? false,
    title: document.getElementById("fc-title")?.textContent ?? null,
    rows: [...document.querySelectorAll("#fc-table tr")].map((tr) => tr.textContent?.replace(/\s+/g, " ").trim()),
    foot: document.getElementById("fc-foot")?.textContent ?? null
  }));
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "round-out", spentS: done.spent, phase: done.ev.phase, hole: done.ev.hole, card: done.ev.card, finalCard: card })}`);
  await settleFrames(page, 15_000);
  await grab(page, name, "04-results", { probe: "round-out" }, true);
};

/**
 * RH-05: retake of evidence/aura-links-3d/screens/final with the same file names and sizes. The player drives the
 * three-press swing with Space; logic advances through the ?qa=1 hook so each shot shows the state it is named for.
 */
const screensRun = async (page: Page, name: string): Promise<void> => {
  if (!(await hasQa(page))) { log(`GL_SKIP ${name} no __AURA_LINKS_QA__ (pre-fix build)`); return; }
  const snap = async (id: string, ms = 12_000) => { await settleFrames(page, ms); await grab(page, name, id, {}, true); };
  await qa(page, "advance", 0.5);
  await snap("02-early", 20_000);
  await advanceUntil(page, "e.phase === 'address'", 10, 0.25);
  await qa(page, "advance", 0.5);
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "figures-at-address", figures: await qa(page, "figures") })}`);
  await snap("03-action-01-address");
  await page.keyboard.press("Space");
  await qa(page, "advance", 0.7);
  await snap("03-action-02-power");
  await page.keyboard.press("Space");
  await qa(page, "advance", 0.45);
  await snap("03-action-03-accuracy");
  await page.keyboard.press("Space");
  for (let i = 0; i < 6; i++) { await qa(page, "advance", i === 0 ? 0.15 : 0.4); await snap(`03-action-${String(4 + i).padStart(2, "0")}-swing-${i}`); }
  await qa(page, "advance", 4);
  await snap("03-action-10-route-showcase-aura-links-3d-state-p");
  const ev = await qa<any>(page, "evidence");
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "screens", phase: ev.phase, strokes: ev.strokes, hudStrokes: await page.evaluate(() => document.getElementById("h-strokes")?.textContent ?? null), lastShot: ev.eventLog?.events?.filter((x: any) => x.type === "shot").map((x: any) => x.label) ?? null })}`);
};
const titleRun = async (page: Page, name: string): Promise<void> => {
  await settleFrames(page, 25_000);
  await grab(page, name, "01-title", {}, true);
};
const cardRun = async (page: Page, name: string): Promise<void> => {
  await settleFrames(page, 30_000);
  await grab(page, name, name.endsWith("2x") ? "card-2x" : "card-1x");
};

/** RH-04 checklist: renderPath, bloom fusion, OPTION_IGNORED and contact-shadow availability from app.diagnostics(). */
const diagRun = async (page: Page, name: string): Promise<void> => {
  await settleFrames(page, 30_000);
  const d = await page.evaluate(() => {
    const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.()[0];
    const dg = app?.diagnostics?.() ?? null;
    const text = JSON.stringify(dg ?? {});
    const hits = (re: RegExp) => [...new Set(text.match(re) ?? [])].slice(0, 12);
    const find = (o: any, key: string, path = "", out: string[] = []): string[] => {
      if (!o || typeof o !== "object" || out.length > 12) return out;
      for (const [k, v] of Object.entries(o)) {
        const p = path ? `${path}.${k}` : k;
        if (k.toLowerCase().includes(key)) out.push(`${p}=${JSON.stringify(v)?.slice(0, 300)}`);
        if (v && typeof v === "object") find(v, key, p, out);
      }
      return out;
    };
    return {
      renderPath: dg?.renderPath ?? null,
      drawCalls: dg?.drawCalls ?? null,
      errors: (dg?.errors ?? []).length,
      optionIgnored: hits(/OPTION_IGNORED[^"]{0,160}/g),
      unavailable: hits(/"unavailable":[^,}]{0,120}/g),
      contact: find(dg, "contact")
    };
  });
  log(`GL_STATE ${JSON.stringify({ target: name, probe: "diagnostics", ...d })}`);
  await grab(page, name, "diag-30s");
};

const COURSE_IDS = ["mapleHollow", "cinderRim", "cloudTerrace", "neonBay", "mareCourse"] as const;

const TARGETS: readonly Target[] = [
  { name: "links-desktop-stAuroras", url: `${APP}?course=stAuroras`, viewport: DESKTOP, tag: "@w2" },
  { name: "links-phone-stAuroras", url: `${APP}?course=stAuroras`, viewport: PHONE, phone: true, tag: "@w3" },
  ...COURSE_IDS.map((id) => ({ name: `links-desktop-${id}`, url: `${APP}?course=${id}`, viewport: DESKTOP, tag: id === "neonBay" || id === "mareCourse" ? "@w2" : "@w3" })),
  { name: "links-phone-neonBay", url: `${APP}?course=neonBay`, viewport: PHONE, phone: true, tag: "@w2" },
  { name: "links-phone-mareCourse", url: `${APP}?course=mareCourse`, viewport: PHONE, phone: true, tag: "@w3" },
  { name: "links-play-holeout-desktop", url: `${APP}?course=stAuroras&autoplay=1&qa=1`, viewport: DESKTOP, run: holeOut, tag: "@play" },
  { name: "links-play-holeout-phone", url: `${APP}?course=stAuroras&autoplay=1&qa=1`, viewport: PHONE, phone: true, run: holeOut, tag: "@round" },
  { name: "links-play-menu-midshot", url: `${APP}?course=stAuroras&autoplay=1&qa=1`, viewport: DESKTOP, run: menuMidShot, tag: "@play" },
  { name: "links-play-reduced-motion", url: `${APP}?menu=1&reducedMotion=1&qa=1`, viewport: DESKTOP, run: reducedMotion, tag: "@play" },
  { name: "links-pond-mapleHollow", url: `${APP}?course=mapleHollow&hole=7&qa=1`, viewport: DESKTOP, run: pondView, tag: "@play" },
  { name: "links-play-roundout-desktop", url: `${APP}?course=stAuroras&autoplay=1&qa=1`, viewport: DESKTOP, run: roundOut, tag: "@round" },
  { name: "links-play-roundout-phone", url: `${APP}?course=stAuroras&autoplay=1&qa=1`, viewport: PHONE, phone: true, run: roundOut, tag: "@round" },
  { name: "links-shots-title-1280x720", url: `${APP}?menu=1`, viewport: DESKTOP, run: titleRun, tag: "@shots" },
  { name: "links-shots-play-1280x720", url: `${APP}?course=stAuroras&qa=1`, viewport: DESKTOP, run: screensRun, tag: "@shots" },
  { name: "links-shots-title-390x844", url: `${APP}?menu=1`, viewport: PHONE, phone: true, run: titleRun, tag: "@shots" },
  { name: "links-shots-play-390x844", url: `${APP}?course=stAuroras&qa=1`, viewport: PHONE, phone: true, run: screensRun, tag: "@shots" },
  { name: "links-shots-card-1x", url: `${APP}?course=stAuroras`, viewport: { width: 720, height: 450 }, run: cardRun, tag: "@shots" },
  { name: "links-diag-stAuroras", url: `${APP}?course=stAuroras`, viewport: DESKTOP, run: diagRun, tag: "@diag" },
  { name: "links-diag-neonBay", url: `${APP}?course=neonBay`, viewport: DESKTOP, run: diagRun, tag: "@diag" },
  { name: "links-shots-card-2x", url: `${APP}?course=stAuroras`, viewport: { width: 720, height: 450 }, scale: 2, run: cardRun, tag: "@shots" }
];

async function openPage(browser: Browser, target: Target): Promise<Page> {
  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: target.scale ?? 1,
    ...(target.phone ? { hasTouch: true, isMobile: true } : {})
  });
  return context.newPage();
}

test.describe("aura links 3d audit-fix captures", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}${target.tag ? ` ${target.tag}` : ""}`, async ({ browser }) => {
      const page = await openPage(browser, target);
      page.on("pageerror", (e) => log(`GL_ERR ${target.name} pageerror ${e.message.slice(0, 300)} | ${(e.stack ?? "").replace(/\s+/g, " ").slice(0, 900)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`GL_CONSOLE ${target.name} ${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("requestfailed", (r) => log(`GL_REQFAIL ${target.name} ${r.url().slice(-120)}`));
      page.on("response", (r) => { if (r.status() >= 400) log(`GL_HTTP ${target.name} ${r.status()} ${r.url().slice(-120)}`); });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      const bytes = await page.evaluate(() => performance.getEntriesByType("resource").filter((r: any) => /aura-assets/.test(r.name) && /\.(js|ts)(\?|$)/.test(r.name)).map((r: any) => ({ name: r.name.slice(-80), bytes: r.transferSize || r.encodedBodySize || r.decodedBodySize })));
      log(`GL_MANIFEST ${target.name} ${JSON.stringify(bytes)}`);
      await (target.run ?? steadyState)(page, target.name);
      log(`GL_DONE ${target.name}`);
      await page.context().close();
    });
  }
});
