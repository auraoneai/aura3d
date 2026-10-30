import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Grid Dispatch (`teleoperator`) audit-fix capture, lane G04. Remote only (tools/remote-acr/run.sh, software WebGL2). The ACR run has
 * no artifact egress, so everything goes to the log (same format as tests/browser/game-luma-capture.spec.ts):
 *   GL_META <json>                         frame stats, view-space geometry and game state per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  JPEG, chunked (decode with tools/teleoperator/decode-gl-log.mjs)
 * The same spec runs on the base commit (BEFORE) and on the lane branch (AFTER): steps that need a hook only the fixed build has
 * log a GL_NOTE and are skipped. Select a part with `--grep=desktop|weather|phone|card|bloom` (the ACR step allows 60 minutes).
 *
 * Software GL draws one frame of this scene every 10 to 15 s, and any page.evaluate waits behind that frame. Each shot therefore
 * pauses the app first (the canvas keeps its last frame), reads and captures, then resumes. Steady state means the shot is taken
 * after a wait and after several presented frames; the first frame after ready is not judged.
 */
const ROUTE = "/apps/showcase-teleoperator/";
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true'";
// Fitted size [width, height, length] in metres of the five playable cars, in dock order (manifest bounds scaled to maxDim).
const CAR_DIMS: ReadonlyArray<readonly [number, number, number]> = [
  [1.83, 2.9, 3.9], [2.72, 2.42, 4.0], [2.27, 2.12, 5.55], [2.26, 1.29, 4.66], [2.07, 1.24, 4.5]
];

type Win = Record<string, any>;

const legacyEval = <T,>(page: Page, fn: (h: Win) => T) =>
  page.evaluate((src) => {
    const h = (window as unknown as Win).__AURA3D_SHOWCASE_TELEOPERATOR__;
    // eslint-disable-next-line no-new-func
    return new Function("h", `return (${src})(h)`)(h);
  }, fn.toString()) as Promise<T>;

const pause = (page: Page) => legacyEval(page, (h) => { h?.app?.pause?.(); return true; });
const resume = (page: Page) => legacyEval(page, (h) => { h?.app?.resume?.(); return true; });
const frames = (page: Page) => legacyEval(page, (h) => Number(h?.evidence?.framesRendered ?? 0));

/** Let the app run until `n` more frames have been presented (and at least `minMs` passed), then pause it. */
async function runFrames(page: Page, n: number, minMs = 0): Promise<number> {
  await resume(page);
  const start = await frames(page);
  const t0 = Date.now();
  while ((await frames(page)) < start + n || Date.now() - t0 < minMs) {
    if (Date.now() - t0 > 900_000) break;
    await page.waitForTimeout(1000);
  }
  await pause(page);
  return (await frames(page)) - start;
}

async function frameStats(page: Page, img: Buffer, crop?: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(async ([b64, c]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const cv = document.createElement("canvas");
    cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const stat = (x0: number, y0: number, w: number, h: number) => {
      const x = Math.max(0, Math.round(x0)), y = Math.max(0, Math.round(y0));
      const ww = Math.max(1, Math.min(cv.width - x, Math.round(w))), hh = Math.max(1, Math.min(cv.height - y, Math.round(h)));
      const d = ctx.getImageData(x, y, ww, hh).data;
      const hist = new Uint32Array(256);
      let sum = 0, dark = 0, clip = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const l = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
        hist[l]!++; sum += l; if (l <= 8) dark++; if (l >= 245) clip++;
      }
      const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
      return { x, y, w: ww, h: hh, mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
    };
    return { frame: stat(0, 0, cv.width, cv.height), crop: c ? stat(c.x, c.y, c.w, c.h) : null };
  }, [img.toString("base64"), crop ?? null] as const);
}

