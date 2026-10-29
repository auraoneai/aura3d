import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura Slam 3D (top-tennis) audit-fix capture, remote only (tools/remote-acr/run.sh). Pattern from tests/browser/game-luma-capture.spec.ts:
 * the ACR run has no artifact egress, so everything goes to the log.
 *   GL_META <json>                          canvas-only luma stats, spectator/athlete pixel probes and game probes per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>   canvas-only JPEG, chunked
 *   TT_SHOT <profile> <state> <i>/<n> <b64> full-page JPEG for evidence/aura-slam/screens/final (same names and sizes as before)
 * Software GL presents about one frame every several seconds, so the first shot of a page is never trusted: judge the later ones.
 * Run the same spec on the base commit and on the lane branch; fields that the base does not expose come back null.
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.auraSlamReady === 'true' && document.getElementById('game')?.dataset.ready === 'true'";
const ROUTE = "/apps/showcase-top-tennis/";
const COURT_X = 5.5, COURT_Z = 8.0;

/** spectatorSeat() from examples/aura-slam/view/spectators.ts (capsule centre). */
function spectatorSeat(i: number): [number, number, number] {
  if (i < 12) return [-7.2 + (i % 6) * 2.88 + (i >= 6 ? 0.45 : 0), i < 6 ? 1.18 : 1.92, i < 6 ? -12.35 : -13.55];
  if (i < 18) return [-9.15, 1.35, -7.5 + (i - 12) * 2.75];
  return [9.15, 1.35, -7.5 + (i - 18) * 2.75];
}

interface Cam { position: number[]; target: number[]; fov: number }
interface Rect { left: number; top: number; width: number; height: number }

/** Pinhole projection with the page's own camera (graphics.camera) into page pixels of the canvas rect. */
function project(cam: Cam, rect: Rect, w: [number, number, number]): { x: number; y: number; inside: boolean } {
  const [ex, ey, ez] = cam.position as [number, number, number];
  const [tx, ty, tz] = cam.target as [number, number, number];
  let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  const rl = Math.hypot(fz, fx) || 1; const rx = -fz / rl, ry = 0, rz = fx / rl;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const dx = w[0] - ex, dy = w[1] - ey, dz = w[2] - ez;
  const cx = dx * rx + dy * ry + dz * rz, cy = dx * ux + dy * uy + dz * uz, cz = -(dx * fx + dy * fy + dz * fz);
  const aspect = rect.width / Math.max(1, rect.height);
  const t = Math.tan((cam.fov * Math.PI) / 360);
  const nx = cx / (-cz * t * aspect), ny = cy / (-cz * t);
  return { x: rect.left + (nx + 1) * 0.5 * rect.width, y: rect.top + (1 - ny) * 0.5 * rect.height, inside: Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && cz < 0 };
}

async function probe(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const ctl = w.__TOP_TENNIS_CONTROL__;
    const s = ctl?.getState?.();
    let graphics: any = null;
    try { graphics = JSON.parse(w.render_game_to_text?.() ?? "null")?.graphics ?? null; } catch { graphics = null; }
    const qa = w.__AURA_AURA_SLAM__;
    const app = w.__AURA3D_LIVE_APPS__?.all?.()[0] ?? qa?.app?.() ?? null;
    let spectators: any = null, grandstand: any = null, particles: any = null;
    try {
      const snap = app?.nodes?.require("spectators")?.snapshot();
      spectators = snap ? { visible: snap.visible, instanceColors: snap.instanceColors?.length ?? 0, instanceRgba: snap.instanceRgba ? snap.instanceRgba.length / 4 : 0, firstColors: (snap.instanceColors ?? []).slice(0, 3) } : null;
    } catch (e) { spectators = { error: String(e).slice(0, 120) }; }
    try { const g = app?.nodes?.get?.("stadium-grandstand-rear"); grandstand = g ? { visible: g.visible } : null; } catch { grandstand = null; }
    try { const p = app?.nodes?.get?.("hit-particles"); particles = p ? { visible: p.visible } : null; } catch { particles = null; }
    let diag: any = null;
    try { const d = app?.diagnostics?.(); diag = { drawCalls: d?.drawCalls ?? null, triangles: d?.triangles ?? null, fps: d?.fps ?? null, renderPath: d?.renderPath?.path ?? null }; } catch (e) { diag = { error: String(e).slice(0, 120) }; }
    const canvas = document.getElementById("game") as HTMLCanvasElement | null;
    const r = canvas?.getBoundingClientRect();
    const hint = document.getElementById("aura-controls-hint")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const err = document.getElementById("render-error");
    let quality: unknown = null;
    try { quality = app?.quality?.tier ?? null; } catch { quality = null; }
    return {
      quality, coach: Boolean(document.getElementById("coach-card")),
      mode: s?.mode ?? null, phase: s?.phase ?? null, paused: s?.paused ?? null, venue: s?.venue ?? null, server: s?.server ?? null,
      score: s ? { pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints } : null,
      player: s ? { x: s.player.x, y: s.player.y } : null, ai: s ? { x: s.ai.x, y: s.ai.y } : null,
      particleCount: s?.particles?.length ?? null, screenShake: s?.screenShake ?? null,
      camera: graphics?.camera ?? null, audience: graphics?.audience ?? null, background: graphics?.environment?.background ?? null,
      spectators, grandstand, particles, diag, hint,
      renderError: err ? { hidden: err.hidden, text: err.textContent?.slice(0, 120) ?? "" } : null,
      rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
      soundSaved: (() => { try { return localStorage.getItem("aura-slam.sound.v1"); } catch { return null; } })(),
      tournamentHidden: (document.getElementById("mode-tournament") as HTMLElement | null)?.hidden ?? null
    };
  });
}

