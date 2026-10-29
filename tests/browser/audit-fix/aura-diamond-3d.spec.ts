import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura Diamond 3D audit-fix captures (lane G08). Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so
 * everything goes to the log:
 *   DIA_META <json>                         luma stats, game evidence and engine diagnostics per shot
 *   DIA_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 *   DIA_PROBE <json>                        gameplay probe results (swing grades, called pitches, results screen)
 * The same file runs on the base commit (BEFORE) and on the lane branch (AFTER). Hooks that exist only after the fix are
 * feature-detected and logged as unavailable on the base. The software-GL runner presents one frame every several seconds,
 * so the first shot is not trusted: judge the later ones.
 */
const SETTLE_SECONDS = (process.env.DIA_SETTLE ?? "3,45").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true'";
const BASE = "/apps/showcase-aura-diamond-3d/index.html";

interface Shot { readonly name: string; readonly query: string; readonly w: number; readonly h: number; readonly hud?: boolean }

const PARKS = ["sandlot", "skyline", "canyon", "ivy", "dome", "lunar"] as const;
const SHOTS: readonly Shot[] = [
  ...PARKS.map((p) => ({ name: `dia-shot-${p}-desktop`, query: `?park=${p}`, w: 1280, h: 720 })),
  { name: "dia-shot-sandlot-phone", query: "?park=sandlot", w: 390, h: 844, hud: true },
  { name: "dia-shot-skyline-phone", query: "?park=skyline", w: 390, h: 844, hud: true },
  // LIGHT-06 / C17: AO and contact-shadow on/off pairs (the off switches are QA-only query flags added by the fix).
  { name: "dia-shot-ivy-noao", query: "?park=ivy&qa-ao=0", w: 1280, h: 720 },
  { name: "dia-shot-ivy-nocontact", query: "?park=ivy&qa-contact=0", w: 1280, h: 720 },
  { name: "dia-shot-skyline-noao", query: "?park=skyline&qa-ao=0", w: 1280, h: 720 }
];

/** Run groups (`--grep=grpN`) so each remote run stays inside the 3600 s ACR step limit. grp4 also runs the park-switch probe, grp5 the swing probe, grp6 the QA probe, grp7 the take probe. */
const GROUPS: Record<string, string> = {
  "dia-shot-sandlot-desktop": "grp1", "dia-shot-skyline-desktop": "grp1", "dia-shot-canyon-desktop": "grp1",
  "dia-shot-ivy-desktop": "grp2", "dia-shot-dome-desktop": "grp2", "dia-shot-lunar-desktop": "grp2",
  "dia-shot-sandlot-phone": "grp3", "dia-shot-skyline-phone": "grp3", "dia-shot-ivy-noao": "grp3",
  "dia-shot-ivy-nocontact": "grp4", "dia-shot-skyline-noao": "grp4"
};
const groupOf = (name: string): string => GROUPS[name] ?? "grp0";

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
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
  }, png.toString("base64"));
}

async function gameInfo(page: Page) {
  return page.evaluate(() => {
    const w = globalThis as unknown as Record<string, any>;
    const ev = w.__AURA3D_GAME_EVIDENCE__ ?? null;
    const reg = w.__AURA3D_LIVE_APPS__;
    const app = reg?.all?.()[0];
    let diag: Record<string, unknown> | null = null;
    try {
      const dg = app?.diagnostics?.();
      if (dg) {
        diag = { renderPath: dg.renderPath?.path ?? null };
        for (const [k, v] of Object.entries(dg)) if (typeof v === "number") diag[k] = v;
        if (dg.frame && typeof dg.frame === "object") for (const [k, v] of Object.entries(dg.frame)) if (typeof v === "number") diag[`frame.${k}`] = v;
        diag.warnings = (dg.warnings ?? []).slice(0, 8).map((x: unknown) => String(x).slice(0, 120));
        diag.degradations = (dg.degradations ?? []).map((x: any) => `${x.code ?? x.kind}:${x.nodeId ?? ""}`).slice(0, 12);
      }
    } catch (e) { diag = { err: String(e) }; }
    const state = ev ? { phase: ev.phase, mode: ev.mode, park: ev.park, count: ev.count, outs: ev.outs, inning: ev.inning, half: ev.half, score: ev.score, lastGrade: ev.lastGrade, over: ev.over, result: ev.result, frames: ev.framesRendered } : null;
    return { state, diag, heapMB: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : null };
  });
}