/** Game state plus view-space geometry read from the live runtime nodes (works on the base build and the fixed build). */
async function probe(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Win;
    const hook = w.__AURA3D_SHOWCASE_TELEOPERATOR__;
    const app = hook?.app;
    const ev = hook?.evidence ?? null;
    const pos = (id: string) => { try { const h = app?.nodes.get(id); return h ? h.snapshot().position : null; } catch { return null; } };
    let player: unknown = null;
    for (const h of app?.nodes.all() ?? []) {
      const s = h.snapshot();
      if (String(s.id).startsWith("player-car-") && s.visible !== false && Array.isArray(s.position) && s.position[1] > -50) { player = { id: s.id, p: s.position }; break; }
    }
    let diag: Record<string, unknown> = {};
    try { const d = app?.diagnostics(); diag = { drawCalls: d?.drawCalls ?? null, renderPath: d?.renderPath?.path ?? null, bloomFusion: d?.renderPath?.bloomFusion ?? null }; } catch (e) { diag = { err: String(e) }; }
    const qa = w.__AURA_GRID_DISPATCH__;
    const rect = (id: string) => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), shown: cs.display !== "none" && Number(cs.opacity) > 0.05 }; };
    const tags = [...document.querySelectorAll<HTMLElement>(".mpTag")].filter((el) => getComputedStyle(el).display !== "none").map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), chip: el.classList.contains("chip") }; });
    return {
      ev: ev && { framesRendered: ev.framesRendered, vehicle: ev.vehicle, autopilotLevel: ev.autopilotLevel, cameraMode: ev.cameraMode, weatherPreset: ev.weatherPreset, rideState: ev.rideState, player: ev.player, completedRides: ev.completedRides, totalEarningsUsd: ev.totalEarningsUsd, shift: ev.shift ?? null, touchControls: ev.touchControls ?? null, muted: ev.muted ?? null },
      player, yellowL: pos("sf-center-yellow-l"), diag,
      camera: qa?.cameraView?.() ?? null,
      ui: { card: rect("taxiCard"), trip: rect("taxiTrip"), hud: rect("hud"), dock: rect("teleopDock"), total: rect("topRightCluster"), tags },
      gmode: document.getElementById("gmode")?.textContent ?? null,
      touch: [...document.querySelectorAll<HTMLElement>("[data-touch]")].map((el) => ({ id: el.dataset.touch, r: el.getBoundingClientRect().toJSON(), visible: getComputedStyle(el).display !== "none" && getComputedStyle(el.parentElement!).display !== "none" }))
    };
  });
}

function project(p: readonly number[], W: number, H: number) {
  const cam = { pos: [0, 3.4, 6.5], target: [0, 1, -7.2], fov: 56 };
  const f = [cam.target[0]! - cam.pos[0]!, cam.target[1]! - cam.pos[1]!, cam.target[2]! - cam.pos[2]!];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!); const fw = f.map((v) => v / fl);
  const rl = Math.hypot(fw[2]!, fw[0]!); const rn = [-fw[2]! / rl, 0, fw[0]! / rl];
  const up = [rn[1]! * fw[2]! - rn[2]! * fw[1]!, rn[2]! * fw[0]! - rn[0]! * fw[2]!, rn[0]! * fw[1]! - rn[1]! * fw[0]!];
  const d = [p[0]! - cam.pos[0]!, p[1]! - cam.pos[1]!, p[2]! - cam.pos[2]!];
  const cx = d[0]! * rn[0]! + d[2]! * rn[2]!, cy = d[0]! * up[0]! + d[1]! * up[1]! + d[2]! * up[2]!, cz = d[0]! * fw[0]! + d[1]! * fw[1]! + d[2]! * fw[2]!;
  const t = Math.tan((cam.fov * Math.PI) / 360);
  return { x: ((cx / (cz * t * (W / H))) * 0.5 + 0.5) * W, y: (-(cy / (cz * t)) * 0.5 + 0.5) * H, cz };
}

