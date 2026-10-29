import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G19 (Ion Circuit, `heatsink-port`): LIGHT-01 / HP-04 environment calibration capture. Remote only
 * (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   HP_META <json>                          per shot: luma stats of the canvas read-back, engine diagnostics
 *   HP_GRID <arm> <step> <w>x<h> <b64>      luma averaged over 4x4 pixel blocks, one byte per block (offline region masks)
 *   HP_JPG  <arm> <step> <i>/<n> <b64>      the canvas JPEG itself, chunked
 * The frames are deterministic: `?manual=1` stops the rAF render loop, and each shot replays the original's recorded
 * input script (`tests/browser/data/heatsink-reference-replay.json`) to a fixed step, rendering the last LEAD steps so
 * the chase camera settles, then reads the canvas in the same task (`replayTo(step, lead, true)`). Shots at later
 * steps are the steady-state ones; the first step only checks that the arm booted.
 * Arms (HP_ARMS, comma list) are URL values of `?hpIbl=`; "none" loads the page without it. Builds without the
 * calibration hook ignore the parameter, so "none" is the only meaningful arm on them.
 */
const ARMS = (process.env.HP_ARMS ?? "none").split(",").map((s) => s.trim()).filter(Boolean);
const STEPS = (process.env.HP_STEPS ?? "450,1200,2250").split(",").map(Number);
const LEAD = Number(process.env.HP_LEAD ?? 8);
const CHUNK = 16000;
const LAB = "/examples/heatsink-port/";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

test.describe("g19 heatsink-port environment calibration", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const arm of ARMS) {
    test(`hp-arm-${arm}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`HP_ERR ${arm} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`HP_CONSOLE ${arm} ${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`HP_HTTP ${arm} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      await page.setViewportSize({ width: 960, height: 540 });
      const query = arm === "none" ? "?manual=1" : `?manual=1&hpIbl=${encodeURIComponent(arm)}`;
      await page.goto(`${server.origin}${LAB}${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_HEATSINK__?: { ready(): boolean }; __AURA_HEATSINK_ERROR__?: string };
        return w.__AURA_HEATSINK__?.ready() === true || Boolean(w.__AURA_HEATSINK_ERROR__);
      }, undefined, { timeout: 600_000, polling: 1000 });
      const bootError = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK_ERROR__?: string }).__AURA_HEATSINK_ERROR__ ?? null);
      if (bootError) { log(`HP_ERR ${arm} boot ${bootError.slice(0, 300)}`); return; }

      const ref = JSON.parse(readFileSync("tests/browser/data/heatsink-reference-replay.json", "utf8")) as { script: { text: string } };
      await page.evaluate(`window.__AURA_HEATSINK__.replayStart(${JSON.stringify(ref.script.text)})`);
      for (const step of STEPS) {
        const started = Date.now();
        const st = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, ${LEAD}, true)`) as { state: string; step: number; player: Record<string, number>; shot: { w: number; h: number; url: string } | null };
        if (!st.shot) { log(`HP_ERR ${arm} ${step} no-shot`); continue; }
        const analysed = await page.evaluate(async (url: string) => {
          const img = new Image();
          img.src = url;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
          const B = 4;
          const gw = Math.floor(width / B), gh = Math.floor(height / B);
          const grid = new Uint8Array(gw * gh);
          const acc = new Float64Array(gw * gh);
          const hist = new Uint32Array(256);
          let sum = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
              sum += l; hist[Math.round(l)]!++;
              const gx = Math.floor(x / B), gy = Math.floor(y / B);
              if (gx < gw && gy < gh) acc[gy * gw + gx]! += l;
            }
          }
          for (let k = 0; k < grid.length; k++) grid[k] = Math.round(acc[k]! / (B * B));
          const n = width * height;
          const pct = (p: number) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]!; if (a >= p * n) return v; } return 255; };
          let bin = "";
          for (let k = 0; k < grid.length; k++) bin += String.fromCharCode(grid[k]!);
          return { w: width, h: height, gw, gh, grid: btoa(bin), mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95) };
        }, st.shot.url);
        const info = await page.evaluate(() => {
          const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
          const dg = reg?.all()[0]?.diagnostics?.();
          return dg ? {
            renderPath: dg.renderPath?.path ?? null, bloomFusion: dg.renderPath?.bloomFusion ?? null, drawCalls: dg.drawCalls ?? null,
            warnings: (dg.warnings ?? []).map(String).filter((w: string) => /environment|hemisphere|ibl|fill|light/i.test(w)).slice(0, 6)
          } : null;
        });
        const { grid, ...stats } = analysed;
        log(`HP_META ${JSON.stringify({ arm, step, state: st.state, simStep: st.step, playerS: st.player.s, ms: Date.now() - started, ...stats, info })}`);
        log(`HP_GRID ${arm} ${step} ${analysed.gw}x${analysed.gh} ${grid}`);
        const b64 = st.shot.url.replace(/^data:image\/jpeg;base64,/, "");
        const parts = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < parts; i++) log(`HP_JPG ${arm} ${step} ${i + 1}/${parts} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      }
      log(`HP_DONE ${arm}`);
    });
  }
});

/*
 * Audit lane G19 fix checks (select with SPECS="tests/browser/audit-fix/heatsink-port.spec.ts --grep=fixes"). Each test logs HP_FIX <json> records (UI state read from the DOM and the
 * QA hooks) and HP_SHOT <name> <i>/<n> <b64> chunked page screenshots (DOM overlays included). Hooks that the base
 * build does not have are logged as "absent" instead of failing, so the same spec runs BEFORE (base) and AFTER (lane
 * branch). Measured at steady state: the replay frames at steps 1200 and 2250 are the ones to judge.
 */
type Api = Record<string, (...args: unknown[]) => unknown>;
const fix = (name: string, data: unknown): void => log(`HP_FIX ${JSON.stringify({ name, ...(data as object) })}`);
async function shot(page: import("@playwright/test").Page, name: string): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 85 })).toString("base64");
  const parts = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < parts; i++) log(`HP_SHOT ${name} ${i + 1}/${parts} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}
