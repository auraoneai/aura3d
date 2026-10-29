import { expect, test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Shadowstep Gauntlet (ninja-runner-port) audit-fix captures and behaviour checks, lane G20 of
 * docs/audits/execution-plan.md. Remote only (tools/remote-acr/run.sh); never local Playwright. The run has no artifact
 * egress, so everything goes to the log:
 *   GL_META <json>                       luma stats, HUD rects and engine diagnostics per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64> JPEG frame, chunked (`page` = full page with HUD, `canvas` = 3D only)
 *   G20_CHECK <json>                     behaviour check results
 * Select one test per run with `--grep=<name>` in SPECS; each test boots the live app page once per variant. The software-GL
 * runner draws one frame every few seconds and the baked environment probe lands after the first frames, so every test waits
 * WARMUP_MS after ready and renders settle frames before the first shot; judge the later shots.
 */
// The example page mounts the same module and the same body as apps/showcase-ninja-runner-port/index.html. The app page
// cannot run under the example dev server: it bundles apps/*/src/main.ts, which moves `import.meta.url` and so the GLB URLs.
const APP = "/examples/ninja-runner-port/index.html";
const HOOK = "__AURA_NINJA_RUNNER__";
const WARMUP_MS = 15_000;
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

const RAM = `const z = api.state; const b = z.entities.find((e) => e.type === "barrier" && e.alive && e.s > 200);
z.entities.forEach((e) => { if (e !== b && e.type !== "spirit") e.alive = false; });
b.lane = 0; z.x = 0; z.s = b.s - 9; z.time = 40; z.y = 0; z.vy = 0; api.stepFrames(0);
for (let i = 0; i < 400; i++) { api.stepRaw(1); if (z.health < 5 || !z.entities.find((e) => e.s === b.s && e.alive)) break; } api.settle(3, 0.12);`;

interface State { readonly name: string; readonly drive: string; readonly settle?: number }
const STATES: Record<string, State> = {
  early: { name: "early", drive: `api.begin(); api.stepFrames(60);` },
  run: { name: "run", drive: `api.stepFrames(240);` },
  action: { name: "action", drive: `api.applyInput("jump"); api.stepFrames(30); api.applyInput("spiralorb"); api.stepFrames(20);` },
  "gate-hit": { name: "gate-hit", drive: `api.begin(); ${RAM}` },
  "mid-action": { name: "mid-action", drive: `api.begin(); api.setAutopilot(true); api.stepFrames(1800);` },
  results: { name: "results", drive: `api.setAutopilot(true); api.advanceTo(1e9, [], 60000);`, settle: 8 },
  /** Sunfire form with the spiral orb out: the transparent aura, orb and sparks sit over the sunlit path (S-06). */
  sunfire: { name: "sunfire", drive: `api.begin(); api.setAutopilot(false); const z = api.state; z.entities.forEach((e) => { if (e.type !== "spirit") e.alive = false; }); z.s = 640; z.time = 30; api.stepRaw(1); api.applyInput("sage"); api.stepFrames(40); api.applyInput("spiralorb"); api.stepFrames(12);` }
};
const RUN_STATE = `api.begin(); api.stepFrames(300);`;

async function stats(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, dark = 0, clip = 0, lower = 0, lowerN = 0, centre = 0, centreN = 0;
    const w = c.width, h = c.height;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
      if (y <= 8) dark++;
      if (y >= 250) clip++;
      const px = p % w, py = Math.floor(p / w);
      if (py >= h / 2) { lower += y; lowerN++; }
      if (px >= w / 3 && px < (2 * w) / 3 && py >= h / 3 && py < (2 * h) / 3) { centre += y; centreN++; }
    }
    const n = d.length / 4;
    const pct = (q: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= q * n) return v; } return 255; };
    return { w, h, mean: +(sum / n).toFixed(2), lowerMean: +(lower / lowerN).toFixed(2), centreMean: +(centre / centreN).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), darkFrac: +(dark / n).toFixed(4), clipFrac: +(clip / n).toFixed(4) };
  }, png.toString("base64"));
}

