import { test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G18 (Gridlock Courier, drift-and-deliver-port).
 * Part 1 (`g18-*`): steady-state luma of the HDRI frame against the hemisphere
 * "sky-fill" intensity, for the LIGHT-05 retune (the engine now adds an authored hemisphere next to an environment).
 * Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   G18_META <json>                         luma stats (whole frame and top/middle/bottom thirds) + engine diagnostics
 *   G18_JPG  <target> <shot> <i>/<n> <b64>  canvas-only JPEG, chunked
 * The software-GL runner presents about one frame every 5 to 10 s and the HDRI lands after the first frame: judge the
 * last shot. Pattern copied from tests/browser/audit-fix/e2-lighting.spec.ts (lane E2) and game-luma-capture.spec.ts.
 */
const SETTLE_SECONDS = (process.env.G18_SETTLE ?? "45,90").split(",").map(Number);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Target { readonly name: string; readonly url: string; readonly rows: string }

const TARGETS: readonly Target[] = [
  { name: "g18-default", url: "/examples/drift-and-deliver-port/index.html", rows: "LIGHT-05 retune (shipped default)" },
  { name: "g18-sf000", url: "/examples/drift-and-deliver-port/index.html?skyfill=0", rows: "no hemisphere (the 4.5.0 frame)" },
  { name: "g18-sf060", url: "/examples/drift-and-deliver-port/index.html?skyfill=0.6", rows: "sweep" },
  { name: "g18-sf170", url: "/examples/drift-and-deliver-port/index.html?skyfill=1.7", rows: "authored 1.7 next to the HDRI" },
  { name: "g18-noenv", url: "/examples/drift-and-deliver-port/index.html?env=0", rows: "heal rung no-env (lights-only)" }
];
// Pick targets with `--grep=g18-<name>`.

const REPO_ROOT = process.cwd();
/** First existing `apps/<app>/public/<path>` for a root-relative asset path. */
function appPublicFile(path: string): string | undefined {
  const appsDir = join(REPO_ROOT, "apps");
  if (!existsSync(appsDir)) return undefined;
  for (const app of readdirSync(appsDir)) {
    const file = join(appsDir, app, "public", path);
    if (existsSync(file)) return file;
  }
  return undefined;
}

async function installAssetFallback(page: Page): Promise<void> {
  await page.route(/\/(aura-assets|fonts)\//, async (route) => {
    const response = await route.fetch();
    if (response.status() !== 404) return route.fulfill({ response });
    const path = new URL(route.request().url()).pathname.replace(/^\//, "");
    const file = appPublicFile(path);
    if (!file) return route.fulfill({ response });
    const type = file.endsWith(".glb") ? "model/gltf-binary" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
    return route.fulfill({ status: 200, body: readFileSync(file), headers: { "content-type": type } });
  });
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
    const third = [0, 0, 0];
    const thirdN = [0, 0, 0];
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      const row = Math.floor(i / 4 / c.width);
      const band = Math.min(2, Math.floor((row * 3) / c.height));
      third[band]! += y; thirdN[band]! += 1;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return {
      mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4),
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
      const post = dg?.post;
      const warnings = (dg?.warnings ?? []).filter((w: unknown) => /hemisphere|contact|ssao|environment|look fill/i.test(String(w))).slice(0, 6);
      return {
        app: true,
        renderPath: dg?.renderPath?.path ?? null,
        drawCalls: dg?.drawCalls ?? null,
        post: post ? { pipeline: post.pipeline, requested: post.requestedPasses, submitted: post.submittedPasses, dropped: post.droppedPasses, missing: post.missingInputs, stagesRan: post.stagesRan ?? null, skipped: (post.skipped ?? []).slice(0, 8) } : null,
        warnings
      };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function grab(page: Page, target: Target, id: string, extra: Record<string, unknown>): Promise<void> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  const stats = await lumaStats(page, png);
  log(`G18_META ${JSON.stringify({ target: target.name, rows: target.rows, id, ...extra, ...stats, info: await engineInfo(page) })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`G18_JPG ${target.name} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("g18 drift-and-deliver-port sky-fill capture", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(`${target.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`G18_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`G18_CONSOLE ${target.name} ${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`G18_HTTP ${target.name} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      page.on("requestfailed", (r) => log(`G18_REQFAIL ${target.name} ${r.url().replace(server.origin, "").slice(0, 200)} ${r.failure()?.errorText ?? ""}`));
      await installAssetFallback(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(READY, undefined, { timeout: 360_000, polling: 500 });
      } catch {
        const state = await page.evaluate(() => ({
          title: document.title,
          ready: document.body?.dataset.aura3dReady ?? null,
          apps: (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): unknown[] } }).__AURA3D_LIVE_APPS__?.all().length ?? null,
          canvases: document.querySelectorAll("canvas").length,
          text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 200)
        })).catch((e) => ({ evalError: String(e) }));
        log(`G18_ERR ${target.name} not-ready ${JSON.stringify(state)}`);
      }
      const loaded = Date.now();
      for (const sec of SETTLE_SECONDS) {
        const wait = sec * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        await grab(page, target, `settle-${sec}s`, { sinceReadyMs: Date.now() - loaded });
      }
      log(`G18_DONE ${target.name}`);
    });
  }
});

