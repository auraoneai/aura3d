import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura FC 3D audit-fix captures (lane G09). Remote only: tools/remote-acr/run.sh with
 *   SPECS="tests/browser/audit-fix/aura-fc-3d.spec.ts" EXTRA_DIRS="apps/showcase-aura-fc-3d apps/showcase-port-shared"
 *   PUBLIC_ASSETS="<the files in apps/showcase-aura-fc-3d/src/aura-assets-v2.ts>"
 * The run has no artifact egress, so everything goes to the log:
 *   FC_META <json>                        luma stats, sim/camera evidence and measured numbers per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  JPEG of the canvas (or the whole page for HUD shots), chunked
 * Software GL presents about one frame every several seconds, so the sim is advanced with the QA hook `step(n)` (fixed 1/60 s
 * steps) and each shot waits for two fresh rendered frames. The first shot of a target is not trusted; judge the later ones.
 */
const CHUNK = 16000;
const HOOK = "__AURA_AURA_FC_3D__";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const PITCH_HX = 30;

let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

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

/** Everything the page can tell us about the frame: game evidence, engine diagnostics, goal-net world box, touch DOM. */
async function pageInfo(page: Page) {
  return page.evaluate(() => {
    const w = window as any;
    const ev = w.__AURA3D_GAME_EVIDENCE__ ?? null;
    const app = w.__AURA3D_LIVE_APPS__?.all?.()[0];
    let diag: any = null, net: any = null, netErr: string | null = null;
    try { const dg = app?.diagnostics?.(); diag = { renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null }; } catch (e) { diag = { err: String(e) }; }
    try { net = app?.nodes?.require?.("fc-goal-mesh-1")?.bounds?.() ?? null; } catch (e) { netErr = String(e).slice(0, 160); }
    const stick = document.querySelectorAll(".a3g-tc-stick, .fc-touch-stick").length;
    const touchButtons = Array.from(document.querySelectorAll<HTMLElement>(".a3g-tc-btn, .fc-touch-btn")).map((b) => b.dataset.control ?? b.dataset.fcTouch ?? b.textContent ?? "");
    const pausePanel = Boolean(document.querySelector(".fc-pause:not(.fc-hidden)"));
    const kickoffPrompt = Boolean(document.querySelector(".fc-prompt:not(.fc-hidden)"));
    const kitChips = Array.from(document.querySelectorAll<HTMLElement>(".fc-bug .kit")).map((k) => getComputedStyle(k).backgroundColor);
    return {
      ev: ev ? {
        framesRendered: ev.framesRendered, mode: ev.mode, phase: ev.phase, half: ev.half, clock: ev.clock, venue: ev.venue,
        score: ev.score, kicks: ev.kicks, shotsOn: ev.shotsOn, saves: ev.saves, corners: ev.corners, paused: ev.paused,
        ball: ev.ball?.position, ballMode: ev.ball?.mode, camera: ev.camera, cameraMode: ev.cameraMode,
        shootout: ev.shootout, athletes: (ev.athletes ?? []).map((a: any) => ({ id: a.id, x: a.x, z: a.z, shirt: a.kit?.body })),
        hudValues: ev.hud?.values?.length ?? null, touch: ev.touch ?? null, look: ev.look, sky: ev.sky ?? null
      } : null,
      diag, net, netErr, stick, touchButtons, pausePanel, kickoffPrompt, kitChips
    };
  });
}

/** Athletes whose (x, 1 m, z) projects inside the viewport, from the published camera pose. */
function athletesInView(info: Awaited<ReturnType<typeof pageInfo>>, width: number, height: number): number | null {
  const ev = info.ev;
  if (!ev?.camera) return null;
  const [ex, ey, ez] = ev.camera.position as number[];
  const [tx, ty, tz] = ev.camera.target as number[];
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = f x up(0,1,0), up = r x f
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const tanV = Math.tan((ev.camera.fov * Math.PI) / 360);
  const tanH = tanV * (width / height);
  let n = 0;
  for (const a of ev.athletes) {
    const dx = a.x - ex, dy = 1 - ey, dz = a.z - ez;
    const depth = dx * fx + dy * fy + dz * fz;
    if (depth <= 0.1) continue;
    const sx = (dx * rx + dz * rz) / depth / tanH;
    const sy = (dx * ux + dy * uy + dz * uz) / depth / tanV;
    if (Math.abs(sx) <= 1 && Math.abs(sy) <= 1) n++;
  }
  return n;
}