async function engine(page: Page) {
  return page.evaluate((hook) => {
    const h = (window as unknown as Record<string, any>)[hook];
    try {
      const dg = h?.diagnostics?.();
      const snap = h?.snapshot?.();
      return {
        renderPath: dg?.renderPath?.path ?? null, bloomFusion: dg?.renderPath?.bloomFusion ?? null, droppedFeatures: dg?.renderPath?.droppedFeatures ?? dg?.droppedFeatures ?? null,
        drawCalls: dg?.drawCalls ?? null, shadows: dg?.shadows ? JSON.stringify(dg.shadows).slice(0, 400) : null,
        warnings: Array.isArray(dg?.warnings) ? dg.warnings.map((w: unknown) => String(typeof w === "object" && w && "message" in w ? (w as { message: string }).message : w).slice(0, 160)).slice(0, 8) : null,
        environment: dg?.environment ? JSON.stringify(dg.environment).slice(0, 300) : dg?.lighting ? JSON.stringify(dg.lighting).slice(0, 300) : null,
        phase: snap?.phase ?? null, distance: snap?.distance ?? null, form: snap?.form ?? null, kills: snap?.kills ?? null
      };
    } catch (e) { return { err: String(e).slice(0, 200) }; }
  }, HOOK);
}

const hudRects = (page: Page) => page.evaluate(() => {
  const out: Record<string, [number, number, number, number]> = {};
  for (const id of ["stats", "vitals", "forms", "abilities", "progress", "mute", "pause-btn", "intro-card"]) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains("hidden")) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0) out[id] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  }
  return out;
});

function emit(target: string, shot: string, jpg: Buffer): void {
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** One full-page frame (the evidence screen, HUD included) and one canvas-only frame (luma for lighting comparisons). */
async function grab(page: Page, target: string, shot: string, extra: Record<string, unknown> = {}, full = true): Promise<void> {
  if (full) emit(target, `${shot}-page`, await page.screenshot({ type: "jpeg", quality: 90 }));
  const style = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: "png" });
  await style.evaluate((el) => el.remove());
  const jpg64 = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, png.toString("base64"));
  emit(target, `${shot}-canvas`, Buffer.from(jpg64, "base64"));
  log(`GL_META ${JSON.stringify({ target, shot, ...extra, ...(await stats(page, png)), engine: await engine(page), hud: await hudRects(page) })}`);
}

async function open(browser: Browser, server: ExampleDevServer, query: string, viewport: { width: number; height: number }, mobile: boolean, errors: string[]): Promise<Page> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console ${m.text().slice(0, 200)}`); });
  await page.goto(`${server.origin}${APP}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((hook) => {
    const w = window as unknown as Record<string, any>;
    return w[hook]?.ready?.() === true || Boolean(w.__AURA_NINJA_RUNNER_ERROR__);
  }, HOOK, { timeout: 900_000, polling: 1000 });
  const bootError = await page.evaluate(() => (window as unknown as Record<string, unknown>).__AURA_NINJA_RUNNER_ERROR__ ?? null);
  expect(bootError, errors.slice(0, 4).join(" | ")).toBeNull();
  await page.waitForTimeout(WARMUP_MS);
  // Captures draw only through the QA hooks: the game's own frame loop is stopped (each software-GL frame costs many
  // seconds, and a running loop makes every screenshot wait for one). `drive` renders settle frames explicitly.
  await page.evaluate(() => { (window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0; });
  await page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].settle(2, 1 / 60), HOOK);
  return page;
}

async function drive(page: Page, script: string, settle = 4): Promise<string> {
  let err = "none";
  try {
    await page.evaluate(({ hook, script }) => new Function("api", script)((window as unknown as Record<string, unknown>)[hook]), { hook: HOOK, script });
  } catch (e) { err = String(e).slice(0, 240); }
  await page.evaluate(([hook, k]) => (window as unknown as Record<string, any>)[hook as string].settle(k, 1 / 60), [HOOK, settle] as const);
  return err;
}

