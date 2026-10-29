import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Pip's Big Leap audit-fix captures (lane G06, audit 2026-10-29). Remote only (tools/remote-acr/run.sh). The ACR run has no
 * artifact egress, so everything goes to the log:
 *   PBL_META <json>                         measurements per step (evidence global, luma, crops, draw calls, requests)
 *   GL_JPG   <target> <shot> <i>/<n> <b64>  full-page JPEG (HUD included), chunked
 * The software-GL runner presents about one frame every few seconds; shots are taken after a settle and the later ones are
 * the ones to judge. The spec runs unchanged on the pre-fix base (fields the base lacks come back null).
 *
 * The example dev server resolves /aura-assets/* only from the repo-root public/ tree, so this app's own GLBs
 * (apps/showcase-pips-big-leap/public/aura-assets) are served here through page.route.
 */
const CHUNK = 16000;
const ROUTE = "/apps/showcase-pips-big-leap/";
const APP_ASSETS = resolve(process.cwd(), "apps/showcase-pips-big-leap/public/aura-assets");
const SAVE_KEY = "pips-big-leap-save-v1";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true'";
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

let server: ExampleDevServer;

interface Net { glbBytes: number; glbCount: number; rootCatalog: boolean; requests: number; failed: string[] }

async function prepare(context: BrowserContext, net: Net): Promise<Page> {
  await context.route("**/aura-assets/pips*", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const file = resolve(APP_ASSETS, name);
    if (existsSync(file)) {
      const body = readFileSync(file);
      await route.fulfill({ status: 200, body, headers: { "content-type": name.endsWith(".glb") ? "model/gltf-binary" : "image/svg+xml", "content-length": String(body.length) } });
    } else {
      await route.continue();
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`PBL_ERR pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`PBL_CONSOLE ${m.type()} ${m.text().slice(0, 240)}`); });
  page.on("response", (r) => {
    net.requests += 1;
    const url = r.url();
    if (r.status() >= 400) net.failed.push(`${r.status()} ${url.replace(server.origin, "")}`);
    if (/\/src\/aura-assets(\.ts)?(\?|$)/.test(url)) net.rootCatalog = true;
    if (url.endsWith(".glb")) {
      net.glbCount += 1;
      net.glbBytes += Number(r.headers()["content-length"] ?? 0);
    }
  });
  return page;
}

const freshNet = (): Net => ({ glbBytes: 0, glbCount: 0, rootCatalog: false, requests: 0, failed: [] });

async function evidence(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__AURA3D_SHOWCASE_PIPS_BIG_LEAP__ ?? null);
}

async function engineInfo(page: Page): Promise<any> {
  return page.evaluate(() => {
    const reg = (globalThis as any).__AURA3D_LIVE_APPS__;
    const app = reg?.all?.()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      const lighting = (() => { try { return app.lighting?.diagnostics?.() ?? dg?.lighting ?? null; } catch { return dg?.lighting ?? null; } })();
      const cs = lighting?.contactShadows ?? null;
      const degradations: unknown[] = Array.isArray(dg?.degradations) ? dg.degradations : [];
      return {
        app: true,
        renderPath: dg?.renderPath?.path ?? null,
        quality: dg?.renderPath?.quality ?? null,
        bloomFusion: dg?.renderPath?.bloomFusion ?? null,
        drawCalls: dg?.drawCalls ?? null,
        triangles: dg?.triangles ?? dg?.frame?.triangles ?? null,
        contactShadows: cs ? { passExecuted: cs.passExecuted ?? null, unavailable: cs.unavailable ?? null } : null,
        optionIgnored: degradations.filter((d) => /option-ignored|OPTION_IGNORED/.test(JSON.stringify(d))).length,
        heal: (globalThis as any).__AURA3D_HEAL__?.rung ?? null
      };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

/** Project a world point with the follow camera main.ts builds (boom behind Pip, target ahead). */
function projectFeet(ev: any, width: number, height: number): { x: number; y: number } | null {
  const pos = ev?.player?.position;
  if (!pos) return null;
  const yaw = ev.camera?.camYaw ?? Math.PI;
  const fov = ev.camera?.fov ?? 52;
  const boom = ev.camera?.boom ?? 4.5;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const eye = [pos[0] - fx * boom, pos[1] + 2.25, pos[2] - fz * boom];
  const tgt = [pos[0] + fx * 3.2, pos[1] + 0.55, pos[2] + fz * 3.2];
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
  const norm = (a: number[]) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
  const f = norm(sub(tgt, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const p = sub([pos[0], pos[1], pos[2]], eye);
  const z = dot(p, f);
  if (z <= 0.05) return null;
  const t = Math.tan((fov * Math.PI) / 360);
  const aspect = width / height;
  const ndcX = dot(p, r) / (z * t * aspect);
  const ndcY = dot(p, u) / (z * t);
  return { x: (ndcX * 0.5 + 0.5) * width, y: (1 - (ndcY * 0.5 + 0.5)) * height };
}

async function canvasStats(page: Page, png: Buffer, crop: { x: number; y: number; w: number; h: number } | null) {
  return page.evaluate(async ({ b64, crop }) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const stat = (x0: number, y0: number, w: number, h: number) => {
      const x = Math.max(0, Math.min(c.width - 1, Math.round(x0)));
      const y = Math.max(0, Math.min(c.height - 1, Math.round(y0)));
      const ww = Math.max(1, Math.min(c.width - x, Math.round(w)));
      const hh = Math.max(1, Math.min(c.height - y, Math.round(h)));
      const d = ctx.getImageData(x, y, ww, hh).data;
      const hist = new Uint32Array(256);
      let sum = 0, dark = 0, clip = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
        hist[v]!++; sum += v;
        if (v <= 8) dark++;
        if (v >= 250) clip++;
      }
      const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
      return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4), box: [x, y, ww, hh] };
    };
    // 32x18 thumbnail (row-major luma) for before/after frame diffs.
    const t = document.createElement("canvas");
    t.width = 32; t.height = 18;
    const tc = t.getContext("2d")!;
    tc.drawImage(bmp, 0, 0, 32, 18);
    const td = tc.getImageData(0, 0, 32, 18).data;
    const thumb: number[] = [];
    for (let i = 0; i < td.length; i += 4) thumb.push(Math.round(0.2126 * td[i]! + 0.7152 * td[i + 1]! + 0.0722 * td[i + 2]!));
    return { full: stat(0, 0, c.width, c.height), crop: crop ? stat(crop.x, crop.y, crop.w, crop.h) : null, thumb };
  }, { b64: png.toString("base64"), crop });
}

async function shot(page: Page, target: string, id: string, extra: Record<string, unknown> = {}): Promise<any> {
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const ev = await evidence(page);
  const feet = projectFeet(ev, vp.width, vp.height);
  const crop = feet ? { x: feet.x - 40, y: feet.y - 30, w: 80, h: 44 } : null;
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: "png" });
  await handle.evaluate((el) => el.remove());
  await page.waitForTimeout(200);
  const jpg = await page.screenshot({ type: "jpeg", quality: 82 });
  const stats = await canvasStats(page, png, crop);
  const meta = {
    target, id, ...extra,
    viewport: vp,
    luma: stats.full, feetCrop: stats.crop, feet, thumb: stats.thumb,
    info: await engineInfo(page),
    ev: ev ? {
      status: ev.status, paused: ev.paused, world: ev.world?.id, mode: ev.mode, autopilot: ev.autopilot,
      player: ev.player, levelTime: ev.levelTime, gate: ev.gate, camera: ev.camera, sim: ev.sim ?? null,
      motion: ev.motion ? { reportOk: ev.motion.reportOk, failedChecks: ev.motion.failedChecks ?? null } : null,
      medals: ev.medals ?? null, save: ev.save
    } : null
  };
  log(`PBL_META ${JSON.stringify(meta)}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return meta;
}

const click = (page: Page, selector: string) => page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement | null; el?.click(); return Boolean(el); }, selector);
const visible = (page: Page, id: string) => page.evaluate((i) => { const el = document.getElementById(i); return el ? !el.hidden : null; }, id);