/** Canvas-only frame: luma histogram stats plus 7x7 patch colour at the projected spectators and athletes. */
async function pixelStats(page: Page, png: Buffer, points: Array<{ id: string; x: number; y: number }>) {
  return page.evaluate(async ({ b64, pts }) => {
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
      if (y < 12) dark++;
      if (y >= 250) clip++;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    const patch = (x: number, y: number) => {
      let r = 0, g = 0, b = 0, k = 0;
      for (let yy = Math.round(y) - 3; yy <= Math.round(y) + 3; yy++) for (let xx = Math.round(x) - 3; xx <= Math.round(x) + 3; xx++) {
        if (xx < 0 || yy < 0 || xx >= c.width || yy >= c.height) continue;
        const o = (yy * c.width + xx) * 4; r += d[o]!; g += d[o + 1]!; b += d[o + 2]!; k++;
      }
      if (!k) return null;
      r /= k; g /= k; b /= k;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return { rgb: [Math.round(r), Math.round(g), Math.round(b)], sat: mx > 0 ? +((mx - mn) / mx).toFixed(3) : 0 };
    };
    const probes = pts.map((p) => ({ id: p.id, ...(patch(p.x, p.y) ?? {}) }));
    return { mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4), probes };
  }, { b64: png.toString("base64"), pts: points });
}

async function grab(page: Page, target: string, id: string): Promise<Record<string, unknown>> {
  const info = await probe(page);
  const points: Array<{ id: string; x: number; y: number }> = [];
  const athletes: Record<string, unknown> = {};
  if (info.camera && info.rect) {
    for (let i = 0; i < 24; i++) { const p = project(info.camera, info.rect, spectatorSeat(i)); if (p.inside) points.push({ id: `spec${i}`, x: p.x, y: p.y }); }
    for (const side of ["player", "ai"] as const) {
      const a = info[side];
      if (!a) continue;
      const feet = project(info.camera, info.rect, [a.x * COURT_X, 0.05, a.y * COURT_Z]);
      const head = project(info.camera, info.rect, [a.x * COURT_X, 1.75, a.y * COURT_Z]);
      // On screen = inside the camera frustum AND inside the visible viewport (a canvas taller than the screen hides its bottom).
      const vp = page.viewportSize() ?? { width: 1280, height: 720 };
      const onScreen = (p: { x: number; y: number; inside: boolean }) => p.inside && p.x >= 0 && p.x <= vp.width && p.y >= 0 && p.y <= vp.height;
      athletes[side] = { feet: [Math.round(feet.x), Math.round(feet.y)], head: [Math.round(head.x), Math.round(head.y)], inside: onScreen(feet) && onScreen(head) };
      points.push({ id: `${side}-torso`, x: (feet.x + head.x) / 2, y: (feet.y + head.y) / 2 });
    }
  }
  const style = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  await style.evaluate((el) => el.remove());
  const stats = await pixelStats(page, png, points);
  const spectatorProbes = stats.probes.filter((p) => p.id.startsWith("spec"));
  const meanSat = spectatorProbes.length ? +(spectatorProbes.reduce((acc, p) => acc + (("sat" in p && typeof p.sat === "number") ? p.sat : 0), 0) / spectatorProbes.length).toFixed(3) : null;
  const meta = { target, id, ...info, athletes, ...stats, spectatorMeanSat: meanSat, spectatorsInFrame: spectatorProbes.length };
  log(`GL_META ${JSON.stringify(meta)}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return meta;
}

async function shot(page: Page, profile: string, state: string): Promise<void> {
  const buf = await page.screenshot({ type: "jpeg", quality: 84, timeout: 120_000 });
  const b64 = buf.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`TT_SHOT ${profile} ${state} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function click(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.click(), selector);
}

async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(250);
}

