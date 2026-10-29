import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Grid Dispatch (`teleoperator`) audit-fix capture, lane G04. Remote only (tools/remote-acr/run.sh, software WebGL2). The ACR run has
 * no artifact egress, so everything goes to the log (same format as tests/browser/game-luma-capture.spec.ts):
 *   GL_META <json>                         frame stats, view-space geometry and game state per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  JPEG, chunked (decode with tools/teleoperator/decode-gl-log.mjs)
 * The same spec runs on the base commit (BEFORE) and on the lane branch (AFTER): every step that needs a hook only the fixed build
 * has is skipped with a GL_NOTE line. Judge the later shots: the first frames after ready are not steady state.
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

async function frameStats(page: Page, png: Buffer, crop?: { x: number; y: number; w: number; h: number }) {
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
    // Yellow centre-line pixels on two rows near the bottom of the frame: x of each run of yellow pixels.
    const yellowRows = [0.9, 0.8].map((fy) => {
      const y = Math.round(cv.height * fy);
      const d = ctx.getImageData(0, y, cv.width, 1).data;
      const runs: number[] = [];
      let start = -1;
      for (let x = 0; x <= cv.width; x++) {
        const i = x * 4;
        const yellow = x < cv.width && d[i]! > 150 && d[i + 1]! > 110 && d[i + 2]! < 110 && d[i]! - d[i + 2]! > 80;
        if (yellow && start < 0) start = x;
        if (!yellow && start >= 0) { runs.push(Math.round((start + x - 1) / 2)); start = -1; }
      }
      return { y, xs: runs.slice(0, 8) };
    });
    return { frame: stat(0, 0, cv.width, cv.height), crop: c ? stat(c.x, c.y, c.w, c.h) : null, yellowRows };
  }, [png.toString("base64"), crop ?? null] as const);
}

/** Game state plus view-space geometry read from the live runtime nodes (works on the base build and the fixed build). */
async function probe(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Win;
    const hook = w.__AURA3D_SHOWCASE_TELEOPERATOR__;
    const app = hook?.app;
    const ev = hook?.evidence ?? null;
    const pos = (id: string) => { try { const h = app?.nodes.get(id); return h ? { p: h.snapshot().position, v: h.snapshot().visible } : null; } catch { return null; } };
    let player: unknown = null;
    for (const h of app?.nodes.all() ?? []) {
      const s = h.snapshot();
      if (String(s.id).startsWith("player-car-") && s.visible !== false && Array.isArray(s.position) && s.position[1] > -50) { player = { id: s.id, p: s.position }; break; }
    }
    let diag: Record<string, unknown> = {};
    try { const d = app?.diagnostics(); diag = { drawCalls: d?.drawCalls ?? null, renderPath: d?.renderPath?.path ?? null, bloomFusion: d?.renderPath?.bloomFusion ?? null }; } catch (e) { diag = { err: String(e) }; }
    const qa = w.__AURA_GRID_DISPATCH__;
    return {
      ev: ev && { vehicle: ev.vehicle, autopilotLevel: ev.autopilotLevel, cameraMode: ev.cameraMode, weatherPreset: ev.weatherPreset, rideState: ev.rideState, player: ev.player, completedRides: ev.completedRides, totalEarningsUsd: ev.totalEarningsUsd, shift: ev.shift ?? null },
      player, yellowL: pos("sf-center-yellow-l"), asphalt: pos("sf-avenue-asphalt"), diag,
      camera: qa?.cameraView?.() ?? null,
      touch: [...document.querySelectorAll<HTMLElement>("[data-touch]")].map((el) => ({ id: el.dataset.touch, r: el.getBoundingClientRect().toJSON(), visible: getComputedStyle(el).display !== "none" }))
    };
  });
}

function project(p: readonly number[], W: number, H: number, cam = { pos: [0, 3.4, 6.5], target: [0, 1, -7.2], fov: 56 }) {
  const f = [cam.target[0]! - cam.pos[0]!, cam.target[1]! - cam.pos[1]!, cam.target[2]! - cam.pos[2]!];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!); const fw = f.map((v) => v / fl);
  const r = [-fw[2]!, 0, fw[0]!]; const rl = Math.hypot(r[0]!, r[2]!); const rn = [r[0]! / rl, 0, r[2]! / rl];
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

