import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Saltwind Highway (`roadster-hours-port`) audit-fix capture, lane G22. Remote only (tools/remote-acr/run.sh); never local
 * Playwright. The ACR run has no artifact egress, so everything goes to the log:
 *   RH_META <json>                        state, engine diagnostics and canvas luma (the game's own `stats()` read-back)
 *   RH_JPG  <name> <i>/<n> <b64>          full-page JPEG (HUD included), chunked
 * Runs on the base and on the lane branch with the same hooks (the hooks that only exist after the fix are optional).
 * The simulation runs under `?manual=1`, so states are reached with `stepSteps` and are the same on both builds.
 *
 * Tests:
 *   `screens`  real Meshy models, waits for the texture upgrade, then the evidence screens (same names and sizes as
 *              evidence/roadster-hours-port/screens/final) and steady-state luma at mid-drive (three shots, judge the later two);
 *              C1 (one R tap) and C3 (lighthouse/town node list) probes.
 *   `render`   `?meshy=0` (no texture wait): default quality against `?aura3d-render=production` on Sunbreak Coast and Halo Skyway
 *              at the same sim state (RP-05 bloom fusion), three shots each.
 *   `touch`    390x844 touch device (`hasTouch`, `isMobile`): touch controls present, throttle drives the car, recover is one tap.
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const SCREENS = process.env.RH_SCREENS !== "0";
const TEXTURE_WAIT_MS = Number(process.env.RH_TEXTURE_WAIT_MS ?? 1_500_000);

type Hooks = Record<string, any>;

async function api<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([name, rest]) => {
    const hooks = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__;
    return (hooks[name as string] as (...a: unknown[]) => unknown)(...(rest as unknown[]));
  }, [fn, args] as const) as Promise<T>;
}

async function waitReady(page: Page, timeout = 900_000): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA_ROADSTER_HOURS__?: Hooks }).__AURA_ROADSTER_HOURS__?.ready), undefined, { timeout, polling: 1000 });
}