async function open(page: Page, query = ""): Promise<number> {
  const t0 = Date.now();
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
  return Date.now() - t0;
}

/** Wait until the sim has advanced, measured on the evidence clock, or until the wall budget runs out. */
async function waitSim(page: Page, wallMs: number): Promise<void> {
  await page.waitForTimeout(wallMs);
}

/** Autoplay until the Sun-Gate completes, then freeze the autopilot (a key press) so the results panel stays up. */
async function autoplayToResults(page: Page, budgetMs: number): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const ev = (window as any).__AURA3D_SHOWCASE_PIPS_BIG_LEAP__;
      const panel = document.getElementById("pbl-complete");
      const done = Boolean(ev?.gate?.complete) || Boolean(panel && !panel.hidden);
      if (done) window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w" }));
      return done;
    }, undefined, { timeout: budgetMs, polling: 250 });
    return true;
  } catch {
    return false;
  }
}

test.describe("pips-big-leap audit fixes", () => {
  test.setTimeout(3_300_000);
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("grpA pbl-desktop 1280x720: screens, strafe (C2), pause overlays (C9), draw calls and bytes (C11, RH-06)", async ({ browser }) => {
    const T = "d1280";
    const net = freshNet();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await prepare(context, net);
    const readyMs = await open(page);
    log(`PBL_META ${JSON.stringify({ target: T, id: "ready", readyMs })}`);
    await waitSim(page, 20_000);
    await shot(page, T, "01-title");
    log(`PBL_META ${JSON.stringify({ target: T, id: "net-boot", ...net })}`);

    await click(page, "#aura-btn-play");
    await waitSim(page, 12_000);
    await shot(page, T, "02-early");

    // C2: hold D. Track displacement along the starting camera-right axis and the camera yaw.
    const e0 = await evidence(page);
    const yaw0 = e0?.camera?.camYaw ?? Math.PI;
    const right = { x: -Math.cos(yaw0), z: Math.sin(yaw0) };
    const start = e0?.player?.position ?? [0, 0, 0];
    const track: { t: number; along: number; yaw: number; state: string }[] = [];
    await page.keyboard.down("KeyD");
    const holdStart = Date.now();
    let shotTaken = false;
    while (Date.now() - holdStart < 30_000) {
      await page.waitForTimeout(500);
      const ev = await evidence(page);
      const p = ev?.player?.position ?? start;
      const along = (p[0] - start[0]) * right.x + (p[2] - start[2]) * right.z;
      track.push({ t: Date.now() - holdStart, along: +along.toFixed(3), yaw: ev?.camera?.camYaw ?? 0, state: ev?.player?.state ?? "" });
      if (!shotTaken && Date.now() - holdStart > 6_000) { await shot(page, T, "03-action", { holding: "KeyD" }); shotTaken = true; }
      if (along > 3.6) break; // the start platform ends 4.5 m to the right
    }
    await page.keyboard.up("KeyD");
    const maxAlong = Math.max(0, ...track.map((s) => s.along));
    const yawSpan = Math.max(...track.map((s) => s.yaw)) - Math.min(...track.map((s) => s.yaw));
    log(`PBL_META ${JSON.stringify({ target: T, id: "C2-strafe", yaw0, maxAlong, yawSpan, samples: track.length, track })}`);

    // C9: pause, open the Atlas from the pause menu, and watch the sim clock behind it.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    const pausedEv = await evidence(page);
    await click(page, "#pbl-pause-atlas");
    await page.waitForTimeout(1500);
    const a1 = await evidence(page);
    await shot(page, T, "05-modes", { overlay: "atlas-from-pause" });
    await page.waitForTimeout(10_000);
    const a2 = await evidence(page);
    await click(page, "#pbl-atlas-close");
    await page.waitForTimeout(1500);
    const pauseBack = await visible(page, "pbl-pause");
    log(`PBL_META ${JSON.stringify({ target: T, id: "C9-overlay", pausedStatus: pausedEv?.status, atlas1: { status: a1?.status, levelTime: a1?.levelTime, pos: a1?.player?.position }, atlas2: { status: a2?.status, levelTime: a2?.levelTime, pos: a2?.player?.position }, levelTimeAdvancedBehindAtlas: (a2?.levelTime ?? 0) - (a1?.levelTime ?? 0), pauseMenuBackAfterClose: pauseBack })}`);
    await click(page, "#pbl-resume");
    await page.waitForTimeout(1000);

    // C11 / RH-06: steady-state draw calls in World 1 and what the page downloaded.
    await waitSim(page, 8_000);
    const later = await shot(page, T, "steady-w1");
    log(`PBL_META ${JSON.stringify({ target: T, id: "net-final", ...net, drawCalls: later.info?.drawCalls ?? null })}`);
    log(`PBL_DONE ${T}`);
    await context.close();
  });

  test("grpB pbl-auto 1280x720: autoplay mid and results (RH-05), demo save (C4), contact crops (LIGHT-06)", async ({ browser }) => {
    const T = "a1280";
    const net = freshNet();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await prepare(context, net);
    await open(page, "?autoplay=1");
    await waitSim(page, 25_000);
    await shot(page, T, "04-mid");
    await waitSim(page, 30_000);
    await shot(page, T, "mid-later");
    const reached = await autoplayToResults(page, 22 * 60_000);
    log(`PBL_META ${JSON.stringify({ target: T, id: "results-reached", reached })}`);
    if (reached) {
      await page.waitForTimeout(800);
      await shot(page, T, "06-results");
    }
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), SAVE_KEY);
    log(`PBL_META ${JSON.stringify({ target: T, id: "C4-save", storedSave: stored })}`);
    log(`PBL_DONE ${T}`);
    await context.close();
  });

  test("grpB pbl-phone 390x844: screens, touch pause (C8), portrait framing (C18)", async ({ browser }) => {
    const T = "p390";
    const net = freshNet();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await prepare(context, net);
    const readyMs = await open(page);
    log(`PBL_META ${JSON.stringify({ target: T, id: "ready", readyMs })}`);
    await waitSim(page, 20_000);
    await shot(page, T, "01-title");
    await click(page, "#aura-btn-play");
    await waitSim(page, 12_000);
    await shot(page, T, "02-early");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(10_000);
    await shot(page, T, "03-action", { holding: "KeyW" });
    await page.keyboard.up("KeyW");

    // C8: the on-screen pause button.
    const btn = await page.$("#pbl-pause-btn");
    let tapped = false;
    if (btn) { await btn.tap(); tapped = true; }
    await page.waitForTimeout(1500);
    const ev = await evidence(page);
    log(`PBL_META ${JSON.stringify({ target: T, id: "C8-pause", button: Boolean(btn), tapped, pauseOverlay: await visible(page, "pbl-pause"), status: ev?.status ?? null })}`);
    if (tapped) {
      await shot(page, T, "pause-menu");
      await click(page, "#pbl-resume");
    }
    await page.waitForTimeout(1000);
    await click(page, "#aura-btn-atlas");
    await page.waitForTimeout(2000);
    await shot(page, T, "05-modes", { overlay: "atlas" });
    await click(page, "#pbl-atlas-close");

    // Autoplay for the mid and results frames.
    await open(page, "?autoplay=1");
    await waitSim(page, 30_000);
    await shot(page, T, "04-mid");
    const reached = await autoplayToResults(page, 14 * 60_000);
    log(`PBL_META ${JSON.stringify({ target: T, id: "results-reached", reached })}`);
    if (reached) {
      await page.waitForTimeout(800);
      await shot(page, T, "06-results");
    }
    log(`PBL_DONE ${T}`);
    await context.close();
  });

  test("grpC pbl-worlds 1280x720: every world at steady state with render-path and contact-shadow diagnostics (RH-04, LIGHT-06)", async ({ browser }) => {
    const T = "w1280";
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const consoleLines: string[] = [];
    const page = await prepare(context, freshNet());
    page.on("console", (m) => { if (/prd02\.contactShadows|OPTION_IGNORED/.test(m.text())) consoleLines.push(m.text().slice(0, 200)); });
    await open(page);
    for (const world of ["academy", "w1", "w2", "w3", "w4", "w5", "w6"]) {
      if (world === "academy") {
        await click(page, "#aura-btn-academy");
      } else {
        await click(page, "#aura-btn-atlas");
        await page.waitForTimeout(600);
        await click(page, `.pbl-atlas-card[data-world="${world}"]`);
      }
      await page.waitForTimeout(15_000);
      await shot(page, T, `${world}-15s`);
      await page.waitForTimeout(20_000);
      await shot(page, T, `${world}-35s`);
    }
    log(`PBL_META ${JSON.stringify({ target: T, id: "console-flags", lines: consoleLines })}`);
    log(`PBL_DONE ${T}`);
    await context.close();
  });

  test("grpD pbl-ao 1280x720: AO on/off pairs with feet crops (LIGHT-06)", async ({ browser }) => {
    const T = "o1280";
    for (const [id, query] of [["ao-on", "?freeze=6000"], ["ao-off", "?freeze=6000&pbl-ao=0"]] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const p = await prepare(ctx, freshNet());
      await open(p, query);
      await p.waitForTimeout(20_000);
      await shot(p, T, `${id}-20s`);
      await p.waitForTimeout(15_000);
      await shot(p, T, `${id}-35s`);
      await ctx.close();
    }

    log(`PBL_DONE ${T}`);
  });

  test("grpA pbl-card 1440x900 and bloom fusion vs production chain (RP-05 game side)", async ({ browser }) => {
    const T = "c1440";
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await prepare(context, freshNet());
    await open(page);
    await click(page, "#aura-btn-play");
    await waitSim(page, 20_000);
    await shot(page, T, "card-2x");
    await context.close();

    // RP-05: the same frozen World 1 frame on the default (auto, fused bloom) chain and on the production chain.
    for (const [id, query] of [["bloom-auto", "?freeze=4000"], ["bloom-production", "?freeze=4000&aura3d-render=production"]] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const p = await prepare(ctx, freshNet());
      await open(p, query);
      await waitSim(p, 25_000);
      await shot(p, "b1280", id);
      await ctx.close();
    }
    log(`PBL_DONE ${T}`);
  });
});
