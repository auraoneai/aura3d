import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Thermal Drift (`heatsink`) audit-fix capture. Remote only (tools/remote-acr/run.sh, software WebGL2): the ACR run has no
 * artifact egress, so everything goes to the log, the pattern of tests/browser/game-luma-capture.spec.ts:
 *   HS_META <json>                       luma stats (canvas only) + game probes per shot
 *   HS_PROBE <json>                      one behaviour probe (Space re-click, blur, touch, reduced motion)
 *   GL_JPG  <target> <shot> <i>/<n> <b64> full-page JPEG (HUD included), chunked
 * The same file runs on the unmodified base and on the lane branch. Every probe is defensive: a hook the base lacks logs null
 * instead of failing. The first shot after ready is a title frame and is not used for steady-state luma: judge the later ones.
 * Select tests with --grep: @base (desktop, phone, card), @lane (render-path pairs), @calib (exposure). No `|` in SPECS: the ACR task shell splits on it.
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true'";
const ROUTE = "/apps/showcase-heatsink/index.html";

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
    // Upper and lower halves separately: the sky and horizon against the road.
    let top = 0, bottom = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
      if ((i / 4) < n / 2) top += y; else bottom += y;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      mean: +(sum / n).toFixed(2), topMean: +(top / (n / 2)).toFixed(2), bottomMean: +(bottom / (n / 2)).toFixed(2),
      p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4)
    };
  }, png.toString("base64"));
}