async function waitFrames(page: Page, count = 2, timeout = 120_000): Promise<void> {
  const start = await page.evaluate(() => (window as any).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);
  await page.waitForFunction(([s, c]) => ((window as any).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= s + c, [start, count] as const, { timeout, polling: 500 }).catch(() => log(`FC_WARN frame wait timed out after ${timeout} ms`));
}

async function step(page: Page, n: number): Promise<string | null> {
  return page.evaluate(([h, k]) => {
    try { (window as any)[h].step(k); return null; } catch (e) { return String((e as Error)?.message ?? e).slice(0, 200); }
  }, [HOOK, n] as const);
}

async function grab(page: Page, target: string, id: string, size: { width: number; height: number }, opts: { full?: boolean; extra?: Record<string, unknown> } = {}): Promise<void> {
  const handle = opts.full ? null : await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
  if (handle) await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  const info = await pageInfo(page);
  log(`FC_META ${JSON.stringify({ target, id, full: !!opts.full, viewport: size, ...stats, inView: athletesInView(info, size.width, size.height), ...info, ...(opts.extra ?? {}) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function open(browser: Browser, target: string, query: string, size: { width: number; height: number }, phone = false): Promise<Page> {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`FC_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|fonts\//.test(m.text())) log(`FC_CONSOLE ${target} ${m.text().slice(0, 200)}`); });
  await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/index.html${query}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 600_000, polling: 1000 });
  await waitFrames(page, 2);
  return page;
}

const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };

for (const [target, size, phone] of [["desktop", DESKTOP, false], ["phone", PHONE, true]] as const) {
  test(`fc-${target}-play`, async ({ browser }) => {
    const page = await open(browser, `${target}-play`, "?autoplay=1&venue=munich", size, phone);
    await grab(page, `${target}-play`, "a-ready", size);
    for (const [label, steps] of [["b-20s", 1200], ["c-50s", 1800], ["d-80s", 1800]] as const) {
      const err = await step(page, steps);
      await waitFrames(page, 2);
      await grab(page, `${target}-play`, label, size, { extra: { stepErr: err } });
    }
    await grab(page, `${target}-play`, "e-hud", size, { full: true });
    await page.context().close();
  });
}

test("fc-phone-quick-touch", async ({ browser }) => {
  // User match on a touch phone: the virtual stick, the switch/pause buttons and the kickoff prompt.
  const page = await open(browser, "phone-quick", "?venue=munich", PHONE, true);
  await page.touchscreen.tap(195, 420).catch(() => undefined);
  await waitFrames(page, 2);
  await grab(page, "phone-quick", "a-kickoff", PHONE, { full: true });
  await step(page, 600);
  await waitFrames(page, 2);
  await grab(page, "phone-quick", "b-live", PHONE, { full: true });
  await page.context().close();
});

test("fc-shootout-goalmouth", async ({ browser }) => {
  const page = await open(browser, "shootout", "?mode=shootout&venue=munich", DESKTOP);
  await step(page, 70);
  await waitFrames(page, 2);
  await grab(page, "shootout", "a-aim", DESKTOP);
  await page.keyboard.down("Space");
  await step(page, 40);
  await page.keyboard.up("Space");
  await waitFrames(page, 1);
  await step(page, 30);
  await waitFrames(page, 2);
  await grab(page, "shootout", "b-kick", DESKTOP);
  await step(page, 240);
  await waitFrames(page, 2);
  await grab(page, "shootout", "c-ledger", DESKTOP, { full: true });
  await page.context().close();
});

test("fc-touch-lab", async ({ browser }) => {
  // FC-01: the lab player chases, dribbles at goal and the ball goes out or in; the base build threw here every frame.
  const page = await open(browser, "touchlab", "?mode=touch&venue=munich", DESKTOP);
  const trace: unknown[] = [];
  for (let i = 0; i < 30; i++) {
    const err = await step(page, 60);
    const st = await page.evaluate((h) => { const s = (window as any)[h].state(); return { phase: s.phase, ball: [+s.ball.x.toFixed(1), +s.ball.z.toFixed(1)], mode: s.ball.mode }; }, HOOK);
    trace.push({ t: i + 1, err, ...st });
  }
  log(`FC_TRACE touchlab ${JSON.stringify(trace)}`);
  await waitFrames(page, 2);
  await grab(page, "touchlab", "a-after-30s", DESKTOP, { extra: { errors: trace.filter((t: any) => t.err).length } });
  await page.context().close();
});

for (const venue of ["favela", "lagos", "uyuni"] as const) {
  test(`fc-venue-${venue}`, async ({ browser }) => {
    const page = await open(browser, `venue-${venue}`, `?autoplay=1&venue=${venue}`, DESKTOP);
    await step(page, 1500);
    await waitFrames(page, 2);
    await grab(page, `venue-${venue}`, "a-25s", DESKTOP);
    await step(page, 1500);
    await waitFrames(page, 2);
    await grab(page, `venue-${venue}`, "b-50s", DESKTOP);
    await page.context().close();
  });
}

test("fc-pause", async ({ browser }) => {
  const page = await open(browser, "pause", "?venue=munich", DESKTOP);
  await page.keyboard.down("KeyD");
  await waitFrames(page, 2);
  await page.keyboard.up("KeyD");
  await step(page, 300);
  await page.keyboard.press("KeyP");
  await waitFrames(page, 3);
  await page.waitForTimeout(2000);
  const before = await page.evaluate((h) => (window as any)[h].state().clock, HOOK);
  await waitFrames(page, 3);
  const after = await page.evaluate((h) => (window as any)[h].state().clock, HOOK);
  await grab(page, "pause", "a-paused", DESKTOP, { full: true, extra: { clockBefore: before, clockAfter: after, goalX: PITCH_HX } });
  await page.context().close();
});