async function grab(page: Page, target: string, id: string, canvasOnly: boolean, extra: Record<string, unknown> = {}): Promise<void> {
  const handle = canvasOnly ? await page.addStyleTag({ content: CANVAS_ONLY }) : null;
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  if (handle) await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`DIA_META ${JSON.stringify({ target, id, ...extra, ...stats, ...(await gameInfo(page)) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`DIA_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function open(page: Page, server: ExampleDevServer, query: string, w: number, h: number, name: string): Promise<void> {
  page.on("pageerror", (e) => log(`DIA_ERR ${name} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`DIA_CONSOLE ${name} ${m.type()} ${m.text().slice(0, 240)}`); });
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${server.origin}${BASE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 480_000, polling: 500 });
}

const evidence = (page: Page) => page.evaluate(() => {
  const ev = (globalThis as any).__AURA3D_GAME_EVIDENCE__;
  return ev ? { phase: ev.phase, count: ev.count, outs: ev.outs, inning: ev.inning, half: ev.half, score: ev.score, lastGrade: ev.lastGrade, lastTimingErrMs: ev.lastTimingErrMs, pitchT: ev.pitchT, frames: ev.framesRendered, last: (ev.eventLog?.events ?? ev.eventLog ?? []).slice?.(-3)?.map?.((e: any) => e.label) ?? null } : null;
});

async function waitPhase(page: Page, phases: string[], timeoutMs: number): Promise<boolean> {
  try {
    await page.waitForFunction((ps) => ps.includes((globalThis as any).__AURA3D_GAME_EVIDENCE__?.phase), phases, { timeout: timeoutMs, polling: 250 });
    return true;
  } catch { return false; }
}

test.describe("aura-diamond-3d audit-fix", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const shot of SHOTS) {
    // Tag every non-desktop target "setb" so a run can select it with --grep=setb (az acr run cannot carry a "|" in SPECS).
    test(`${shot.name} ${groupOf(shot.name)}${shot.name.endsWith("-desktop") ? "" : " setb"}`, async ({ page }) => {
      await open(page, server, shot.query, shot.w, shot.h, shot.name);
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, shot.name, `settle-${sec}s`, !shot.hud, { w: shot.w, h: shot.h, sinceReadyMs: Date.now() - loaded });
      }
      log(`DIA_DONE ${shot.name}`);
    });
  }

  /** RH-04: switch through all six parks with setPark and log warnings / degradations after each rebuild. */
  test("dia-probe-parks setb grp4", async ({ page }) => {
    await open(page, server, "?park=sandlot", 1280, 720, "dia-probe-parks");
    for (const p of ["skyline", "canyon", "ivy", "dome", "lunar", "sandlot"]) {
      await page.evaluate((id) => (globalThis as any).__AURA3D_GAME_DIAMOND__.setPark(id), p);
      await page.waitForTimeout(25_000);
      log(`DIA_PROBE ${JSON.stringify({ probe: "park-switch", park: p, ...(await gameInfo(page)) })}`);
    }
    log(`DIA_DONE dia-probe-parks`);
  });

  /** C1: what a real key press does. BEFORE: the first press queues an automatic PERFECT swing. AFTER: grades follow timing. */
  test("dia-probe-swing setb grp5", async ({ page }) => {
    await open(page, server, "?park=sandlot", 1280, 720, "dia-probe-swing");
    const results: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Space");
      const pitched = await waitPhase(page, ["pitch"], 240_000);
      if (pitched) {
        // Vary the press moment so timing actually matters.
        await page.waitForTimeout([0, 3000, 8000, 15000][i]!);
        if ((await evidence(page))?.phase === "pitch") await page.keyboard.press("Space");
      }
      await waitPhase(page, ["between", "gameover"], 400_000);
      results.push({ attempt: i, pitched, ...(await evidence(page)) });
      log(`DIA_PROBE ${JSON.stringify({ probe: "swing", attempt: i, pitched, ev: await evidence(page) })}`);
    }
    await grab(page, "dia-probe-swing", "after-swings", false);
    log(`DIA_DONE dia-probe-swing`);
  });

  /** C1: a pitch with no input. AFTER: the pitch is delivered and called a strike or a ball. BEFORE: nothing is pitched. */
  test("dia-probe-take setb grp7", async ({ page }) => {
    await open(page, server, "?park=sandlot", 1280, 720, "dia-probe-take");
    const start = await evidence(page);
    const pitched = await waitPhase(page, ["pitch"], 600_000);
    if (pitched) await waitPhase(page, ["between", "runners", "gameover"], 400_000);
    log(`DIA_PROBE ${JSON.stringify({ probe: "take", pitched, start, end: await evidence(page) })}`);
    log(`DIA_DONE dia-probe-take`);
  });

  /** Deterministic sim probe through the QA step hook (AFTER only): early, on-time and late presses, plus the results screen. */
  test("dia-probe-qa setb grp6", async ({ page }) => {
    await open(page, server, "?park=sandlot&qa=1", 1280, 720, "dia-probe-qa");
    const hasQa = await page.evaluate(() => typeof (globalThis as any).__AURA3D_GAME_DIAMOND__?.qaSwingAt === "function");
    if (!hasQa) {
      log(`DIA_PROBE ${JSON.stringify({ probe: "qa", available: false })}`);
      log(`DIA_DONE dia-probe-qa`);
      return;
    }
    const grades = await page.evaluate(() => {
      const g = (globalThis as any).__AURA3D_GAME_DIAMOND__;
      return [-0.25, -0.1, -0.03, 0, 0.03, 0.1, 0.25, null].map((off) => g.qaSwingAt(off));
    });
    log(`DIA_PROBE ${JSON.stringify({ probe: "qa-swing", grades })}`);
    // C1: the same presses with the contact point on the ball. Timing alone decides the grade, so only near-zero offsets connect.
    const aimed = await page.evaluate(() => {
      const g = (globalThis as any).__AURA3D_GAME_DIAMOND__;
      return [-0.25, -0.1, -0.03, 0, 0, 0.03, 0.1, 0.25].map((off) => g.qaSwingAt(off, true));
    });
    log(`DIA_PROBE ${JSON.stringify({ probe: "qa-swing-aimed", grades: aimed })}`);
    log(`DIA_PROBE ${JSON.stringify({ probe: "qa-kit", kit: await page.evaluate(() => (globalThis as any).__AURA3D_GAME_DIAMOND__.qaKit()) })}`);
    await grab(page, "dia-kit", "kit-closeup", true, { w: 1280, h: 720 });
    await page.evaluate(() => (globalThis as any).__AURA3D_GAME_DIAMOND__.qaFinish(true));
    await page.waitForTimeout(20_000);
    await grab(page, "dia-results", "results-desktop", false, { w: 1280, h: 720 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(20_000);
    await grab(page, "dia-results", "results-phone", false, { w: 390, h: 844 });
    log(`DIA_DONE dia-probe-qa`);
  });
});