test.describe("g20 ninja-runner-port", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  // Split in two so each fits the one-hour ACR step on software GL.
  for (const [name, keys, title] of [["g20-desktop-a", ["early", "run", "action"], true], ["g20-desktop-b", ["gate-hit", "mid-action", "results"], false]] as const) {
    test(`${name} states`, async ({ browser }) => {
      const errors: string[] = [];
      const page = await open(browser, server, "?manual=1", { width: 1280, height: 720 }, false, errors);
      if (title) await grab(page, "desktop", "title-1280");
      for (const key of keys) {
        const st = STATES[key]!;
        const err = await drive(page, st.drive, st.settle);
        await grab(page, "desktop", `${st.name}-1280`, { driveErr: err });
      }
      log(`GL_ERRORS ${name} ${JSON.stringify(errors.slice(0, 8))}`);
    });
  }

  test("g20-phone states", async ({ browser }) => {
    const errors: string[] = [];
    const page = await open(browser, server, "?manual=1", { width: 390, height: 844 }, true, errors);
    await grab(page, "phone", "title-390");
    for (const key of ["early", "run"]) {
      const st = STATES[key]!;
      const err = await drive(page, st.drive, st.settle);
      await grab(page, "phone", `${st.name}-390`, { driveErr: err });
    }
    log(`GL_ERRORS phone ${JSON.stringify(errors.slice(0, 8))}`);
  });

  // Lighting and render-path variants at the same run state (1280x720): fused vs production bloom (RP-05), AO on/off (LIGHT-06,
  // `quality=low` drops only the AO effect at DPR 1), and the sun shadow with each cascade fit (S-01).
  for (const [name, variants] of [
    ["g20-variants-render", ["", "&aura3d-render=production", "&quality=low"]],
    ["g20-variants-shadow", ["&shadow=0", "&shadowfit=legacy", "&shadowfit=current"]],
    ["g20-variants-ibl", ["", "&ibl=hdri"]]
  ] as const) {
    test(name, async ({ browser }) => {
      const errors: string[] = [];
      for (const q of variants) {
        const page = await open(browser, server, `?manual=1${q}`, { width: 1280, height: 720 }, false, errors);
        const err = await drive(page, RUN_STATE, 4);
        await grab(page, name, `run${q.replace(/[&=]/g, "_") || "_default"}`, { query: q, driveErr: err }, false);
        await grab(page, name, `run${q.replace(/[&=]/g, "_") || "_default"}-b`, { query: q, driveErr: err }, false);
        await page.context().close();
      }
      log(`GL_ERRORS ${name} ${JSON.stringify(errors.slice(0, 8))}`);
    });
  }

  // The action frame (jump plus orb at 52 m) with each shadow setting: the path under the gate is where the fits differ.
  test("g20-action-shadow", async ({ browser }) => {
    const errors: string[] = [];
    const action = `${STATES.early!.drive} ${STATES.run!.drive} ${STATES.action!.drive}`;
    for (const q of ["&shadow=0", "&shadowfit=legacy", "&shadowfit=current"]) {
      const page = await open(browser, server, `?manual=1${q}`, { width: 1280, height: 720 }, false, errors);
      const err = await drive(page, action, 3);
      await grab(page, "action-shadow", `action${q.replace(/[&=]/g, "_")}`, { query: q, driveErr: err }, false);
      await page.context().close();
    }
    log(`GL_ERRORS action-shadow ${JSON.stringify(errors.slice(0, 8))}`);
  });

  // Saved preferences across a reload (the long behaviour test runs out of time before this on software GL): mute and best
  // score come back, and a page with saved values loads without errors.
  test("g20-prefs-reload", async ({ browser }) => {
    const errors: string[] = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console ${m.text().slice(0, 200)}`); });
    const check = (name: string, ok: boolean, detail: unknown): void => { log(`G20_CHECK ${JSON.stringify({ name, ok, detail })}`); expect.soft(ok, `${name}: ${JSON.stringify(detail)}`).toBe(true); };
    await page.goto(`${server.origin}${APP}?quality=low&manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((hook) => (window as unknown as Record<string, any>)[hook]?.ready?.() === true, HOOK, { timeout: 900_000, polling: 1000 });
    await page.evaluate(() => { (window as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () => 0; });
    await page.click("#start");
    await page.evaluate((hook) => { const h = (window as unknown as Record<string, any>)[hook]; h.begin(); h.setAutopilot(true); h.advanceTo(1e9, [], 60000); }, HOOK);
    await page.click("#mute");
    const saved = await page.evaluate(() => ({ muted: localStorage.getItem("shadowstep-gauntlet:muted"), best: localStorage.getItem("shadowstep-gauntlet:best:17") }));
    check("a finished run and a mute click are saved", saved.muted === "1" && !!saved.best, saved);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((hook) => (window as unknown as Record<string, any>)[hook]?.ready?.() === true, HOOK, { timeout: 900_000, polling: 1000 });
    const reloaded = await page.evaluate(() => ({ mute: document.getElementById("mute")!.textContent, best: document.getElementById("best")?.textContent ?? null }));
    check("mute and best score survive a reload", /off/i.test(reloaded.mute ?? "") && /Best:/.test(reloaded.best ?? ""), reloaded);
    check("no page errors", errors.filter((e) => !/favicon|Failed to load resource/i.test(e)).length === 0, errors.slice(0, 6));
    await ctx.close();
  });

  // Index card: the run state at the 1440x900 card viewport (screens/final/card@2x.jpg; card.jpg is its half-size copy).
  test("g20-card", async ({ browser }) => {
    const errors: string[] = [];
    const page = await open(browser, server, "?manual=1", { width: 1440, height: 900 }, false, errors);
    const err = await drive(page, `api.begin(); api.stepFrames(300);`, 4);
    await grab(page, "card", "card@2x", { driveErr: err });
    log(`GL_ERRORS card ${JSON.stringify(errors.slice(0, 8))}`);
  });

  // Sunfire form with the orb out, sun shadow on and off (S-06), plus a phone frame of the running HUD (E-02, E-05, S-03).
  test("g20-sunfire", async ({ browser }) => {
    const errors: string[] = [];
    for (const q of ["", "&shadow=0"]) {
      const page = await open(browser, server, `?manual=1${q}`, { width: 1280, height: 720 }, false, errors);
      const err = await drive(page, STATES.sunfire!.drive, 4);
      await grab(page, "sunfire", `sunfire${q.replace(/[&=]/g, "_") || "_default"}`, { query: q, driveErr: err });
      await page.context().close();
    }
    const phone = await open(browser, server, "?manual=1", { width: 390, height: 844 }, true, errors);
    const err = await drive(phone, `api.begin(); api.stepFrames(240); api.applyInput("jump"); api.stepFrames(30); api.applyInput("spiralorb"); api.stepFrames(20);`, 4);
    await grab(phone, "sunfire", "action-390", { driveErr: err });
    log(`GL_ERRORS sunfire ${JSON.stringify(errors.slice(0, 8))}`);
  });

  // Behaviour: pause button, hidden-tab pause and audio suspend, countdown guard, swipes, run again after a win and a loss,
  // reduced motion, remembered mute, best score, render path and dropped features. Low quality and a small viewport keep it fast.
  test("g20-behaviour", async ({ browser }) => {
    const errors: string[] = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console ${m.text().slice(0, 200)}`); });
    await page.goto(`${server.origin}${APP}?quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((hook) => (window as unknown as Record<string, any>)[hook]?.ready?.() === true, HOOK, { timeout: 900_000, polling: 1000 });
    const check = (name: string, ok: boolean, detail: unknown): void => { log(`G20_CHECK ${JSON.stringify({ name, ok, detail })}`); expect.soft(ok, `${name}: ${JSON.stringify(detail)}`).toBe(true); };
    const phase = () => page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].state.phase as string, HOOK);
    // The 2.2 s countdown advances by frame time and a software-GL frame takes seconds (with the loop's per-frame dt cap
    // the countdown can take minutes), so after checking that the countdown is showing, the test starts the run itself.
    const throughCountdown = async (label: string): Promise<void> => {
      const shown = await page.evaluate(() => !document.getElementById("countdown")!.classList.contains("hidden"));
      check(`${label} shows the 3-2-1 countdown`, shown, shown);
      await page.evaluate((hook) => { const h = (window as unknown as Record<string, any>)[hook]; if (h.state.phase !== "running") h.begin(); }, HOOK);
    };

    const info = await page.evaluate((hook) => {
      const h = (window as unknown as Record<string, any>)[hook];
      const dg = h.diagnostics();
      return { renderPath: dg?.renderPath?.path ?? null, droppedFeatures: dg?.renderPath?.droppedFeatures ?? null, missingInputs: dg?.renderPath?.missingInputs ?? null, droppedPasses: dg?.renderPath?.droppedPasses ?? null, reducedMotion: h.reducedMotion?.() ?? null };
    }, HOOK);
    check("diagnostics renderPath", typeof info.renderPath === "string", info);
    check("reduced motion honoured", info.reducedMotion === true, info);
    const intro = await page.evaluate(() => document.getElementById("intro-card")?.textContent ?? "");
    check("intro card states the objective", /Valley Gate/.test(intro) && /2,640/.test(intro), intro.slice(0, 200));

    // Countdown guard: W on the title card starts the countdown (not the run); W during the countdown does not cut it short.
    await page.keyboard.press("KeyW");
    const afterW = await page.evaluate((hook) => ({ phase: (window as unknown as Record<string, any>)[hook].state.phase, countdown: !document.getElementById("countdown")!.classList.contains("hidden") }), HOOK);
    await page.keyboard.press("KeyW");
    const afterW2 = await phase();
    check("title W starts the countdown, not the run", afterW.phase === "intro" && afterW.countdown && afterW2 === "intro", { afterW, afterW2 });
    await throughCountdown("title W");

    // Pause button (touch players) and resume.
    const btn = await page.evaluate(() => { const b = document.getElementById("pause-btn"); if (!b || b.classList.contains("hidden")) return null; const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    check("pause button visible and at least 44 px", !!btn && btn.w >= 44 && btn.h >= 44, btn);
    await page.tap("#pause-btn").catch(() => page.click("#pause-btn"));
    const paused = await phase();
    const s0 = await page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].state.s as number, HOOK);
    await page.waitForTimeout(3000);
    const s1 = await page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].state.s as number, HOOK);
    check("pause button pauses the run", paused === "paused" && s1 === s0, { paused, s0, s1 });
    await page.tap("#resume").catch(() => page.click("#resume"));
    check("resume continues the run", (await phase()) === "running", await phase());

    // Hidden tab: the run pauses and the audio context suspends.
    const hidden = await page.evaluate(async (hook) => {
      const h = (window as unknown as Record<string, any>)[hook];
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 300));
      const out = { phase: h.state.phase, audio: h.audio() };
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
      return out;
    }, HOOK);
    check("hidden tab pauses the run and suspends audio", hidden.phase === "paused" && hidden.audio.suspended !== false, hidden);
    check("returning to the tab keeps the run paused until Resume", (await phase()) === "paused", await phase());
    await page.click("#resume");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    check("window blur pauses the run", (await phase()) === "paused", await phase());
    await page.click("#resume");

    // Touch swipe right changes lane.
    const lane0 = await page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].state.lane as number, HOOK);
    await page.evaluate(() => {
      const c = document.getElementById("world")!;
      const ev = (type: string, x: number) => c.dispatchEvent(new PointerEvent(type, { pointerType: "touch", clientX: x, clientY: 500, bubbles: true }));
      ev("pointerdown", 120); ev("pointerup", 240);
    });
    const lane1 = await page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].state.lane as number, HOOK);
    check("swipe right changes lane", lane1 === Math.min(1, lane0 + 1), { lane0, lane1 });

    // Mute is remembered.
    await page.click("#mute");
    const muted = await page.evaluate(() => ({ text: document.getElementById("mute")!.textContent, stored: localStorage.getItem("shadowstep-gauntlet:muted") }));
    check("mute is saved", muted.stored === "1", muted);

    // A win through the autopilot: result card, best score saved; Run again starts a fresh countdown.
    await page.evaluate((hook) => { const h = (window as unknown as Record<string, any>)[hook]; h.setAutopilot(true); h.advanceTo(1e9, [], 60000); }, HOOK);
    await page.waitForTimeout(1500);
    const won = await page.evaluate(() => ({ phase: (window as any).__AURA_NINJA_RUNNER__.state.phase, result: !document.getElementById("result")!.classList.contains("hidden"), text: document.getElementById("result")!.textContent, best: localStorage.getItem("shadowstep-gauntlet:best:17") }));
    check("win shows the result card and saves the best run", won.phase === "won" && won.result && !!won.best, won);
    await page.evaluate((hook) => (window as unknown as Record<string, any>)[hook].setAutopilot(false), HOOK);
    await page.click("#again");
    await throughCountdown("run again after a win");
    const fresh = await page.evaluate((hook) => { const s = (window as unknown as Record<string, any>)[hook].state; return { s: s.s, kills: s.kills, health: s.health }; }, HOOK);
    check("run again after a win starts a fresh run", fresh.kills === 0 && fresh.health === 5 && fresh.s < 60, fresh);

    // A loss: drain health, result card, Run again.
    await page.evaluate((hook) => { const h = (window as unknown as Record<string, any>)[hook]; const z = h.state; z.health = 1; z.invulnerable = 0; h.setAutopilot(false); h.advanceTo(1e9, [], 30000); }, HOOK);
    await page.waitForTimeout(1500);
    const lost = await page.evaluate(() => ({ phase: (window as any).__AURA_NINJA_RUNNER__.state.phase, result: !document.getElementById("result")!.classList.contains("hidden") }));
    check("loss shows the result card", lost.phase === "lost" && lost.result, lost);
    await page.click("#again");
    await throughCountdown("run again after a loss");
    check("run again after a loss starts a fresh run", (await phase()) === "running", await phase());

    // Reload: mute state survives.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((hook) => (window as unknown as Record<string, any>)[hook]?.ready?.() === true, HOOK, { timeout: 900_000, polling: 1000 });
    const reloaded = await page.evaluate(() => ({ mute: document.getElementById("mute")!.textContent, best: document.getElementById("best")?.textContent ?? null }));
    check("mute and best score survive a reload", /off/i.test(reloaded.mute ?? "") && !!reloaded.best, reloaded);

    log(`GL_ERRORS behaviour ${JSON.stringify(errors.slice(0, 8))}`);
    check("no page errors", errors.filter((e) => !/favicon|Failed to load resource/i.test(e)).length === 0, errors.slice(0, 6));
    await ctx.close();
  });
});