/* ------------------------------------------------------------------ part 2: gameplay rows (`g18x-*`) */
/*
 * One test per state group. Every probe tolerates a missing hook so the same spec runs on the base build (BEFORE)
 * and on the lane branch (AFTER). Output:
 *   G18X <json>                                     probe results
 *   G18_META / G18_JPG                              as above (canvas-only luma + JPEG); `-ui` ids keep the HUD
 */
const HOOK = "__AURA_DRIFT_AND_DELIVER__";
const LAB = "/examples/drift-and-deliver-port/index.html";
const probe = (target: string, data: Record<string, unknown>): void => log(`G18X ${JSON.stringify({ target, ...data })}`);

async function grabUi(page: Page, target: string, id: string): Promise<void> {
  const jpg = await page.screenshot({ type: "jpeg", quality: 80 });
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`G18_JPG ${target} ${id}-ui ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function openPage(page: Page, url: string, target: string): Promise<number> {
  page.on("pageerror", (e) => log(`G18_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`G18_CONSOLE ${target} ${m.type()} ${m.text().slice(0, 240)}`); });
  await installAssetFallback(page);
  const t0 = Date.now();
  await page.goto(`${server2!.origin}${url}`, { waitUntil: "domcontentloaded" });
  return t0;
}

async function waitHook(page: Page, what: "ready" | "start", timeout = 600_000): Promise<boolean> {
  try {
    await page.waitForFunction(({ hook, what }) => {
      const a = (window as unknown as Record<string, any>)[hook];
      if (what === "start") return Boolean(document.getElementById("start") && !(document.getElementById("start") as HTMLButtonElement).disabled);
      return Boolean(a && a.ready && a.ready());
    }, { hook: HOOK, what }, { timeout, polling: 250 });
    return true;
  } catch { return false; }
}

/** Runs `body(api)` in the page; returns its JSON or an error string. */
async function call<T = unknown>(page: Page, body: string): Promise<T | { error: string }> {
  try {
    return await page.evaluate(({ hook, body }) => {
      const api = (window as unknown as Record<string, any>)[hook];
      // eslint-disable-next-line no-new-func
      return JSON.parse(JSON.stringify(new Function("api", body)(api) ?? null));
    }, { hook: HOOK, body }) as T;
  } catch (e) { return { error: String(e).slice(0, 300) }; }
}

let server2: ExampleDevServer | undefined;