async function probe(page: Page) {
  return page.evaluate(async () => {
    const h = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__;
    const snap = h.snapshot();
    const dg = h.diagnostics() ?? {};
    const tex = h.textures?.() ?? null;
    const nodes = tex ? Object.keys(tex.byNode) : [];
    const visible = (id: string): boolean => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0; };
    const warnings = ((dg.warnings ?? []) as unknown[]).map((w) => (typeof w === "string" ? w : JSON.stringify(w))).map((w) => w.slice(0, 120));
    let stats: unknown = null;
    try { stats = await h.stats(); delete (stats as { grid?: unknown }).grid; } catch (e) { stats = { error: String(e) }; }
    const touchButtons = [...document.querySelectorAll("[id^='touch-']")].filter((el) => getComputedStyle(el).display !== "none").map((el) => ({ id: el.id, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
    return {
      screen: snap.screen, phase: snap.phase, level: snap.level, time: +snap.time.toFixed(3), speedKmh: Math.round(snap.speed * 3.6), score: Math.round(snap.score),
      crashes: snap.crashes, nextGate: snap.nextGate, s: +snap.s.toFixed(2), l: +snap.l.toFixed(2),
      drawCalls: dg.drawCalls ?? null, renderPath: dg.renderPath ?? null,
      warnings: warnings.filter((w) => /deprecat|BLOOM|bloom|qualityProfile|OPTION_IGNORED/.test(w)),
      errors: (dg.errors ?? []).length,
      textures: tex ? { total: tex.total, textured: tex.textured, pending: tex.pending, fallback: tex.fallback } : null,
      lighthouseTown: nodes.filter((n) => /^lighthouse|^town/.test(n)),
      coach: document.getElementById("coach")?.textContent ?? null,
      thrustWindow: document.getElementById("thrust-fill")?.parentElement?.classList.contains("window") ?? null,
      toast: document.getElementById("toast")?.textContent ?? null,
      pauseButton: visible("pause-button"), touchButtons,
      stats
    };
  });
}

async function shot(page: Page, name: string, extra: Record<string, unknown> = {}): Promise<void> {
  await api(page, "renderNow");
  await page.waitForTimeout(400);
  const meta = await probe(page);
  log(`RH_META ${JSON.stringify({ name, ...extra, ...meta })}`);
  const jpg = await page.screenshot({ type: "jpeg", quality: 82 });
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`RH_JPG ${name} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

/** Begin a run and step past the 2.7 s countdown (324 steps) on the autopilot. */
async function beginAndStep(page: Page, steps: number): Promise<void> {
  await api(page, "begin");
  await api(page, "setAutopilot", true);
  if (steps > 0) await api(page, "stepSteps", steps);
}

/** One R tap held for 12 sim steps (100 ms) through the page's own keyboard path. */
async function recoverTap(page: Page): Promise<{ before: unknown; after: unknown }> {
  await beginAndStep(page, 330);
  await api(page, "setAutopilot", false);
  const before = await page.evaluate(() => { const s = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot(); return { crashes: s.crashes, score: s.score, phase: s.phase }; });
  await page.keyboard.down("KeyR");
  await api(page, "stepSteps", 12);
  await page.keyboard.up("KeyR");
  await api(page, "stepSteps", 2);
  const after = await page.evaluate(() => { const s = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot(); return { crashes: s.crashes, score: s.score, phase: s.phase }; });
  return { before, after };
}

test.describe("roadster-hours-port audit fix (G22)", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("screens", async ({ page }) => {
    test.skip(!SCREENS, "RH_SCREENS=0");
    page.on("pageerror", (e) => log(`RH_ERR pageerror ${e.message.slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`RH_CONSOLE ${m.type()} ${m.text().slice(0, 240)}`); });
    await page.setViewportSize({ width: 1280, height: 720 });
    const started = Date.now();
    await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&level=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    log(`RH_META ${JSON.stringify({ name: "ready", sinceGotoMs: Date.now() - started, ...(await probe(page)) })}`);
    // Textures upgrade one material at a time after mount (minutes each on software GL): wait, bounded.
    const texStart = Date.now();
    while (Date.now() - texStart < TEXTURE_WAIT_MS) {
      const t = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.textures?.() ?? null);
      if (!t || (t.pending === 0 && t.textured > 0)) break;
      await api(page, "renderNow");
      await page.waitForTimeout(5000);
    }
    log(`RH_META ${JSON.stringify({ name: "textures-settled", waitedMs: Date.now() - texStart, ...(await probe(page)) })}`);

    // Viewport changes on the same page (the texture upgrade takes minutes per page load on software GL). Playwright's own
    // viewport wins over CDP metrics overrides, so phone and card frames use setViewportSize. The phone frame adds the
    // `touch` class the page sets from (pointer: coarse) at load (no effect on the base build).
    const size = async (width: number, height: number, touch: boolean): Promise<void> => {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => { document.body.classList.toggle("touch", t); window.dispatchEvent(new Event("resize")); }, touch);
      await page.waitForTimeout(800);
    };
    const phone = (): Promise<void> => size(390, 844, true);
    const desktop = (): Promise<void> => size(1280, 720, false);

    await shot(page, "title.1280x720");
    await phone();
    await shot(page, "title.390x844");
    await desktop();

    await beginAndStep(page, 0);
    await shot(page, "gameplay-early.1280x720");
    await phone();
    await shot(page, "gameplay-early.390x844");
    await desktop();

    await api(page, "stepSteps", 330);
    await shot(page, "key-drive.1280x720");
    await phone();
    await shot(page, "key-drive.390x844");
    await desktop();

    // Card state: 1.29 s into the run.
    await beginAndStep(page, 324 + 155);
    // Card frame: the published card is 1440x900 (16:10); taken at a 1440x900 viewport (device scale 1 on this page).
    await size(1440, 900, false);
    await shot(page, "card.2x.1440x900");
    await desktop();

    // Mid-drive steady state: three shots of the same sim state, 20 s apart (judge the later two).
    await beginAndStep(page, 330 + 1440);
    for (const [i, wait] of [[0, 0], [1, 20_000], [2, 20_000]] as const) {
      if (wait) await page.waitForTimeout(wait);
      await shot(page, i === 2 ? "mid-drive.1280x720" : `mid-drive-settle${i}.1280x720`, { settle: i });
    }

    // Autopilot to the finish line.
    for (let i = 0; i < 40; i++) {
      const phase = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot().phase);
      if (phase === "complete") break;
      await api(page, "stepSteps", 1000);
    }
    await page.waitForTimeout(500);
    await shot(page, "results.1280x720");

    const tap = await recoverTap(page);
    log(`RH_META ${JSON.stringify({ name: "c1-recover-tap", ...tap })}`);
    log("RH_DONE screens");
  });

  test("card", async ({ page }) => {
    // The card frame loads at 1440x900 from the start: growing the window after load leaves the old backing size on screen
    // (handoff to E1 in docs/audits/lanes/g22.md).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&level=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    const texStart = Date.now();
    while (Date.now() - texStart < TEXTURE_WAIT_MS) {
      const t = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.textures?.() ?? null);
      if (!t || (t.pending === 0 && t.textured > 0)) break;
      await api(page, "renderNow");
      await page.waitForTimeout(5000);
    }
    await beginAndStep(page, 324 + 155);
    await page.waitForTimeout(20_000);
    await shot(page, "card.2x.1440x900", { waitedMs: Date.now() - texStart });
    log("RH_DONE card");
  });

  for (const level of [0, 2]) {
    for (const mode of ["default", "production"] as const) {
      test(`render level ${level} ${mode}`, async ({ page }) => {
        page.on("pageerror", (e) => log(`RH_ERR pageerror ${e.message.slice(0, 300)}`));
        await page.setViewportSize({ width: 1280, height: 720 });
        const q = mode === "production" ? "&aura3d-render=production" : "";
        await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&meshy=0&level=${level}${q}`, { waitUntil: "domcontentloaded" });
        await waitReady(page);
        await beginAndStep(page, 330 + 900);
        for (const [i, wait] of [[0, 0], [1, 15_000], [2, 15_000]] as const) {
          if (wait) await page.waitForTimeout(wait);
          await shot(page, `render-l${level}-${mode}-${i}`, { level, mode, settle: i });
        }
        log(`RH_DONE render-l${level}-${mode}`);
      });
    }
  }

  test("finish fanfare and next route in place", async ({ page }) => {
    page.on("pageerror", (e) => log(`RH_ERR pageerror ${e.message.slice(0, 300)}`));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&meshy=0&level=0`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await beginAndStep(page, 0);
    for (let i = 0; i < 40; i++) {
      const phase = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot().phase);
      if (phase === "complete") break;
      await api(page, "stepSteps", 1000);
    }
    await api(page, "renderNow");
    await page.waitForTimeout(1000);
    const cues = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.cues?.() ?? null);
    const results = await probe(page);
    const best = await page.evaluate(() => ({ best: document.getElementById("result-best")?.textContent ?? null, stored: localStorage.getItem("saltwind-highway:results") }));
    log(`RH_META ${JSON.stringify({ name: "finish-cues", cues, best, screen: results.screen })}`);
    const t0 = Date.now();
    await page.evaluate(() => (document.getElementById("next") as HTMLButtonElement | null)?.click());
    await page.waitForFunction(() => { const h = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__; return h.ready && h.snapshot().level === "redline"; }, undefined, { timeout: 600_000, polling: 1000 });
    const reloaded = await page.evaluate(() => performance.getEntriesByType("navigation").length && (performance.timeOrigin < Date.now() - 60_000));
    await api(page, "setAutopilot", true);
    await api(page, "stepSteps", 330 + 600);
    await shot(page, "next-route-redline", { switchMs: Date.now() - t0, url: page.url(), reloaded });
    log("RH_DONE next-route");
  });

  test.describe("touch", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    test("touch controls drive the car", async ({ page }) => {
      page.on("pageerror", (e) => log(`RH_ERR pageerror ${e.message.slice(0, 300)}`));
      await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&meshy=0&level=0`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      const media = await page.evaluate(() => ({ coarse: matchMedia("(pointer: coarse)").matches, bodyClass: document.body.className }));
      await beginAndStep(page, 330);
      await api(page, "setAutopilot", false);
      await shot(page, "touch-play.390x844", { media });
      const hasThrottle = await page.evaluate(() => !!document.getElementById("touch-throttle"));
      let drive: unknown = { hasThrottle };
      if (hasThrottle) {
        const box = await page.locator("#touch-throttle").boundingBox();
        const v0 = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot().speed);
        await page.evaluate(() => document.getElementById("touch-throttle")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, pointerType: "touch" })));
        await api(page, "stepSteps", 240);
        await page.evaluate(() => document.getElementById("touch-throttle")!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch" })));
        const v1 = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot().speed);
        const c0 = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot().crashes);
        // A real tap (touch events, then click): the recover button is a pulse bound to click.
        await page.locator("#touch-recover").tap();
        await api(page, "stepSteps", 12);
        await page.waitForTimeout(150);
        await api(page, "stepSteps", 2);
        const c1 = await page.evaluate(() => (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__.snapshot().crashes);
        drive = { hasThrottle, throttleBox: box, speedBefore: v0, speedAfter: v1, crashesBefore: c0, crashesAfterRecoverTap: c1 };
        await shot(page, "touch-driving.390x844", { media });
      }
      log(`RH_META ${JSON.stringify({ name: "touch-drive", media, drive })}`);
      log("RH_DONE touch");
    });
  });
});