/** Game state as the page exposes it. Works on the base (fewer hooks) and on the lane branch. */
async function probe(page: Page) {
  return page.evaluate(() => {
    type V3 = [number, number, number];
    const w = window as unknown as Record<string, any>;
    const api = w.__AURA3D_SHOWCASE_HEATSINK__;
    const app = api?.app;
    const text = (id: string) => document.getElementById(id)?.textContent ?? null;
    const shown = (el: Element | null) => {
      if (!el) return null;
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el as HTMLElement);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, visibility: cs.visibility, opacity: cs.opacity };
    };
    const hud = {
      pos: text("h-pos"), posOf: text("h-posof"), lap: text("h-lap"), time: text("h-time"), best: text("h-best"), ko: text("h-td"),
      item: text("h-item"), mode: text("h-mode"), elim: text("h-elim-time"), ghost: text("h-ghost-delta"), msg: text("msg-text"),
      posChip: shown(document.querySelector(".pos-chip")), incoming: shown(document.getElementById("incoming")),
      results: shown(document.getElementById("results")), resultsText: document.getElementById("results")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 300) ?? null
    };
    let state: unknown = null;
    try { state = api?.getState?.() ?? null; } catch (e) { state = { error: String(e) }; }
    const canvas = document.querySelector("#app canvas") as HTMLCanvasElement | null;
    const W = canvas?.clientWidth ?? innerWidth, H = canvas?.clientHeight ?? innerHeight;
    const crect = canvas?.getBoundingClientRect();
    let pose: { position: V3; target: V3; up: V3; fov: number } = { position: [0, 4.2, 9.5], target: [0, 1.8, -18], up: [0, 1, 0], fov: 68 };
    let poseSource = "authored";
    try { const p = app?.camera?.presented?.(); if (p?.position && p?.target) { pose = { position: p.position, target: p.target, up: p.up ?? [0, 1, 0], fov: p.fov ?? 68 }; poseSource = "presented"; } } catch { /* base */ }
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const f = norm(sub(pose.target, pose.position));
    const r = norm(cross(f, pose.up));
    const u = cross(r, f);
    const t = Math.tan((pose.fov * Math.PI) / 360);
    const project = (p: V3) => {
      const v = sub(p, pose.position);
      const z = dot(v, f);
      if (z <= 0.05) return null;
      return { x: (crect?.x ?? 0) + ((dot(v, r) / (z * t * (W / H)) + 1) / 2) * W, y: (crect?.y ?? 0) + ((1 - dot(v, u) / (z * t)) / 2) * H, depth: z };
    };
    const node = (id: string) => { try { return app?.nodes?.get?.(id) ?? app?.nodes?.require?.(id); } catch { return undefined; } };
    const ids = ["orion", "volt", "bastion", "spectre", "razor", "nighthawk", "wraith"];
    const player = (state as { drone?: string } | null)?.drone ?? "orion";
    const drones = ids.map((id) => {
      const h = node(`drone-${id}`);
      if (!h) return { id, missing: true };
      const pos = h.position as V3;
      const vis = h.visible !== false && pos[1] > -50;
      const scr = vis ? project([pos[0], pos[1] + 0.5, pos[2]]) : null;
      return { id, player: id === player, visible: vis, pos: pos.map((v) => +v.toFixed(2)), screen: scr ? { x: Math.round(scr.x), y: Math.round(scr.y) } : null };
    });
    const lockEl = document.getElementById("lock");
    let lock: Record<string, unknown> | null = null;
    if (lockEl) {
      const lr = lockEl.getBoundingClientRect();
      const visible = getComputedStyle(lockEl).display !== "none" && lr.width > 0;
      const cx = lr.x + lr.width / 2, cy = lr.y + lr.height / 2;
      let nearest: { id: string; px: number } | null = null;
      for (const d of drones) {
        const s = (d as { screen?: { x: number; y: number } | null }).screen;
        if (!s || (d as { player?: boolean }).player) continue;
        const px = Math.hypot(s.x - cx, s.y - cy);
        if (!nearest || px < nearest.px) nearest = { id: d.id, px: Math.round(px) };
      }
      lock = { visible, cx: Math.round(cx), cy: Math.round(cy), label: text("lock-label"), offscreen: lockEl.classList.contains("offscreen"), nearestRival: nearest };
    }
    // Scenery: hidden while still in front of the camera plane is the C4 defect.
    const propIds = ["prop-gantry-start", "prop-arch-a", "prop-arch-b", "prop-overpass", "prop-tunnel-a", "prop-tunnel-b", "prop-statue", "prop-tower-l-left", "prop-tower-l-right", "prop-tower-t-left", "prop-tower-x-right", "prop-billboard-left", "prop-billboard-right", "prop-lava-fall", "prop-water-emitter", "prop-barrier-left", "prop-checkpoint-ring", "prop-boost-pad", "prop-cooling-canister", "prop-shield-pickup", "prop-explosive-barrel"];
    const camZ = pose.position[2];
    let hiddenInFront = 0, visibleCount = 0;
    const hiddenList: string[] = [];
    for (const id of propIds) {
      const h = node(id);
      if (!h) continue;
      const pos = h.position as V3;
      const hidden = h.visible === false || pos[1] < -100;
      if (!hidden) visibleCount++;
      if (hidden && pos[2] < camZ && pos[2] > -60) { hiddenInFront++; hiddenList.push(`${id}@${pos[2].toFixed(1)}`); }
    }
    const fixed = (id: string) => { const h = node(id); return h ? { visible: h.visible !== false, pos: (h.position as V3).map((v) => +v.toFixed(2)) } : null; };
    let diag: unknown = null;
    try { const a = w.__AURA3D_LIVE_APPS__?.all?.()[0]; const dg = a?.diagnostics?.(); diag = { drawCalls: dg?.drawCalls ?? null, renderPath: dg?.renderPath?.path ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null, warnings: (dg?.warnings ?? []).slice(0, 6) }; } catch (e) { diag = { error: String(e) }; }
    const boot = document.getElementById("boot");
    const touch = document.getElementById("touch");
    const touchButtons = touch ? [...touch.querySelectorAll("button, [data-touch]")].map((b) => ({ id: (b as HTMLElement).dataset.touch ?? b.id, ...shown(b) })) : [];
    const scripts = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) => e.initiatorType === "script" || /\.(m?js|ts)(\?|$)/.test(e.name));
    const scriptBytes = scripts.reduce((sum, e) => sum + (e.decodedBodySize || 0), 0);
    const largestScript = scripts.reduce<{ name: string; bytes: number } | null>((best, e) => (!best || e.decodedBodySize > best.bytes ? { name: e.name.replace(/^https?:\/\/[^/]+/, ""), bytes: e.decodedBodySize } : best), null);
    return {
      scriptBytes, scriptCount: scripts.length, largestScript,
      hud, state, poseSource, pose, drones, lock, scenery: { hiddenInFront, visibleCount, hiddenList },
      mine: fixed("weapon-mine-active"), emitter: fixed("weapon-shockwave-emitter"), diag,
      boot: boot ? { hidden: boot.hidden, ariaHidden: boot.getAttribute("aria-hidden"), className: boot.className } : null,
      touch: touch ? { box: shown(touch), buttons: touchButtons } : null,
      autopilot: shown(document.getElementById("h-autopilot")),
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio
    };
  });
}