/** Screen box of the default car (chase camera) from its view-space node position. */
function carCrop(player: { p: number[] } | null, W: number, H: number) {
  if (!player) return undefined;
  const [w, h, l] = CAR_DIMS[0]!;
  const pts = [-1, 1].flatMap((sx) => [0, 1].flatMap((sy) => [-1, 1].map((sz) => project([player.p[0]! + (sx * w) / 2, player.p[1]! + sy * h, player.p[2]! + (sz * l) / 2], W, H))));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Capture with the app paused (call after runFrames). */
async function shot(page: Page, target: string, id: string, opts: { canvasOnly?: boolean; quality?: number; crop?: boolean; extra?: Record<string, unknown> } = {}): Promise<void> {
  const vp = page.viewportSize()!;
  await pause(page);
  const pr = await probe(page);
  const handle = opts.canvasOnly ? await page.addStyleTag({ content: CANVAS_ONLY }) : null;
  const jpg = await page.screenshot({ type: "jpeg", quality: opts.quality ?? 82, animations: "disabled" });
  if (handle) await handle.evaluate((el) => el.remove());
  const stats = await frameStats(page, jpg, opts.crop ? carCrop(pr.player as { p: number[] } | null, vp.width, vp.height) : undefined);
  const pl = pr.player as { p: number[] } | null;
  const geometry = pl ? { carViewX: +pl.p[0]!.toFixed(3), yellowViewX: pr.yellowL ? +Number(pr.yellowL[0]).toFixed(3) : null, carToLine: pr.yellowL ? +(pl.p[0]! - Number(pr.yellowL[0]) - 0.0).toFixed(3) : null, carScreenX: Math.round(project([pl.p[0]!, 0, pl.p[2]!], vp.width, vp.height).x) } : null;
  log(`GL_META ${JSON.stringify({ target, id, vp, canvasOnly: !!opts.canvasOnly, ...opts.extra, ...stats, geometry, probe: pr })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

const qa = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => { const h = (window as unknown as Win).__AURA_GRID_DISPATCH__; return h && typeof h[f as string] === "function" ? h[f as string](...(a as unknown[])) : "__missing__"; }, [fn, args] as const);

async function boot(page: Page, server: ExampleDevServer, target: string, vp: { width: number; height: number }, query = ""): Promise<void> {
  page.on("pageerror", (e) => log(`GL_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target} ${m.text().slice(0, 200)}`); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) log(`GL_NAV ${target} ${f.url().replace(server.origin, "")}`); });
  await page.setViewportSize(vp);
  const t0 = Date.now();
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 900_000, polling: 1000 });
  log(`GL_NOTE ${target} ready after ${Date.now() - t0} ms`);
}

const click = (page: Page, selector: string, index = 0): Promise<boolean> =>
  page.evaluate(([sel, i]) => { const el = document.querySelectorAll<HTMLElement>(sel as string)[i as number]; el?.click(); return Boolean(el); }, [selector, index] as const);

test.describe("grid dispatch audit-fix capture", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("desktop", async ({ page }) => {
    const T = "desktop";
    await boot(page, server, T, { width: 1280, height: 720 });
    await pause(page);
    await shot(page, T, "01-title");
    // steady state: textures and the environment settle over the first frames
    await runFrames(page, 6, 60_000);
    await shot(page, T, "chase-steady", { canvasOnly: true, crop: true });
    await shot(page, T, "02-early");
    // keyboard drive; focus loss must release a held key (C9)
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
    await runFrames(page, 3);
    await page.keyboard.up("KeyD");
    await shot(page, T, "03-action");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.keyboard.up("KeyW");
    const sim = await qa(page, "simulate", 45, {});
    log(`GL_NOTE ${T} simulate45 ${JSON.stringify(sim).slice(0, 300)}`);
    await runFrames(page, 3);
    await shot(page, T, "04-mid");
    await shot(page, T, "mid-canvas", { canvasOnly: true, crop: true });
    // camera sweep (C4): every car in the roof and bumper cameras, plus chase and far chase for the default car
    for (let c = 0; c < 5; c++) {
      await click(page, "#teleopDock button[data-car]", c);
      for (const m of c === 0 ? [0, 1, 2, 3] : [2, 3]) {
        await click(page, `#teleopDock button[data-cam="${m}"]`);
        await runFrames(page, 2);
        const pr = await probe(page);
        const pl = pr.player as { p: number[] } | null;
        const [w, h, l] = CAR_DIMS[c]!;
        // the camera sits at view (0, 3.4, 6.5); clearance < 0.25 m (the near plane) on every axis means the eye is in the body
        const clr = pl ? { dx: +(Math.abs(pl.p[0]!) - w / 2).toFixed(3), dy: +(3.4 > pl.p[1]! + h ? 3.4 - pl.p[1]! - h : 3.4 < pl.p[1]! ? pl.p[1]! - 3.4 : -Math.min(3.4 - pl.p[1]!, pl.p[1]! + h - 3.4)).toFixed(3), dz: +(Math.abs(6.5 - pl.p[2]!) - l / 2).toFixed(3) } : null;
        const inside = clr ? clr.dx < 0.25 && clr.dy < 0.25 && clr.dz < 0.25 : null;
        await shot(page, T, `cam-car${c}-mode${m}`, { canvasOnly: true, quality: 60, extra: { car: c, mode: m, clearance: clr, cameraInsideCar: inside } });
      }
    }
    await click(page, "#teleopDock button[data-car]", 0);
    await click(page, `#teleopDock button[data-cam="0"]`);
    await click(page, "#mpChip");
    await runFrames(page, 1);
    await shot(page, T, "05-modes");
    await click(page, "#mpCloseBtn");
    const checks: Record<string, unknown> = {};
    for (const name of ["manual-idle", "kerb-stop", "skip-pays-nothing", "shift-results"]) checks[name] = await qa(page, "check", name);
    log(`GL_CHECKS ${T} ${JSON.stringify(checks)}`);
    await runFrames(page, 2);
    await shot(page, T, "06-results");
    log(`GL_DONE ${T}`);
  });

  test("weather", async ({ page }) => {
    const T = "weather";
    await boot(page, server, T, { width: 1280, height: 720 });
    await runFrames(page, 4, 45_000);
    // GU47 GD-21: Marine dusk (`golden`) is the boot sky.
    await shot(page, T, "weather-golden0", { canvasOnly: true, crop: true });
    for (const tod of ["noon", "fog", "night"]) {
      await resume(page);
      await click(page, `#teleopDock button[data-tod="${tod}"]`);
      await page.waitForTimeout(2000);
      await page.waitForFunction(() => !(window as unknown as Win).__AURA3D_SHOWCASE_TELEOPERATOR__?.evidence?.remounting, undefined, { timeout: 900_000, polling: 2000 });
      await runFrames(page, 4, 30_000);
      await shot(page, T, `weather-${tod}`, { canvasOnly: true, crop: true, extra: { tod } });
    }
    log(`GL_DONE ${T}`);
  });

  // RP-05 game side: the default (bloom fusion) frame against ?aura3d-render=production on the same frozen street.
  test("bloom", async ({ page }) => {
    const T = "bloom";
    for (const [label, query] of [["fused", ""], ["production", "?aura3d-render=production"]] as const) {
      await boot(page, server, T, { width: 1280, height: 720 }, query);
      const frozen = await qa(page, "freeze");
      if (frozen === "__missing__") { log(`GL_NOTE ${T} no freeze hook (base build): skipped`); return; }
      await runFrames(page, 4, 40_000);
      await shot(page, T, `bloom-${label}`, { canvasOnly: true, quality: 95 });
    }
    log(`GL_DONE ${T}`);
  });

  test("phone", async ({ browser }) => {
    const T = "phone";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await boot(page, server, T, { width: 390, height: 844 });
    await pause(page);
    await shot(page, T, "01-title");
    await runFrames(page, 4, 45_000);
    await shot(page, T, "02-early");
    const pads = (await probe(page)).touch;
    log(`GL_NOTE ${T} pads ${JSON.stringify(pads)}`);
    const cdp = await ctx.newCDPSession(page);
    for (const pad of ["throttle", "right"]) {
      const p = pads.find((q) => q.id === pad);
      if (!p) { log(`GL_NOTE ${T} no touch pad ${pad}`); continue; }
      const pt = { x: p.r.x + p.r.width / 2, y: p.r.y + p.r.height / 2 };
      const before = (await probe(page)).ev?.player;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
      await runFrames(page, 3);
      const during = await probe(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      log(`GL_TOUCH ${T} ${pad} ${JSON.stringify({ before, during: during.ev?.player })}`);
    }
    await shot(page, T, "03-action");
    // mid-play: the self-driving level drives 45 s of the shift (a manual car with no input ends up stuck behind traffic)
    await qa(page, "setAutopilotLevel", "L5");
    log(`GL_NOTE ${T} simulate ${JSON.stringify(await qa(page, "simulate", 45, {})).slice(0, 200)}`);
    await qa(page, "setAutopilotLevel", "MAN");
    await runFrames(page, 3);
    await shot(page, T, "04-mid");
    await click(page, "#mpChip");
    await runFrames(page, 1);
    await shot(page, T, "05-modes");
    await click(page, "#mpCloseBtn");
    log(`GL_CHECKS ${T} ${JSON.stringify({ shift: await qa(page, "check", "shift-results") })}`);
    await runFrames(page, 2);
    await shot(page, T, "06-results");
    await ctx.close();
    log(`GL_DONE ${T}`);
  });

  test("card", async ({ page }) => {
    const T = "card";
    await boot(page, server, T, { width: 1440, height: 900 });
    await runFrames(page, 5, 50_000);
    await shot(page, T, "card-2x", { quality: 88 });
    log(`GL_DONE ${T}`);
  });
});
