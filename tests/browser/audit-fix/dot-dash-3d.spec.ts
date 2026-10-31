import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G13 (Glint Courier, `dot-dash-3d`). Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so
 * everything goes to the log:
 *   G13_META <json>                         luma stats (whole frame, thirds, mean RGB) + engine diagnostics per shot
 *   G13_JPG  <target> <shot> <i>/<n> <b64>  JPEG, chunked (canvas-only unless the shot name ends in "-ui")
 *   G13_CHECK <json>                        one behaviour probe (name, values, pass)
 * The software-GL runner presents about one frame every several seconds, so every shot that is judged is a late one.
 *
 * State access: the game installs `window.__AURA_DOT_DASH_3D__` (installQaHooks) with `sim()` (the live simulation object)
 * and `pose()` (the camera pose it set last). The BEFORE run uses a measurement-only patch of the base that exposes the
 * same `sim()`; `pose()` then falls back to the base rig constants below.
 *
 * Targets (select with --grep):
 *   g13-live / g13-hemi-*   wave-2 LIGHT-03 luma targets (1280x720, settle 30 s and 75 s)
 *   g13-desktop / g13-phone steady-state frames + maze-fit numbers (1280x720 and 390x844)
 *   g13-flow                game over -> Retry (DD-1), Next Board keeps score (DD-5), win card (DD-2), R repeat and
 *                           Escape/blur pause (DD-14), surge bar duration (DD-11), first-move prompt (DD-6)
 *   g13-shadow-on/-off      DD-10 shadow A/B (`?g13shadow=0` is read only by the measurement build)
 *   g13-dpr2                device scale factor 2 timing (the hf432 "dot-dash dpr2" timeout)
 *   g13-screens-<1280|390|card> RH-05 / DD-4 retake of evidence/dot-dash-3d/screens/final (same names and sizes)
 */
const SETTLE_SECONDS = (process.env.G13_SETTLE ?? "30,75").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const ROUTE = "/apps/showcase-dot-dash-3d/";

interface Target { readonly name: string; readonly url: string }

const LUMA_TARGETS: readonly Target[] = [
  { name: "g13-live", url: ROUTE },
  ...["0.85", "0.6", "0.4", "0.2", "0"].map((v) => ({ name: `g13-hemi-${v}`, url: `${ROUTE}?g13hemi=${v}` }))
];

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
    const third = [0, 0, 0];
    const thirdN = [0, 0, 0];
    let sum = 0, dark = 0, r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y; r += d[i]!; g += d[i + 1]!; b += d[i + 2]!;
      if (y < 12) dark++;
      const row = Math.floor(i / 4 / c.width);
      const band = Math.min(2, Math.floor((row * 3) / c.height));
      third[band]! += y; thirdN[band]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      w: c.width, h: c.height,
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkBelow12: +(dark / n).toFixed(4),
      rgb: [+(r / n).toFixed(1), +(g / n).toFixed(1), +(b / n).toFixed(1)],
      top: +(third[0]! / Math.max(1, thirdN[0]!)).toFixed(2), mid: +(third[1]! / Math.max(1, thirdN[1]!)).toFixed(2), bottom: +(third[2]! / Math.max(1, thirdN[2]!)).toFixed(2)
    };
  }, png.toString("base64"));
}