async function boot(page: import("@playwright/test").Page, origin: string, query: string, tag: string): Promise<boolean> {
  page.on("pageerror", (e) => log(`HP_ERR ${tag} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`HP_CONSOLE ${tag} ${m.type()} ${m.text().slice(0, 240)}`); });
  await page.goto(`${origin}${LAB}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const w = window as unknown as { __AURA_HEATSINK__?: { ready(): boolean }; __AURA_HEATSINK_ERROR__?: string };
    return w.__AURA_HEATSINK__?.ready() === true || Boolean(w.__AURA_HEATSINK_ERROR__);
  }, undefined, { timeout: 900_000, polling: 1000 });
  const err = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK_ERROR__?: string }).__AURA_HEATSINK_ERROR__ ?? null);
  if (err) { log(`HP_ERR ${tag} boot ${err.slice(0, 300)}`); return false; }
  return true;
}
const ui = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const vis = (id: string) => { const e = document.getElementById(id); if (!e) return null; const s = getComputedStyle(e); return !e.classList.contains("hidden") && s.display !== "none" && s.visibility !== "hidden" && e.getClientRects().length > 0; };
  const txt = (id: string) => document.getElementById(id)?.textContent ?? null;
  const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
  const dg = reg?.all()[0]?.diagnostics?.();
  const post = dg ? (dg.warnings ?? []).map(String).filter((w: string) => /bloom|post-field/i.test(w)) : null;
  return {
    count: txt("count"), countVisible: vis("count"), objective: txt("objective"), objectiveVisible: vis("objective"), notice: txt("notice"),
    hull: txt("h-hull"), gun: txt("h-gun-label"), targetsLabel: document.getElementById("h-targets")?.previousElementSibling?.textContent ?? null,
    takedownsBlock: Boolean(document.getElementById("h-td")), pauseVisible: vis("pause"), errorVisible: vis("error"), resultsVisible: vis("results"),
    resultsTitle: txt("results-title"), medal: txt("medal-line"), rules: txt("medal-rules"), menuVisible: vis("menu"),
    touchVisible: vis("touch"), dataError: document.documentElement.getAttribute("data-aura3d-error"),
    drawCalls: dg?.drawCalls ?? null, renderPath: dg?.renderPath?.path ?? null, postWarnings: post
  };
});