async function fps(page: Page, ms = 8000): Promise<number> {
  return page.evaluate((dur) => new Promise<number>((resolve) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < dur) requestAnimationFrame(tick); else resolve(+(frames / ((performance.now() - t0) / 1000)).toFixed(3)); };
    requestAnimationFrame(tick);
  }), ms);
}

async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const full = await page.screenshot({ type: "jpeg", quality: 82 });
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: "png" });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`HS_META ${JSON.stringify({ target, id, ...extra, luma: stats, probe: await probe(page) })}`);
  const b64 = full.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Lane-branch QA hook: advance the fixed-step sim by `seconds` (no-op on the base, which has no hook). */
async function advance(page: Page, seconds: number): Promise<boolean> {
  return page.evaluate((s) => {
    const qa = (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_HEATSINK__?.qa;
    if (!qa?.advance) return false;
    qa.advance(s);
    return true;
  }, seconds);
}

async function phase(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_HEATSINK__?.getState?.()?.phase ?? null);
}

async function open(page: Page, target: string, query: string): Promise<number> {
  page.on("pageerror", (e) => log(`HS_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`HS_CONSOLE ${target} ${m.type()} ${m.text().slice(0, 240)}`); });
  const assetRequests: string[] = [];
  page.on("request", (r) => { const u = r.url(); if (/src\/aura-assets|aura-assets-[\w-]+\.js/.test(u)) assetRequests.push(u.replace(/^https?:\/\/[^/]+/, "")); });
  page.on("response", (r) => { if (r.status() >= 400) log(`HS_BAD ${target} ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
  const t0 = Date.now();
  await page.goto(`${server.origin}${ROUTE}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 1000 });
  const readyMs = Date.now() - t0;
  log(`HS_PROBE ${JSON.stringify({ target, probe: "boot", readyMs, sharedCatalogRequests: assetRequests })}`);
  return readyMs;
}

let server: ExampleDevServer;

test.describe("heatsink audit-fix capture", () => {
  test.setTimeout(3_600_000);
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("@base @desk desktop", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const target = "1280";
    await open(page, target, "?autoplay=1");
    await page.waitForTimeout(3000);
    await grab(page, target, "01-title", { fps: await fps(page) });
    // Early: a few seconds into the race. The lane branch advances its sim through the QA hook; the base runs in real time.
    await advance(page, 6);
    await page.waitForTimeout(20_000);
    await grab(page, target, "02-early");
    // Action: hold fire, boost and steer for several presented frames.
    await page.evaluate(() => { const w = window as unknown as Record<string, any>; if (w.__AURA3D_SHOWCASE_HEATSINK__?.qa?.setAutopilot) w.__AURA3D_SHOWCASE_HEATSINK__.qa.setAutopilot(false); });
    await page.mouse.move(640, 400);
    await page.keyboard.down("Space");
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("ArrowRight");
    await advance(page, 1.2);
    await page.waitForTimeout(12_000);
    await grab(page, target, "03-action");
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("ShiftLeft");
    await page.keyboard.up("Space");
    await page.evaluate(() => { const w = window as unknown as Record<string, any>; if (w.__AURA3D_SHOWCASE_HEATSINK__?.qa?.setAutopilot) w.__AURA3D_SHOWCASE_HEATSINK__.qa.setAutopilot(true); });
    // Mid: steady state, later in the lap. Several shots so the judgement never rests on one frame.
    await advance(page, 24);
    await page.waitForTimeout(25_000);
    await grab(page, target, "04-mid");
    await page.waitForTimeout(25_000);
    await grab(page, target, "04-mid-b");

    // C5: does Space re-click the last clicked top-bar button?
    await page.evaluate(() => { const w = window as unknown as Record<string, any>; w.__elimClicks = 0; document.querySelector("[data-mode=\"elim\"]")?.addEventListener("click", () => { w.__elimClicks++; }); });
    await page.click("[data-mode=\"elim\"]");
    const focusedAfterClick = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.mode ?? document.activeElement?.tagName ?? null);
    for (let i = 0; i < 3; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(300); }
    log(`HS_PROBE ${JSON.stringify({ target, probe: "space-reclick", elimClicksAfterOneClickAndThreeSpaces: await page.evaluate(() => (window as unknown as Record<string, number>).__elimClicks), focusedAfterClick })}`);

    // Modes: pick another drone and elimination.
    await page.click("[data-drone=\"volt\"]");
    await page.click("[data-mode=\"elim\"]");
    await advance(page, 5);
    await page.waitForTimeout(15_000);
    await grab(page, target, "05-modes");

    // C14: keys held across a focus loss.
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(1500);
    log(`HS_PROBE ${JSON.stringify({ target, probe: "blur", input: await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_HEATSINK__?.getState?.()?.input ?? null) })}`);
    await page.keyboard.up("ArrowLeft");

    // C1: results. Race mode, then advance the sim until the race ends (lane branch only).
    await page.click("[data-mode=\"race\"]");
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      if (!(await advance(page, 10))) break;
      reached = (await phase(page)) === "results";
    }
    await page.waitForTimeout(12_000);
    await grab(page, target, reached ? "06-results" : "06-results-not-reached", { reached });
    if (reached) {
      // Restart from the results panel.
      await page.click("#results-restart");
      await page.waitForTimeout(8000);
      log(`HS_PROBE ${JSON.stringify({ target, probe: "restart", state: await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_HEATSINK__?.getState?.() ?? null) })}`);
    }
    await ctx.close();
  });

  test("@base @phone phone", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const target = "390";
    await open(page, target, "");
    await page.waitForTimeout(3000);
    await grab(page, target, "01-title", { fps: await fps(page) });
    // Tap to start (the lane branch shows a tap-to-start prompt that also unlocks audio).
    await page.touchscreen.tap(195, 600);
    await advance(page, 6);
    await page.waitForTimeout(20_000);
    await grab(page, target, "02-early");
    // Touch controls: hold FIRE and the right half of the steer pad with pointer events.
    const touchProbe = await page.evaluate(async () => {
      const w = window as unknown as Record<string, any>;
      const get = () => w.__AURA3D_SHOWCASE_HEATSINK__?.getState?.() ?? null;
      const fire = document.querySelector("[data-touch=\"fire\"]") as HTMLElement | null;
      const pad = document.querySelector("[data-touch=\"steer\"]") as HTMLElement | null;
      if (!fire || !pad) return { available: false };
      const at = (el: HTMLElement, fx: number, fy: number) => { const r = el.getBoundingClientRect(); return { clientX: r.x + r.width * fx, clientY: r.y + r.height * fy }; };
      fire.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 11, pointerType: "touch", bubbles: true, ...at(fire, 0.5, 0.5) }));
      pad.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 12, pointerType: "touch", bubbles: true, ...at(pad, 0.95, 0.5) }));
      await new Promise((r) => setTimeout(r, 400));
      const held = get()?.input ?? null;
      fire.dispatchEvent(new PointerEvent("pointerup", { pointerId: 11, pointerType: "touch", bubbles: true }));
      pad.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12, pointerType: "touch", bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      return { available: true, held, released: get()?.input ?? null };
    });
    log(`HS_PROBE ${JSON.stringify({ target, probe: "touch", ...touchProbe })}`);
    await page.evaluate(() => { const w = window as unknown as Record<string, any>; if (w.__AURA3D_SHOWCASE_HEATSINK__?.qa?.setAutopilot) w.__AURA3D_SHOWCASE_HEATSINK__.qa.setAutopilot(true); });
    await advance(page, 2);
    await page.waitForTimeout(12_000);
    await grab(page, target, "03-action");
    await advance(page, 24);
    await page.waitForTimeout(25_000);
    await grab(page, target, "04-mid");
    await page.waitForTimeout(25_000);
    await grab(page, target, "04-mid-b");
    log(`HS_PROBE ${JSON.stringify({ target, probe: "reduced-motion", matches: await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), state: await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_SHOWCASE_HEATSINK__?.getState?.()?.reducedMotion ?? null) })}`);
    await page.evaluate(() => (document.querySelector("[data-mode=\"trial\"]") as HTMLElement | null)?.click());
    await advance(page, 5);
    await page.waitForTimeout(15_000);
    await grab(page, target, "05-modes");
    await page.evaluate(() => (document.querySelector("[data-mode=\"race\"]") as HTMLElement | null)?.click());
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      if (!(await advance(page, 10))) break;
      reached = (await phase(page)) === "results";
    }
    await page.waitForTimeout(12_000);
    await grab(page, target, reached ? "06-results" : "06-results-not-reached", { reached });
    await ctx.close();
  });

  test("@base @card card", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await open(page, "card", "?autoplay=1");
    await advance(page, 30);
    await page.waitForTimeout(40_000);
    await grab(page, "card", "card-2x");
    await ctx.close();
  });

  /**
   * Lane branch only: render-path pairs at the same deterministic sim state (manual loop, same step count).
   * RP-05 fused bloom against `aura3d-render=production`; LIGHT-06 the look's AO on and off (`qaAo=off`).
   */
  test("@lane pairs", async ({ browser }) => {
    const variants = [
      { name: "default", query: "?qaManual=1&autoplay=1" },
      { name: "production-render", query: "?qaManual=1&autoplay=1&aura3d-render=production" },
      { name: "ao-off", query: "?qaManual=1&autoplay=1&qaAo=off" }
    ];
    for (const v of variants) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await open(page, `pair-${v.name}`, v.query);
      if (!(await advance(page, 12))) { log(`HS_PROBE ${JSON.stringify({ target: `pair-${v.name}`, probe: "pairs", skipped: "no qa hook" })}`); await ctx.close(); continue; }
      await page.waitForTimeout(30_000);
      await grab(page, `pair-${v.name}`, "steady-a");
      await page.waitForTimeout(20_000);
      await grab(page, `pair-${v.name}`, "steady-b");
      await ctx.close();
    }
  });

  /** Lane branch only: exposure calibration of the night look (`qaEv`), steady state at the same sim state. */
  test("@calib calib", async ({ browser }) => {
    const evs = (process.env.HS_EVS ?? "0,0.4,0.8").split(",");
    for (const ev of evs) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await open(page, `calib-${ev}`, `?qaManual=1&autoplay=1&qaEv=${ev}`);
      await advance(page, 12);
      await page.waitForTimeout(30_000);
      await grab(page, `calib-${ev}`, "steady-a");
      await page.waitForTimeout(20_000);
      await grab(page, `calib-${ev}`, "steady-b");
      await ctx.close();
    }
  });
});