async function shot(page: Page, target: string, id: string, opts: { canvasOnly?: boolean; quality?: number; crop?: boolean; extra?: Record<string, unknown> } = {}): Promise<void> {
  const vp = page.viewportSize()!;
  const pr = await probe(page);
  const handle = opts.canvasOnly ? await page.addStyleTag({ content: CANVAS_ONLY }) : null;
  if (handle) await page.waitForTimeout(200);
  // One screenshot per shot (each costs a presented frame on software GL): stats are read from the JPEG itself.
  const jpg = await page.screenshot({ type: "jpeg", quality: opts.quality ?? 82 });
  if (handle) await handle.evaluate((el) => el.remove());
  const stats = await frameStats(page, jpg, opts.crop ? carCrop(pr.player as { p: number[] } | null, vp.width, vp.height) : undefined);
  const yellowView = pr.yellowL?.p?.[0] ?? null;
  const geometry = pr.player ? { carViewX: +(pr.player as { p: number[] }).p[0]!.toFixed(3), yellowViewX: yellowView === null ? null : +Number(yellowView).toFixed(3), carScreenX: Math.round(project([(pr.player as { p: number[] }).p[0]!, 0, (pr.player as { p: number[] }).p[2]!], vp.width, vp.height).x) } : null;
  log(`GL_META ${JSON.stringify({ target, id, vp, canvasOnly: !!opts.canvasOnly, ...opts.extra, ...stats, geometry, probe: pr })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

const qa = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => { const h = (window as unknown as Win).__AURA_GRID_DISPATCH__; return h && typeof h[f as string] === "function" ? h[f as string](...(a as unknown[])) : "__missing__"; }, [fn, args] as const);

async function boot(page: Page, server: ExampleDevServer, target: string, vp: { width: number; height: number }, query = ""): Promise<number> {
  page.on("pageerror", (e) => log(`GL_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target} ${m.text().slice(0, 200)}`); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) log(`GL_NAV ${target} ${f.url().replace(server.origin, "")}`); });
  await page.setViewportSize(vp);
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 500 });
  return Date.now();
}

async function clickDock(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => { const el = document.querySelector<HTMLElement>(sel); el?.click(); return Boolean(el); }, selector);
}

test.describe("grid dispatch audit-fix capture", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("desktop", async ({ page }) => {
    const T = "desktop";
    const t0 = await boot(page, server, T, { width: 1280, height: 720 });
    await shot(page, T, "01-title", { extra: { sinceReadyMs: 0 } });
    for (const sec of [25, 60]) {
      await page.waitForTimeout(Math.max(0, sec * 1000 - (Date.now() - t0)));
      await shot(page, T, `chase-${sec}s`, { canvasOnly: true, crop: true, extra: { sinceReadyMs: Date.now() - t0 } });
    }
    await shot(page, T, "02-early");
    // right lane, chase camera: the car must sit in its lane, not on the yellow line (C2)
    for (const k of ["KeyD"]) await page.keyboard.down(k);
    await page.waitForTimeout(8000);
    for (const k of ["KeyD"]) await page.keyboard.up(k);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(6000);
    await shot(page, T, "03-action");
    await page.keyboard.up("KeyW");
    // focus loss must release held keys (C9)
    await page.keyboard.down("KeyW");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(3000);
    log(`GL_META ${JSON.stringify({ target: T, id: "blur-release", probe: await probe(page) })}`);
    await page.keyboard.up("KeyW");
    const sim = await qa(page, "simulate", 45, {});
    log(`GL_NOTE ${T} simulate45 ${JSON.stringify(sim).slice(0, 400)}`);
    await page.waitForTimeout(6000);
    await shot(page, T, "04-mid");
    await shot(page, T, "mid-canvas", { canvasOnly: true, crop: true });
    // camera sweep: every car in every camera mode (C4)
    const cars = await page.evaluate(() => document.querySelectorAll("#teleopDock button[data-car]").length);
    for (let c = 0; c < cars; c++) {
      await page.evaluate((i) => (document.querySelectorAll<HTMLElement>("#teleopDock button[data-car]")[i])?.click(), c);
      for (let m = 0; m < 4; m++) {
        await clickDock(page, `#teleopDock button[data-cam="${m}"]`);
        await page.waitForTimeout(m === 0 ? 7000 : 5000);
        const pr = await probe(page);
        const pl = pr.player as { p: number[] } | null;
        const [w, h, l] = CAR_DIMS[c] ?? CAR_DIMS[0]!;
        const camPos = (pr.camera as { position?: number[] } | null)?.position ?? [0, 3.4, 6.5];
        const inside = pl ? { dx: Math.abs(camPos[0]! - pl.p[0]!) - w / 2, dy: camPos[1]! - (pl.p[1]! + h), dyBottom: camPos[1]! - pl.p[1]!, dz: Math.abs(camPos[2]! - pl.p[2]!) - l / 2 } : null;
        const inBox = inside ? inside.dx < 0 && inside.dz < 0 && inside.dyBottom > 0 && inside.dy < 0 : null;
        await shot(page, T, `cam-car${c}-mode${m}`, { canvasOnly: true, quality: 60, extra: { car: c, mode: m, camPos, clearance: inside, cameraInsideCar: inBox } });
      }
    }
    await page.evaluate(() => (document.querySelectorAll<HTMLElement>("#teleopDock button[data-car]")[0])?.click());
    await clickDock(page, `#teleopDock button[data-cam="0"]`);
    // AI rivals panel (05-modes)
    await clickDock(page, "#mpChip");
    await page.waitForTimeout(3000);
    await shot(page, T, "05-modes");
    await clickDock(page, "#mpCloseBtn");
    // weather presets: lighting must follow the sky (C8)
    for (const tod of ["golden", "fog", "night", "noon"]) {
      if (!(await clickDock(page, `#teleopDock button[data-tod="${tod}"]`))) continue;
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => !(window as unknown as Win).__AURA3D_SHOWCASE_TELEOPERATOR__?.evidence?.remounting, undefined, { timeout: 900_000, polling: 1000 });
      await page.waitForTimeout(15000);
      await shot(page, T, `weather-${tod}`, { canvasOnly: true, crop: true, extra: { tod } });
    }
    // gameplay through the QA hooks (fixed build only)
    const checks: Record<string, unknown> = {};
    checks.manualIdle = await qa(page, "check", "manual-idle");
    checks.kerbStop = await qa(page, "check", "kerb-stop");
    checks.skip = await qa(page, "check", "skip-pays-nothing");
    checks.shift = await qa(page, "check", "shift-results");
    log(`GL_CHECKS ${T} ${JSON.stringify(checks)}`);
    await page.waitForTimeout(6000);
    await shot(page, T, "06-results");
    log(`GL_DONE ${T}`);
  });

  test("phone", async ({ browser }) => {
    const T = "phone";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const t0 = await boot(page, server, T, { width: 390, height: 844 });
    await shot(page, T, "01-title");
    await page.waitForTimeout(Math.max(0, 25000 - (Date.now() - t0)));
    await shot(page, T, "02-early");
    const cdp = await ctx.newCDPSession(page);
    const pads = (await probe(page)).touch;
    log(`GL_NOTE ${T} pads ${JSON.stringify(pads)}`);
    const hold = async (pad: string, ms: number) => {
      const p = pads.find((q) => q.id === pad);
      if (!p) { log(`GL_NOTE ${T} no touch pad ${pad}`); return null; }
      const pt = { x: p.r.x + p.r.width / 2, y: p.r.y + p.r.height / 2 };
      const before = await probe(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
      await page.waitForTimeout(ms);
      const during = await probe(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      log(`GL_TOUCH ${T} ${pad} ${JSON.stringify({ before: before.ev?.player, during: during.ev?.player })}`);
      return during;
    };
    await hold("throttle", 8000);
    await hold("right", 8000);
    await shot(page, T, "03-action");
    await qa(page, "simulate", 45, {});
    await page.waitForTimeout(6000);
    await shot(page, T, "04-mid");
    await shot(page, T, "mid-canvas", { canvasOnly: true });
    await clickDock(page, "#mpChip");
    await page.waitForTimeout(3000);
    await shot(page, T, "05-modes");
    await clickDock(page, "#mpCloseBtn");
    log(`GL_CHECKS ${T} ${JSON.stringify({ shift: await qa(page, "check", "shift-results") })}`);
    await page.waitForTimeout(6000);
    await shot(page, T, "06-results");
    await ctx.close();
    log(`GL_DONE ${T}`);
  });

  // RP-05 game side: the default (bloom fusion) frame against ?aura3d-render=production on the same frozen street.
  test("bloom-ab", async ({ page }) => {
    const T = "bloom";
    const means: Record<string, unknown> = {};
    for (const [label, query] of [["fused", ""], ["production", "?aura3d-render=production"]] as const) {
      await boot(page, server, T, { width: 1280, height: 720 }, query);
      const frozen = await qa(page, "freeze");
      if (frozen === "__missing__") { log(`GL_NOTE ${T} no freeze hook (base build): skipped`); return; }
      await page.waitForTimeout(30000);
      await shot(page, T, `bloom-${label}`, { canvasOnly: true, quality: 92 });
      means[label] = await page.evaluate(() => (window as unknown as Win).__AURA3D_SHOWCASE_TELEOPERATOR__?.app?.diagnostics()?.renderPath ?? null);
    }
    log(`GL_NOTE ${T} renderPaths ${JSON.stringify(means)}`);
    log(`GL_DONE ${T}`);
  });

  test("card", async ({ page }) => {
    const T = "card";
    const t0 = await boot(page, server, T, { width: 1440, height: 900 });
    await page.waitForTimeout(Math.max(0, 40000 - (Date.now() - t0)));
    await shot(page, T, "card-2x", { quality: 80 });
    log(`GL_DONE ${T}`);
  });
});