async function engineInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      const warnings = (dg?.warnings ?? dg?.runtimeWarnings ?? []) as Array<{ code?: string } | string>;
      const codes: Record<string, number> = {};
      for (const w of Array.isArray(warnings) ? warnings : []) { const c = typeof w === "string" ? w : w?.code ?? "?"; codes[c] = (codes[c] ?? 0) + 1; }
      return {
        app: true, renderPath: dg?.renderPath?.path ?? null, quality: dg?.renderPath?.quality ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null,
        drawCalls: dg?.drawCalls ?? null, fps: dg?.fps ?? null, warningCodes: codes,
        healRung: (globalThis as any).__AURA3D_HEAL__?.rung ?? 0, simTime: (globalThis as any).__AURA3D_DOT_DASH__?.simTime ?? null
      };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function emitJpg(target: string, id: string, jpg: Buffer): Promise<void> {
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`G13_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Canvas-only shot with luma stats; `ui: true` keeps the DOM (cards, HUD) in the JPEG and the stats. */
async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}, opts: { ui?: boolean; quality?: number } = {}): Promise<void> {
  const handle = opts.ui ? null : await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png", timeout: 180_000 });
  const jpg = await page.screenshot({ type: "jpeg", quality: opts.quality ?? 70, timeout: 180_000 });
  if (handle) await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`G13_META ${JSON.stringify({ target, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  await emitJpg(target, id, jpg);
}

function check(name: string, values: Record<string, unknown>, pass: boolean | null): void {
  log(`G13_CHECK ${JSON.stringify({ name, pass, ...values })}`);
}

async function open(page: Page, url: string): Promise<number> {
  page.on("pageerror", (e) => log(`G13_ERR pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`G13_CONSOLE ${m.text().slice(0, 240)}`); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  try {
    await page.waitForFunction(READY, undefined, { timeout: 360_000, polling: 500 });
  } catch {
    log(`G13_ERR ${url} not-ready`);
  }
  return Date.now() - t0;
}

async function waitUntil(page: Page, fn: string, timeoutMs: number): Promise<boolean> {
  try { await page.waitForFunction(fn, undefined, { timeout: timeoutMs, polling: 250 }); return true; } catch { return false; }
}

const SIM = "(window.__AURA_DOT_DASH_3D__ && window.__AURA_DOT_DASH_3D__.sim && window.__AURA_DOT_DASH_3D__.sim())";

/** Ids of every `.dd-overlay` that is currently laid out (display is not none). */
async function visibleOverlays(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(".dd-overlay"))
    .filter((el) => getComputedStyle(el).display !== "none" && !el.hidden).map((el) => el.id));
}

async function simRead(page: Page) {
  return page.evaluate((expr) => {
    // eslint-disable-next-line no-eval
    const s = (0, eval)(expr) as any;
    if (!s) return null;
    return { mode: s.mode, runKind: s.runKind, mazeId: s.mazeId, score: s.score, lives: s.lives, dotsLeft: s.dotsLeft, hasMoved: s.hasMoved, mazesPlayed: s.profile?.mazesPlayed, fright: s.fright, frightMax: s.frightMax ?? null, boardsCleared: s.boardsCleared ?? null };
  }, SIM);
}

/** Maze-fit numbers: project the four outer wall corners through the pose the game set (or the base rig) at this aspect. */
async function mazeFit(page: Page) {
  return page.evaluate((expr) => {
    const hooks = (window as any).__AURA_DOT_DASH_3D__;
    const s = (0, eval)(expr) as any;
    const canvas = document.querySelector("#app canvas") as HTMLCanvasElement | null;
    const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : innerWidth / innerHeight;
    let pose = hooks?.pose?.();
    let source = "hook";
    if (!pose) {
      // base rig (world.ts on audit-fix/integration): fixed position/fov, follow offset 0.16 / 0.12 of the player
      source = "base-rig";
      const px = s ? s.player.px - 9 : 0, pz = s ? s.player.py - 10 : 5;
      const follow = !s || s.camera !== "overhead";
      const bx = follow ? px * 0.16 : 0, bz = follow ? pz * 0.12 : 0;
      pose = follow ? { position: [bx, 17.2, 13.8 + bz], target: [bx * 0.75, 0, bz * 0.65], fov: 48 } : { position: [0, 17.2, 13.8], target: [0, 0, 0], fov: 48 };
    }
    const [ex, ey, ez] = pose.position as number[];
    const [tx, ty, tz] = pose.target as number[];
    let fx = tx - ex, fy = ty - ey, fz = tz - ez;
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    // right = f x up(0,1,0)
    let rx = -fz, ry = 0, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const t = Math.tan((pose.fov * Math.PI) / 360);
    const corners = [[-9.5, -10.5], [9.5, -10.5], [-9.5, 10.5], [9.5, 10.5]].map(([x, z]) => {
      const dx = x! - ex, dy = 0.65 - ey, dz = z! - ez;
      const depth = dx * fx + dy * fy + dz * fz;
      return [+((dx * rx + dy * ry + dz * rz) / (depth * t * aspect)).toFixed(3), +((dx * ux + dy * uy + dz * uz) / (depth * t)).toFixed(3)];
    });
    const inside = corners.every(([x, y]) => Math.abs(x!) <= 1 && Math.abs(y!) <= 1);
    const maxAbsX = Math.max(...corners.map(([x]) => Math.abs(x!)));
    return { source, aspect: +aspect.toFixed(3), pose, corners, inside, maxAbsX: +maxAbsX.toFixed(3), visibleWidthFraction: +Math.min(1, 1 / maxAbsX).toFixed(3) };
  }, SIM);
}

async function domClick(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => { const el = document.querySelector(sel) as HTMLElement | null; if (!el) return false; el.click(); return true; }, selector);
}

async function settleShots(page: Page, target: string, loadedAt: number, seconds: readonly number[], extra: () => Promise<Record<string, unknown>>): Promise<void> {
  for (const sec of seconds) {
    const wait = sec * 1000 - (Date.now() - loadedAt);
    if (wait > 0) await page.waitForTimeout(wait);
    await grab(page, target, `settle-${sec}s`, { sinceReadyMs: Date.now() - loadedAt, ...(await extra()) });
  }
}

test.describe("g13 dot-dash-3d", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of LUMA_TARGETS) {
    test(target.name, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await open(page, `${server.origin}${target.url}`);
      await settleShots(page, target.name, Date.now(), SETTLE_SECONDS, async () => ({}));
      log(`G13_DONE ${target.name}`);
    });
  }

  test("g13-desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const readyMs = await open(page, `${server.origin}${ROUTE}`);
    // first input so the sentries and the courier move (the board holds until the first direction)
    await page.waitForTimeout(8_000);
    await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(1500); await page.keyboard.up("ArrowLeft");
    await settleShots(page, "g13-desktop", Date.now(), [45, 90], async () => ({ readyMs, fit: await mazeFit(page), sim: await simRead(page) }));
    await grab(page, "g13-desktop", "ui-90s", {}, { ui: true });
    log("G13_DONE g13-desktop");
  });

  test("g13-phone", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const readyMs = await open(page, `${server.origin}${ROUTE}`);
    await page.waitForTimeout(8_000);
    const fit = await mazeFit(page);
    check("DD-3 phone maze fit", { fit }, fit.inside);
    await settleShots(page, "g13-phone", Date.now(), [45, 90], async () => ({ readyMs, fit: await mazeFit(page), sim: await simRead(page) }));
    await grab(page, "g13-phone", "ui-90s", {}, { ui: true });
    const ui = await page.evaluate(() => {
      const pauseBtn = document.getElementById("dd-btn-pause");
      const hint = document.getElementById("dd-first-hint");
      const r = pauseBtn?.getBoundingClientRect();
      return { pauseButton: pauseBtn ? { w: r!.width, h: r!.height, visible: getComputedStyle(pauseBtn).display !== "none" } : null, hint: hint ? { text: hint.textContent, visible: !hint.hidden && getComputedStyle(hint).display !== "none" } : null };
    });
    check("DD-E2 touch pause button and first-run hint", ui, Boolean(ui.pauseButton && ui.pauseButton.w >= 44 && ui.pauseButton.h >= 44 && ui.hint?.visible));
    if (ui.pauseButton) {
      await domClick(page, "#dd-btn-pause");
      await page.waitForTimeout(1500);
      const overlays = await visibleOverlays(page);
      check("DD-E2 pause button opens the pause menu", { overlays }, overlays.includes("dd-pause"));
      await domClick(page, "#dd-resume");
    }
    await ctx.close();
    log("G13_DONE g13-phone");
  });

  test("g13-flow", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, `${server.origin}${ROUTE}`);
    const hooked = await waitUntil(page, `Boolean(${SIM})`, 120_000);
    check("sim handle", { hooked }, hooked);
    if (!hooked) return;
    await page.waitForTimeout(10_000);

    // DD-6: the first-move prompt while the board waits for a direction
    const prompt = await page.evaluate(() => ({ banner: document.getElementById("dd-banner")?.className, big: document.getElementById("dd-banner-big")?.textContent, small: document.getElementById("dd-banner-small")?.textContent }));
    check("DD-6 press-a-direction prompt before the first move", { prompt, sim: await simRead(page) }, /direction/i.test(`${prompt.small ?? ""} ${prompt.big ?? ""}`) && /show/.test(prompt.banner ?? ""));
    // DD-6: spawn distances (path tiles) of every sentry from the courier
    const spawn = await page.evaluate((expr) => {
      const s = (0, eval)(expr) as any;
      const m = s.maze; const W = m.width, H = m.height;
      const start = Math.round(s.player.py) * W + Math.round(s.player.px);
      const dist = new Int32Array(W * H).fill(-1); dist[start] = 0; const q = [start];
      while (q.length) { const c = q.shift()!; const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let nx = cx + dx!, ny = cy + dy!; if (m.def.wrapX) nx = (nx + W) % W; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx; if (m.wall[ni] || m.ghostOnly?.[ni] || dist[ni]! >= 0) continue; dist[ni] = dist[c]! + 1; q.push(ni); } }
      return s.ghosts.map((g: any) => ({ id: g.id, tile: [Math.round(g.px), Math.round(g.py)], pathTiles: dist[Math.round(g.py) * W + Math.round(g.px)], releaseAt: g.releaseAt }));
    }, SIM);
    const sly = spawn.find((g: any) => g.id === "sly");
    check("DD-6 sentry spawn path distance", { spawn }, Boolean(sly && sly.pathTiles >= 10));

    // DD-11: the surge bar divides by this board's surge duration
    await page.evaluate((expr) => { const s = (0, eval)(expr) as any; s.hasMoved = true; }, SIM);
    await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(800); await page.keyboard.up("ArrowLeft");

    // DD-14: R held (key repeat) restarts once
    const before = (await simRead(page))!.mazesPlayed as number;
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR", bubbles: true }));
      for (let i = 0; i < 4; i++) document.dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR", repeat: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "r", code: "KeyR", bubbles: true }));
    });
    await page.waitForTimeout(3_000);
    const afterR = (await simRead(page))!.mazesPlayed as number;
    check("DD-14 held R restarts once", { restarts: afterR - before }, afterR - before === 1);

    // DD-14: blur pauses
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(1_500);
    const blurOverlays = await visibleOverlays(page);
    check("DD-14 window blur pauses", { overlays: blurOverlays }, blurOverlays.includes("dd-pause"));
    await domClick(page, "#dd-resume");
    await page.waitForTimeout(1_000);

    // DD-5: Next Board keeps score and lives
    await page.evaluate((expr) => { const s = (0, eval)(expr) as any; s.score = 1234; s.lives = 2; s.hasMoved = true; s.dots.fill(0); s.dotsLeft = 0; }, SIM);
    const clearShown = await waitUntil(page, `${SIM}.mode === "cleared" && !document.getElementById("dd-clear").hidden`, 120_000);
    const atClear = await simRead(page);
    await grab(page, "g13-flow", "clear-card-ui", {}, { ui: true });
    await domClick(page, "#dd-next-maze");
    await page.waitForTimeout(4_000);
    const afterNext = await simRead(page);
    check("DD-5 Next Board keeps score and lives", { clearShown, atClear, afterNext }, Boolean(afterNext && atClear && afterNext.mazeId === "spiral" && afterNext.score === atClear.score && afterNext.lives === 2));

    // DD-11: surge bar width right after a surge on board 2
    await page.evaluate((expr) => {
      const s = (0, eval)(expr) as any; const m = s.maze;
      const px = Math.round(s.player.px), py = Math.round(s.player.py);
      s.orbs[py * m.width + px] = 1; s.hasMoved = true;
    }, SIM);
    await waitUntil(page, `${SIM}.fright > 0`, 60_000);
    const surge = await page.evaluate((expr) => { const s = (0, eval)(expr) as any; const f = document.getElementById("dd-orb-fill") as HTMLElement | null; return { fright: s.fright, frightMax: s.frightMax ?? null, barWidth: f?.style.width }; }, SIM);
    check("DD-11 surge bar starts near full", surge, parseFloat(surge.barWidth ?? "0") >= 90);

    // DD-1: game over -> Escape ignored -> Retry hides the card
    await page.evaluate((expr) => { const s = (0, eval)(expr) as any; s.fright = 0; s.lives = 0; s.mode = "dying"; s.deathT = 0.01; }, SIM);
    const goShown = await waitUntil(page, `${SIM}.mode === "gameover"`, 120_000);
    await page.waitForTimeout(6_000);
    await grab(page, "g13-flow", "gameover-ui", { overlays: await visibleOverlays(page) }, { ui: true });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1_500);
    const escOverlays = await visibleOverlays(page);
    check("DD-14 Escape is ignored on the game-over card", { overlays: escOverlays }, !escOverlays.includes("dd-pause"));
    await domClick(page, "#dd-go-retry");
    await page.waitForTimeout(4_000);
    const afterRetry = { sim: await simRead(page), overlays: await visibleOverlays(page), gameoverDisplay: await page.evaluate(() => getComputedStyle(document.getElementById("dd-gameover")!).display) };
    check("DD-1 Retry hides the game-over card", { goShown, ...afterRetry }, afterRetry.sim?.mode === "play" && !afterRetry.overlays.includes("dd-gameover"));
    await page.waitForTimeout(20_000);
    await grab(page, "g13-flow", "after-retry-ui", { overlays: await visibleOverlays(page) }, { ui: true });

    // DD-2: a Board Map run ends on a win card
    await domClick(page, '[data-venue="classic"]');
    await page.waitForTimeout(2_000);
    await page.evaluate((expr) => { const s = (0, eval)(expr) as any; s.hasMoved = true; s.dots.fill(0); s.dotsLeft = 0; }, SIM);
    const won = await waitUntil(page, `${SIM}.mode === "win"`, 240_000);
    await page.waitForTimeout(6_000);
    const winOverlays = await visibleOverlays(page);
    const winText = await page.evaluate(() => document.getElementById("dd-win")?.innerText ?? null);
    check("DD-2 win state shows a card", { won, overlays: winOverlays, winText, sim: await simRead(page) }, winOverlays.includes("dd-win"));
    await grab(page, "g13-flow", "win-ui", { overlays: winOverlays }, { ui: true });
    if (winOverlays.includes("dd-win")) {
      await domClick(page, "#dd-win-replay");
      await page.waitForTimeout(3_000);
      const afterReplay = { sim: await simRead(page), overlays: await visibleOverlays(page) };
      check("DD-2 Replay leaves the win card", afterReplay, afterReplay.sim?.mode === "play" && !afterReplay.overlays.includes("dd-win"));
    }
    log("G13_DONE g13-flow");
  });

  for (const [name, query] of [["g13-shadow-on", ""], ["g13-shadow-off", "?g13shadow=0"]] as const) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await open(page, `${server.origin}${ROUTE}${query}`);
      const shadows = async () => page.evaluate(() => {
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
        try { const dg = app?.diagnostics?.(); return { lights: dg?.shadows?.shadows ?? null, renderer: dg?.renderer?.shadows ?? null, cascade: dg?.lighting?.timings?.shadowCascade ?? null }; } catch (e) { return { err: String(e) }; }
      });
      await settleShots(page, name, Date.now(), [75], async () => ({ shadows: await shadows() }));
      log(`G13_DONE ${name}`);
    });
  }

  test("g13-dpr2", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const readyMs = await open(page, `${server.origin}${ROUTE}`);
    const t0 = Date.now();
    const frames0 = await page.evaluate(() => (window as any).__AURA3D_DOT_DASH__?.frame ?? null);
    await page.waitForTimeout(30_000);
    const frames1 = await page.evaluate(() => (window as any).__AURA3D_DOT_DASH__?.frame ?? null);
    const shotStart = Date.now();
    await grab(page, "g13-dpr2", "settle-30s", { readyMs, framesIn30s: frames0 !== null && frames1 !== null ? frames1 - frames0 : null });
    log(`G13_META ${JSON.stringify({ target: "g13-dpr2", id: "timing", readyMs, screenshotMs: Date.now() - shotStart, sinceReadyMs: Date.now() - t0, framesIn30s: frames0 !== null && frames1 !== null ? frames1 - frames0 : null })}`);
    await ctx.close();
    log("G13_DONE g13-dpr2");
  });

  /** DD-E3: with prefers-reduced-motion the death keeps the courier visible (no 24 Hz flicker) and skips the red fade. */
  for (const [name, reduce] of [["g13-calm-off", false], ["g13-calm-on", true]] as const) {
    test(name, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
      await page.setViewportSize({ width: 1280, height: 720 });
      await open(page, `${server.origin}${ROUTE}`);
      const hooked = await waitUntil(page, `Boolean(${SIM})`, 120_000);
      if (!hooked) { check(`${name} sim handle`, {}, false); return; }
      await page.waitForTimeout(6_000);
      // freeze the sim clock inside a death and step the visual phase by hand so the sample does not depend on frame rate
      const samples = await page.evaluate((expr) => {
        const s = (0, eval)(expr) as any;
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
        s.hasMoved = true; s.mode = "dying"; s.deathT = 1.2; s.lives = 2;
        const out: boolean[] = [];
        for (let i = 0; i < 48; i++) {
          s.time = 10 + i * 0.011;
          s.deathT = 1.2; // keep the dying state while sampling
          const byte = app?.nodes?.get?.("byte");
          (globalThis as any).__AURA_DOT_DASH_3D__?.sync?.();
          out.push(byte ? byte.visible !== false : true);
        }
        return out;
      }, SIM);
      await page.waitForTimeout(4_000);
      const visibleFrac = samples.filter(Boolean).length / samples.length;
      await grab(page, name, "dying", { reducedMotion: reduce, visibleFrac });
      check(`DD-E3 ${name} courier visibility while dying`, { reduce, visibleFrac, n: samples.length }, null);
      log(`G13_DONE ${name}`);
    });
  }

  /** All six boards through Board Map: per-board palette (DD-E1) and the upgrade-guide "play all six mazes" check. */
  test("g13-boards", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, `${server.origin}${ROUTE}`);
    await page.waitForTimeout(10_000);
    for (const id of ["classic", "spiral", "twin", "garden", "foundry", "zerocore"]) {
      await domClick(page, `[data-venue="${id}"]`);
      await page.waitForTimeout(2_000);
      await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(900); await page.keyboard.up("ArrowLeft");
      await page.waitForTimeout(40_000);
      const pools = await page.evaluate(() => {
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
        const out: Record<string, number | null> = {};
        for (const k of ["wall", "rail", "dot", "dress", "glow", "trophy", "shC", "shB", "shT", "shY"]) {
          try { const n = app?.nodes?.get?.(`pool-${k}`); const snap = n?.snapshot?.(); out[k] = snap?.instanceMatrices ? snap.instanceMatrices.length / 16 : null; } catch { out[k] = null; }
        }
        return out;
      });
      await grab(page, "g13-boards", id, { sim: await simRead(page), pools });
    }
    log("G13_DONE g13-boards");
  });

  /** Upgrade-guide build + route-health check, run inside the remote image (no local builds). */
  test("g13-build", async () => {
    const { execSync } = await import("node:child_process");
    const cwd = `${process.cwd()}/apps/showcase-dot-dash-3d`;
    const runCmd = (cmd: string) => {
      try { return { ok: true, out: execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600_000 }).slice(-1500) }; }
      catch (e) { const err = e as { stdout?: string; stderr?: string; message: string }; return { ok: false, out: `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message}`.slice(-2500) }; }
    };
    const build = runCmd(`${process.cwd()}/node_modules/.bin/vite build`);
    log(`G13_CHECK ${JSON.stringify({ name: "upgrade-guide vite build", pass: build.ok, tail: build.out })}`);
    const health = runCmd("node scripts/write-route-health.mjs");
    log(`G13_CHECK ${JSON.stringify({ name: "upgrade-guide route-health", pass: health.ok, tail: health.out })}`);
  });

  /** RH-05 / DD-4: the inventory's screens set (same file names and sizes as evidence/dot-dash-3d/screens/final). */
  async function screens(browser: Browser, profile: { name: string; width: number; height: number; mobile: boolean }): Promise<void> {
    const ctx = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, isMobile: profile.mobile, hasTouch: profile.mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const shot = async (state: string) => {
      const jpg = await page.screenshot({ type: "jpeg", quality: 84, timeout: 180_000 });
      const png = await page.screenshot({ type: "png", timeout: 180_000 });
      log(`G13_META ${JSON.stringify({ target: `screens-${profile.name}`, id: state, ...(await lumaStats(page, png)), sim: await simRead(page) })}`);
      await emitJpg(`screens-${profile.name}`, state, jpg);
    };
    if (profile.name === "card") {
      await open(page, `${server.origin}${ROUTE}?autoplay=1`);
      await page.waitForTimeout(60_000);
      await shot("04-mid");
      await ctx.close();
      return;
    }
    await open(page, `${server.origin}${ROUTE}?autostart=0`);
    await page.waitForTimeout(40_000);
    await shot("01-title");
    await domClick(page, "#dd-t-quick");
    await page.waitForTimeout(40_000);
    await shot("02-early");
    for (const k of ["ArrowRight", "ArrowDown", "ArrowLeft"]) { await page.keyboard.down(k); await page.waitForTimeout(1200); await page.keyboard.up(k); await page.waitForTimeout(250); }
    await page.waitForTimeout(30_000);
    await shot("03-action");
    await open(page, `${server.origin}${ROUTE}?autoplay=1`);
    await page.waitForTimeout(60_000);
    await shot("04-mid");
    await domClick(page, "#dd-btn-circuit");
    await page.waitForTimeout(20_000);
    await shot("05-modes");
    await ctx.close();
  }

  // One test per viewport (GU47 phase 3): the three profiles in one test outran the 30 min test timeout on the
  // software-GL runner. `--grep=g13-screens` still runs all three; `--grep=g13-screens-390` runs one.
  for (const profile of [
    { name: "1280", width: 1280, height: 720, mobile: false },
    { name: "390", width: 390, height: 844, mobile: true },
    { name: "card", width: 1440, height: 900, mobile: false }
  ]) {
    test(`g13-screens-${profile.name}`, async ({ browser }) => {
      // five steady screens at 20-60 s each outran 30 min on a busy software-GL runner (the ACR step allows 60 min)
      test.setTimeout(3_300_000);
      await screens(browser, profile);
      log(`G13_DONE g13-screens-${profile.name}`);
    });
  }
});