test.describe("g18 gameplay rows", () => {
  test.setTimeout(2_400_000);
  test.beforeAll(async () => { server2 = await startExampleDevServer(); });
  test.afterAll(async () => { await server2?.close(); });

  test("g18x-splash-1280", async ({ page }) => {
    const target = "g18x-splash-1280";
    await page.setViewportSize({ width: 1280, height: 720 });
    const t0 = await openPage(page, LAB, target);
    const started = await waitHook(page, "start");
    const startMs = Date.now() - t0;
    const atStart = await call(page, `const d = api.diagnostics?.(); return { env: d?.renderer?.environment?.hdriStatus ?? null, ibl: d?.renderer?.environment?.iblPixelBacked ?? null, focused: document.activeElement?.id ?? null, envStatus: !document.getElementById("env-status")?.classList.contains("hidden") };`);
    const settled = await waitHook(page, "ready");
    const readyMs = Date.now() - t0;
    const atReady = await call(page, `const d = api.diagnostics?.(); return { env: d?.renderer?.environment?.hdriStatus ?? null, ibl: d?.renderer?.environment?.iblPixelBacked ?? null, warm: api.state().warm, renderPath: d?.renderPath ?? null, drawCalls: d?.drawCalls ?? null, degradations: (d?.degradations ?? []).map((x) => x.code ?? String(x)).slice(0, 8), heal: (() => { try { return localStorage.getItem("drift-heal-stage") ?? sessionStorage.getItem("drift-heal-stage"); } catch { return "n/a"; } })() };`);
    probe(target, { row: "L2", started, startMs, atStart, settled, readyMs, atReady });
    // the HDRI timeline (why environmentReady stays false on software GL)
    const timeline: unknown[] = [];
    for (const sec of [60, 90, 120]) {
      const wait = sec * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      timeline.push({ sec, ...(await call(page, `const d = api.diagnostics?.(); return { env: d?.renderer?.environment?.hdriStatus ?? null, ibl: d?.renderer?.environment?.iblPixelBacked ?? null, evidence: String(d?.renderer?.environment?.evidence ?? "").slice(0, 200) };`) as object) });
    }
    probe(target, { row: "L2-env", timeline });
    await grab(page, { name: target, url: LAB, rows: "splash steady state" }, "splash-120s", {});
    await grabUi(page, target, "splash-120s");
    log(`G18_DONE ${target}`);
  });

  test("g18x-play-1280", async ({ page }) => {
    const target = "g18x-play-1280";
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPage(page, `${LAB}?manual=1&autostart=1`, target);
    probe(target, { ready: await waitHook(page, "ready") });
    const t = { name: target, url: LAB, rows: "gameplay" };
    // drive, then drift (the inventory states)
    probe(target, { row: "drive", s: await call(page, `api.reset(); api.teleport(30, -300, 0); api.stepFrames(240, { w: true }); const s = api.state(); return { speedKmh: s.speedKmh, z: s.state[1], diag: { drawCalls: api.diagnostics()?.drawCalls, renderPath: api.diagnostics()?.renderPath?.path, bloomFusion: api.diagnostics()?.renderPath?.bloomFusion, quality: api.diagnostics()?.renderPath?.quality } };`) });
    await grab(page, t, "drive", {});
    await grabUi(page, target, "drive");
    // L1: the legacy globals follow the live state
    probe(target, { row: "L1", s: await call(page, `const g = window.__getGameState(); const s = api.state(); return { legacyPhase: g.phase, phase: s.phase, legacyZ: window.__gameEntities.player.position.z, z: s.state[1], legacySpeed: g.speed, speed: s.state[3] };`) });
    // C6: traffic overlap census over 600 more steps (10 s)
    probe(target, { row: "C6", s: await call(page, `if (!api.traffic) return { hook: false }; let worst = 0, steps = 0; for (let k = 0; k < 20; k++) { api.stepFrames(30, { w: true }); const t = api.traffic(); let n = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i], b = t[j]; const ax = a.horiz ? 2.2 : 1, az = a.horiz ? 1 : 2.2, bx = b.horiz ? 2.2 : 1, bz = b.horiz ? 1 : 2.2; if (Math.abs(a.x - b.x) < ax + bx && Math.abs(a.z - b.z) < az + bz) n++; } if (n) steps++; worst = Math.max(worst, n); } return { samples: 20, samplesWithOverlap: steps, worstPairs: worst, meanV: api.traffic().reduce((s, c) => s + c.v, 0) / api.traffic().length };`) });
    probe(target, { row: "drift", s: await call(page, `api.reset(); api.teleport(30, -300, 0); api.stepFrames(200, { w: true }); api.stepFrames(30, { w: true, d: true, space: true }); const s = api.state(); return { drifting: s.state[5], drift: s.shift?.drift ?? null };`) });
    await grab(page, t, "drift", {});
    await grabUi(page, target, "drift");
    // C5: colliders registered; C14 delivery + camera clearance
    probe(target, { row: "C5", s: await call(page, `return api.counts();`) });
    probe(target, { row: "C14-delivery", s: await call(page, `if (!api.toDropoff) return { hook: false }; api.reset(); api.stepFrames(1, {}); const job = api.state().shift.job; api.teleport(job.x, job.z - 40, 0); api.stepFrames(1, {}); return { job, before: api.state().shift.deliveries };`) });
    await grab(page, t, "dropoff-ahead", {});
    await grabUi(page, target, "dropoff-ahead");
    probe(target, { row: "C14-delivered", s: await call(page, `if (!api.toDropoff) return { hook: false }; const s0 = api.state().score; api.toDropoff(); api.stepFrames(2, {}); const s = api.state(); return { deliveries: s.shift.deliveries, scoreGain: s.score - s0, nextJob: s.shift.job };`) });
    probe(target, { row: "C14-camera", s: await call(page, `if (!api.camera) return { hook: false }; const out = []; for (const [x, z, h] of [[38, -120, -Math.PI / 2], [22, -120, Math.PI / 2], [38.2, -150, -Math.PI / 2]]) { api.teleport(x, z, h); api.stepFrames(20, {}); out.push(api.camera()); } return out;`) });
    await grab(page, t, "camera-wall", {});
    // results and restart (C3)
    probe(target, { row: "C3", s: await call(page, `if (!api.endShift) return { hook: false, phases: ["splash", "playing", "paused"] }; api.reset(); api.stepFrames(120, { w: true }); const s = api.endShift(); return { phase: s.phase, visible: !document.getElementById("results").classList.contains("hidden"), title: document.getElementById("r-title").textContent, score: document.getElementById("r-score").textContent, best: document.getElementById("r-best").textContent, focused: document.activeElement?.id };`) });
    await page.waitForTimeout(400);
    await grabUi(page, target, "results");
    probe(target, { row: "C3-restart", s: await call(page, `if (!api.restart) return { hook: false }; const s = api.restart(); return { phase: s.phase, score: s.score, collected: s.collected, timeLeft: s.shift.timeLeft, hidden: document.getElementById("results").classList.contains("hidden") };`) });
    // pause overlay (C11 focus)
    probe(target, { row: "pause", s: await call(page, `window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP", key: "p" })); return { phase: api.state().phase, focused: document.activeElement?.id };`) });
    await grabUi(page, target, "paused");
    log(`G18_DONE ${target}`);
  });

  test("g18x-shift-end", async ({ page }) => {
    const target = "g18x-shift-end";
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPage(page, `${LAB}?manual=1&autostart=1&shift=6`, target);
    probe(target, { ready: await waitHook(page, "ready") });
    // a real six-second shift, driven to its end by stepping (no endShift shortcut)
    probe(target, { row: "C3-timer", s: await call(page, `for (let i = 0; i < 9; i++) api.stepFrames(60, { w: true }); const s = api.state(); return { phase: s.phase, shift: s.shift ?? null, results: !(document.getElementById("results")?.classList.contains("hidden") ?? true) };`) });
    await grabUi(page, target, "results-timer");
    log(`G18_DONE ${target}`);
  });

  test("g18x-play-390", async ({ browser }) => {
    const target = "g18x-play-390";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await openPage(page, `${LAB}?manual=1`, target);
    probe(target, { ready: await waitHook(page, "ready") });
    probe(target, { row: "C1-ui", s: await call(page, `const t = document.getElementById("touch"); const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { touchLayer: Boolean(t), visible: t ? !t.hidden : false, bodyTouch: document.body.classList.contains("touch"), gas: r("t-gas"), brake: r("t-brake"), drift: r("t-drift"), nitro: r("t-nitro"), steer: r("t-steer"), pause: r("t-pause"), mute: r("t-mute"), speed: r("speedbox"), minimap: r("minimap"), credit: r("aura-credit"), hint: document.querySelector(".touch-only") ? getComputedStyle(document.querySelector(".touch-only")).display : null };`) });
    await grabUi(page, target, "title");
    // hold GAS with a pointer, step the sim with the held keys, release
    await page.evaluate(() => { document.getElementById("start")?.click(); });
    const gas = await page.$("#t-gas");
    let touchDrive: unknown = { hook: false };
    if (gas) {
      const box = (await gas.boundingBox())!;
      await page.evaluate(({ x, y }) => { const el = document.getElementById("t-gas")!; el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y })); }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      const steer = (await (await page.$("#t-steer"))!.boundingBox())!;
      await page.evaluate(({ x, y }) => { const el = document.getElementById("t-steer")!; el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 8, pointerType: "touch", clientX: x, clientY: y })); el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: 8, pointerType: "touch", clientX: x + 40, clientY: y })); }, { x: steer.x + steer.width / 2, y: steer.y + steer.height / 2 });
      touchDrive = await call(page, `const h0 = api.state().state[2]; api.stepFrames(150); const s = api.state(); return { speedKmh: s.speedKmh, headingChange: s.state[2] - h0, keys: { ...window.__game.keys } };`);
      await grab(page, { name: target, url: LAB, rows: "touch drive" }, "touch-drive", {});
      await grabUi(page, target, "touch-drive");
      await page.evaluate(() => { for (const [id, pid] of [["t-gas", 7], ["t-steer", 8]] as const) document.getElementById(id)!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: pid, pointerType: "touch" })); });
    }
    probe(target, { row: "C1-drive", s: touchDrive, released: await call(page, `return { ...window.__game.keys };`) });
    await ctx.close();
    log(`G18_DONE ${target}`);
  });

  test("g18x-resize", async ({ page }) => {
    const target = "g18x-resize";
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPage(page, `${LAB}?manual=1&autostart=1`, target);
    probe(target, { ready: await waitHook(page, "ready") });
    const size = () => page.evaluate(() => { const c = document.getElementById("world") as HTMLCanvasElement; return { css: [c.clientWidth, c.clientHeight], backing: [c.width, c.height], win: [innerWidth, innerHeight], dpr: devicePixelRatio }; });
    const before = await size();
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(1500);
    await call(page, `api.stepFrames(1, {}); return null;`);
    await page.waitForTimeout(500);
    const after = await size();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1500);
    await call(page, `api.stepFrames(1, {}); return null;`);
    await page.waitForTimeout(500);
    const portrait = await size();
    probe(target, { row: "C2", before, after, portrait });
    await grab(page, { name: target, url: LAB, rows: "resized to 390x844" }, "portrait", {});
    log(`G18_DONE ${target}`);
  });

  test("g18x-audio", async ({ page }) => {
    const target = "g18x-audio";
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPage(page, LAB, target);
    probe(target, { start: await waitHook(page, "start") });
    await page.click("#start");
    await call(page, `api.applyInput({ w: true, space: true }); return null;`);
    await page.waitForTimeout(12_000);
    const playing = await call(page, `return { phase: api.state().phase, beds: api.audioBeds ? api.audioBeds() : "no-hook" };`);
    await page.keyboard.press("p");
    await page.waitForTimeout(800);
    const paused = await call(page, `return { phase: api.state().phase, beds: api.audioBeds ? api.audioBeds() : "no-hook" };`);
    await page.keyboard.press("p");
    await page.waitForTimeout(6000);
    const resumed = await call(page, `return { phase: api.state().phase, beds: api.audioBeds ? api.audioBeds() : "no-hook" };`);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(800);
    const hidden = await call(page, `return { phase: api.state().phase, beds: api.audioBeds ? api.audioBeds() : "no-hook" };`);
    probe(target, { row: "C4", playing, paused, resumed, hidden });
    log(`G18_DONE ${target}`);
  });

  test("g18x-ab", async ({ browser }) => {
    const target = "g18x-ab";
    const shots: Buffer[] = [];
    const meta: unknown[] = [];
    for (const q of ["", "&aura3d-render=production"]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await openPage(page, `${LAB}?manual=1&autostart=1${q}`, target);
      const ready = await waitHook(page, "ready");
      const info = await call(page, `api.reset(); api.teleport(30, -300, 0); api.stepFrames(1, {}); return api.settle ? null : null;`);
      await page.evaluate((hook) => (window as any)[hook].settle?.(), HOOK).catch(() => null);
      await call(page, `api.stepFrames(1, {}); return null;`);
      await page.waitForTimeout(1500);
      const d = await call(page, `const d = api.diagnostics(); return { renderPath: d?.renderPath, drawCalls: d?.drawCalls };`);
      meta.push({ q, ready, info, d });
      const handle = await page.addStyleTag({ content: CANVAS_ONLY });
      await page.waitForTimeout(250);
      shots.push(await page.screenshot({ type: "png" }));
      await handle.evaluate((el) => el.remove());
      await grab(page, { name: target, url: LAB, rows: q || "auto" }, q ? "production" : "auto", {});
      if (shots.length === 2) {
        const diff = await page.evaluate(async ([a, b]) => {
          const load = async (b64: string) => { const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const g = c.getContext("2d")!; g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
          const A = await load(a!), B = await load(b!);
          let sum = 0, max = 0, over1 = 0, n = 0;
          for (let i = 0; i < A.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(A[i + k]! - B[i + k]!); sum += d; if (d > max) max = d; if (d > 1) over1++; n++; }
          return { meanAbs: +(sum / n).toFixed(3), max, fracOver1: +(over1 / n).toFixed(4) };
        }, [shots[0]!.toString("base64"), shots[1]!.toString("base64")]);
        probe(target, { row: "C8/RP-05", meta, diff });
      }
      await ctx.close();
    }
    log(`G18_DONE ${target}`);
  });
});