test.describe("g19 heatsink-port fixes", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  const ref = JSON.parse(readFileSync("tests/browser/data/heatsink-reference-replay.json", "utf8")) as { script: { text: string } };

  test("desktop 1280x720: GO banner, steady-state frames, pause, error panel, partial input", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (!(await boot(page, server.origin, "?manual=1", "desktop"))) return;
    const has = await page.evaluate(() => Object.keys((window as unknown as { __AURA_HEATSINK__: object }).__AURA_HEATSINK__));
    fix("hooks", { has });
    await page.evaluate(`window.__AURA_HEATSINK__.replayStart(${JSON.stringify(ref.script.text)})`);
    /* HP-01: the race starts at step 192; 1 s after GO is step 252, judged at 260 */
    for (const step of [180, 200, 260]) {
      const st = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, 2, false)`) as { state: string; goT?: number };
      fix("go-banner", { step, state: st.state, goT: st.goT ?? null, ...(await ui(page)) });
    }
    await shot(page, "desktop-step260");
    for (const step of [1200, 2250]) {
      const st = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, ${LEAD}, true)`) as { state: string; shot: { url: string; lit: number } | null };
      const stats = st.shot ? await page.evaluate(async (url: string) => {
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0, dark = 0; const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!; sum += l; if (l < 12) dark++; }
        return { w: c.width, h: c.height, mean: +(sum / n).toFixed(2), darkPct: +((dark / n) * 100).toFixed(2) };
      }, st.shot.url) : null;
      fix("steady", { step, state: st.state, lit: st.shot?.lit ?? null, stats, ...(await ui(page)) });
      await shot(page, `desktop-step${step}`);
    }
    /* HP-07: Esc opens the pause panel; a window blur pauses too */
    await page.keyboard.press("Escape");
    fix("pause-esc", await ui(page));
    await shot(page, "desktop-paused");
    if (has.includes("pause")) {
      await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: Api }).__AURA_HEATSINK__.pause!(false));
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      fix("pause-blur", { ...(await ui(page)), paused: await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: { state(): { paused?: boolean } } }).__AURA_HEATSINK__.state().paused ?? null) });
      await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: Api }).__AURA_HEATSINK__.pause!(false));
    } else fix("pause-blur", { absent: true });
    /* HP-10 / HP-05: a partial input to stepFrames; the base build turns the missing steer into NaN and throws on render */
    const partial = await page.evaluate(() => {
      const h = (window as unknown as { __AURA_HEATSINK__: Api & { state(): { player: { x: number } } } }).__AURA_HEATSINK__;
      h.begin!();
      let error: string | null = null;
      try { h.stepFrames!(240, { throttle: 1 }); } catch (e) { error = String(e).slice(0, 200); }
      return { error, x: h.state().player.x, finite: Number.isFinite(h.state().player.x) };
    });
    fix("partial-input", { ...partial, ...(await ui(page)) });
    /* HP-05: the error panel and restart */
    if (has.includes("faultForTest")) {
      await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: Api }).__AURA_HEATSINK__.faultForTest!("g19 forced fault"));
      fix("error-panel", await ui(page));
      await shot(page, "desktop-error");
      await page.click("#error-restart");
      fix("error-restart", { ...(await ui(page)), faulted: await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: { state(): { faulted?: boolean } } }).__AURA_HEATSINK__.state().faulted ?? null) });
    } else fix("error-panel", { absent: true });
    /* HP-14 / HP-06: a finished card and a DNF card */
    if (has.includes("autopilot")) {
      const fin = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: Api }).__AURA_HEATSINK__.autopilot!({ speed: 80, lead: 4 })) as Record<string, unknown>;
      fix("finished", { state: fin.state, ops: fin.ops, ...(await ui(page)) });
      await shot(page, "desktop-finished");
      const dnf = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: Api }).__AURA_HEATSINK__.autopilot!({ wreck: true, lead: 4 })) as Record<string, unknown>;
      fix("dnf", { state: dnf.state, ...(await ui(page)) });
      await shot(page, "desktop-dnf");
      const notice = await page.evaluate(() => {
        const h = (window as unknown as { __AURA_HEATSINK__: Api & { state(): { player: { crashes: number } } } }).__AURA_HEATSINK__;
        h.begin!();
        h.stepFrames!(200);
        for (let i = 0; i < 40 && h.state().player.crashes === 0; i++) h.stepFrames!(30, { throttle: 1, ramjet: true });
        return h.state().player.crashes;
      });
      fix("crash-notice", { crashes: notice, ...(await ui(page)) });
      await shot(page, "desktop-crash-notice");
    } else fix("finished", { absent: true });
    await ctx.close();
  });

  test("phone 390x844: touch controls, auto-throttle, pointercancel, steady-state frame", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    if (!(await boot(page, server.origin, "?manual=1", "phone"))) return;
    const st0 = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: { state(): Record<string, unknown> } }).__AURA_HEATSINK__.state());
    const buttons = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("#touch .tbtn")].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, w: r.width, h: r.height, x: r.x, y: r.y, inView: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }));
    fix("touch-layout", { quality: st0.quality ?? null, qualityReason: st0.qualityReason ?? null, touchMode: st0.touchMode ?? null, buttons, ...(await ui(page)) });
    const has = await page.evaluate(() => Object.keys((window as unknown as { __AURA_HEATSINK__: object }).__AURA_HEATSINK__));
    if (has.includes("input") && buttons.length) {
      const press = (id: string, type: string) => page.dispatchEvent(`#${id}`, type, { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true });
      const read = () => page.evaluate(() => (window as unknown as { __AURA_HEATSINK__: Api }).__AURA_HEATSINK__.input!()) as Promise<Record<string, unknown>>;
      const idle = await read();
      await press("t-right", "pointerdown"); await press("t-fire", "pointerdown");
      const held = await read();
      await press("t-fire", "pointercancel");
      const cancelled = await read();
      await press("t-right", "pointerup");
      await press("t-brake", "pointerdown");
      const braking = await read();
      await press("t-brake", "pointerup");
      fix("touch-input", { idle, held, cancelled, braking });
    } else fix("touch-input", { absent: true });
    await page.evaluate(`window.__AURA_HEATSINK__.replayStart(${JSON.stringify(ref.script.text)})`);
    for (const step of [260, 1200]) {
      const st = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, ${step === 260 ? 2 : LEAD}, false)`) as { state: string };
      fix("phone-steady", { step, state: st.state, ...(await ui(page)) });
      await shot(page, `phone-step${step}`);
    }
    await ctx.close();
  });
});