async function open(page: Page, query: string, profile: { width: number; height: number }): Promise<void> {
  page.on("pageerror", (e) => log(`GL_ERR pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`GL_CONSOLE ${m.type()} ${m.text().slice(0, 240)}`); });
  await page.setViewportSize(profile);
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
}

/** Drive the match to the results screen through the QA hooks: whole 1/60 s steps with the Auto player on. */
async function playToResults(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const qa = w.__AURA_AURA_SLAM__;
    const ctl = w.__TOP_TENNIS_CONTROL__;
    let batches = 0;
    while (batches < 400 && ctl.getState().mode !== "gameover") { qa.stepFrames(600); batches++; }
    const s = ctl.getState();
    return { batches, steps: batches * 600, mode: s.mode, phase: s.phase, winner: s.winner ?? null, score: s.score, resultHidden: document.getElementById("result")?.classList.contains("hidden") ?? null };
  });
}

let server: ExampleDevServer;
test.describe("top-tennis audit-fix capture", () => {
  test.setTimeout(3_000_000);
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const profile of [{ name: "1280", width: 1280, height: 720, mobile: false }, { name: "390", width: 390, height: 844, mobile: true }]) {
    test(`tt-flow-${profile.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, isMobile: profile.mobile, hasTouch: profile.mobile });
      const page = await context.newPage();
      await open(page, "", profile);
      await page.waitForTimeout(8_000);
      await shot(page, profile.name, "01-title");
      await click(page, "#aura-btn-play");
      await page.waitForTimeout(5_000);
      await shot(page, profile.name, "02-early");
      await holdKey(page, "KeyD", 1200); await holdKey(page, "Space", 300); await holdKey(page, "KeyA", 1200);
      await shot(page, profile.name, "03-action");
      await click(page, "#aura-btn-auto");
      await page.waitForTimeout(12_000);
      await shot(page, profile.name, "04-mid");
      await grab(page, `flow-${profile.name}`, "mid-a");
      await page.waitForTimeout(30_000);
      const steady = await grab(page, `flow-${profile.name}`, "mid-b");
      await page.waitForTimeout(20_000);
      const steady2 = await grab(page, `flow-${profile.name}`, "mid-c");
      await click(page, "#aura-btn-menu");
      await page.waitForTimeout(3_000);
      await shot(page, profile.name, "05-modes");
      await grab(page, `flow-${profile.name}`, "modes");
      await click(page, "#aura-btn-play");
      // The Auto player must be on for the QA drive (the quick-bar button toggles, so click it only when it is off).
      await page.evaluate(() => { const b = document.getElementById("aura-btn-auto"); if (b && !b.classList.contains("active")) b.click(); });
      await page.waitForTimeout(2_000);
      const ended = await playToResults(page);
      log(`GL_META ${JSON.stringify({ target: `flow-${profile.name}`, id: "results-drive", ended })}`);
      await page.waitForTimeout(12_000);
      await shot(page, profile.name, "06-results");
      await grab(page, `flow-${profile.name}`, "results");
      log(`GL_DONE flow-${profile.name}`);
      await context.close();
      // C2: both athletes inside the canvas during play (judged at steady state, both later shots).
      for (const meta of [steady, steady2]) {
        const a = meta.athletes as Record<string, { inside: boolean }>;
        expect.soft(a.player?.inside, `player inside canvas at ${meta.id}`).toBe(true);
        expect.soft(a.ai?.inside, `rival inside canvas at ${meta.id}`).toBe(true);
      }
    });
  }

  test("tt-misc-card", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await open(page, "", { width: 1440, height: 900 });
    await page.waitForTimeout(8_000);
    await click(page, "#aura-btn-play");
    await holdKey(page, "KeyD", 1200); await holdKey(page, "Space", 300); await holdKey(page, "KeyA", 1200);
    await click(page, "#aura-btn-auto");
    await page.waitForTimeout(40_000);
    await shot(page, "card", "card-2x");
    log("GL_DONE card");
    await context.close();
  });

  // Steady-state luma: the Auto player on hard court (with ?diag=1 for the safety-net and render-path checks) and the production render path.
  for (const v of [{ name: "auto", query: "?autoplay=1&diag=1" }, { name: "production", query: "?autoplay=1&aura3d-render=production" }]) {
    test(`tt-state-${v.name}`, async ({ page }) => {
      await open(page, v.query, { width: 1280, height: 720 });
      for (const sec of [10, 40, 70]) {
        await page.waitForTimeout(sec === 10 ? 10_000 : 30_000);
        await grab(page, `state-${v.name}`, `settle-${sec}s`);
      }
      const extra = await page.evaluate(() => {
        const w = window as unknown as Record<string, any>;
        const app = w.__AURA3D_LIVE_APPS__?.all?.()[0];
        let renderPath: unknown = null, ignored: unknown = null, safety: unknown = null;
        try { renderPath = app?.diagnostics?.()?.renderPath ?? null; } catch (e) { renderPath = String(e); }
        try { ignored = JSON.stringify(app?.diagnostics?.() ?? {}).match(/OPTION_IGNORED[^"]{0,160}/g) ?? []; } catch { ignored = null; }
        try { const sf = w.__AURA_SAFETY__?.(); safety = sf ? { blackSamples: sf.observed?.blackSamples ?? null, stage: sf.stage ?? null, rung: sf.rung ?? null, escalated: sf.escalated ?? null } : null; } catch (e) { safety = String(e); }
        return { renderPath, ignored, safety };
      });
      log(`GL_META ${JSON.stringify({ target: `state-${v.name}`, id: "diag", ...extra })}`);
      log(`GL_DONE state-${v.name}`);
    });
  }

  // All six venues with ?capture=1 (the upgrade-guide check), Auto player on, judged at the later shots.
  for (const venue of ["hard", "grass", "clay", "desert", "beach", "moon"]) {
    test(`tt-venue-${venue}`, async ({ page }) => {
      await open(page, `?venue=${venue}&autoplay=1&capture=1`, { width: 1280, height: 720 });
      // Also switch through the quick bar, the live path a player uses (the base build ignored ?venue= on quick start).
      await page.evaluate((v) => (document.querySelector(`[data-aura-venue="${v}"]`) as HTMLElement | null)?.click(), venue);
      for (const sec of [30, 60]) {
        await page.waitForTimeout(30_000);
        await grab(page, `venue-${venue}`, `settle-${sec}s`);
      }
      log(`GL_DONE venue-${venue}`);
    });
  }

  test("tt-misc-ctxloss", async ({ page }) => {
    await open(page, "?autoplay=1", { width: 1280, height: 720 });
    await page.waitForTimeout(10_000);
    const lost = await page.evaluate(async () => {
      const canvas = document.getElementById("game") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
      const ext = gl?.getExtension("WEBGL_lose_context");
      if (!ext) return { ext: false };
      const w = window as unknown as Record<string, any>;
      const t0 = w.__TOP_TENNIS_CONTROL__.getState().time;
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 3000));
      const s = w.__TOP_TENNIS_CONTROL__.getState();
      const err = document.getElementById("render-error")!;
      const snapshot = { ext: true, paused: s.paused, simAdvancedWhileLost: +(s.time - t0).toFixed(3), errorHidden: err.hidden, errorText: err.textContent?.slice(0, 120) };
      ext.restoreContext();
      return snapshot;
    });
    log(`GL_META ${JSON.stringify({ target: "ctxloss", id: "lost", lost })}`);
    await page.waitForTimeout(20_000);
    const after = await page.evaluate(() => {
      const err = document.getElementById("render-error")!;
      const w = window as unknown as Record<string, any>;
      return { errorHidden: err.hidden, errorText: err.textContent?.slice(0, 120), paused: w.__TOP_TENNIS_CONTROL__.getState().paused };
    });
    log(`GL_META ${JSON.stringify({ target: "ctxloss", id: "restored", after })}`);
    await page.mouse.click(640, 360);
    await page.waitForTimeout(20_000);
    await grab(page, "ctxloss", "after-restore");
    log("GL_DONE ctxloss");
  });
});
