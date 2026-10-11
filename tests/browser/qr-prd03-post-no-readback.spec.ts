import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 §6.9 (Phase 3): "a `post-no-readback.spec.ts` wraps `device.readPixels`
 * and `readPixelsAsync` in counters and asserts `counters().readbacks == 0`
 * after 300 frames across the 18 games." Two halves:
 *
 *  - 03-S11 (bottom describe): every game route in
 *    `tools/quality-rebuild-capture/games.json` (all 18, served from this
 *    commit by the example dev server) with the capture flag set for
 *    `qr_flags=post` (the game's own `qrFlags` plus `post`), 300 frames each,
 *    counting C-28 `counters().readbacks` (surfaced per frame as
 *    `diagnostics().frame.readbacksThisFrame`) and a spy on
 *    `WebGL{,2}RenderingContext.prototype.readPixels`. Rows are written to
 *    `tests/reports/qr-prd03-s11-readbacks.json`.
 *  - the scene probe below, on a post-heavy flag-on scene that exercises every
 *    Phase-3 stage (S1 depth, S2 GTAO, S4 god rays, S9 bloom, LDR
 *    vignette/grain/CA tail):
 *
 *  - `diagnostics().frame.readbacksThisFrame` stays 0 for all 300 frames
 *    (C-28 counter wrap of every device readback entry point), and
 *  - the app's own `gl.readPixels` is never invoked either — nothing bypasses
 *    the device interface.
 *
 * `POSTPROCESS_PASS_NOT_GPU` already hard-fails dev builds for any pass that
 * falls off the GPU path, so a surviving 300-frame run plus zero counters is
 * the compound assertion.
 */

interface NoReadbackResult {
  readonly frames: number;
  readonly deviceReadbacks: number;
  readonly glReadbacks: number;
  readonly skipped: readonly string[];
  readonly stages: readonly string[];
  readonly error?: string;
}

test.describe("PRD-03 Phase 3 — §6.9 CPU-readback ban", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let result: NoReadbackResult;

  test.beforeAll(async ({ browser }, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-no-readback-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    try {
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03NoReadback?: unknown }).runQrPrd03NoReadback === "function",
      undefined,
      { timeout: 150_000 },
    );
    } catch {
      // Cold CI transform of the engine module graph can outrun one
      // budget; the dev server caches transpiled modules, so a reload
      // re-serves the whole graph from cache and lands the global.
      await page.reload();
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03NoReadback?: unknown }).runQrPrd03NoReadback === "function",
      undefined,
      { timeout: 150_000 },
    );
    }
    result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03NoReadback?: (frames: number) => Promise<NoReadbackResult> }).runQrPrd03NoReadback!;
      return run(300);
    });
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("harness ran the full 300-frame flag-on post chain", () => {
    expect(result.error ?? null).toBeNull();
    expect(result.frames).toBe(300);
  });

  test("device readback counters stay 0 for all 300 frames", () => {
    expect(result.deviceReadbacks).toBe(0);
  });

  test("the raw gl.readPixels path is never invoked either", () => {
    expect(result.glReadbacks).toBe(0);
  });

  test("diagnostics().post.skipped carries AO_INDIRECT_FRACTION_PENDING (C-02 stub)", () => {
    expect(result.skipped).toContain("AO_INDIRECT_FRACTION_PENDING");
    expect(result.stages).toContain("S2-gtao");
    expect(result.stages).toContain("S4-god-rays");
  });
});

/* ------------------------------------------------------------------------- */
/* 03-S11 — all 18 game routes, 300 frames each, readbacks == 0              */
/* ------------------------------------------------------------------------- */

interface GameEntry {
  readonly id: string;
  readonly route: string;
  readonly readyExpr?: string;
  readonly qrFlags?: readonly string[];
}

interface GameReadbackRow {
  readonly id: string;
  readonly url: string;
  readonly ready: boolean;
  readonly frames: number;
  readonly liveApps: number;
  /** Frames on which a live app reported the C-28 `frame` section. */
  readonly c28Frames: number;
  readonly c28Readbacks: number;
  readonly readPixelsCalls: number;
  readonly pageErrors: readonly string[];
  readonly error?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const gamesConfig = JSON.parse(
  readFileSync(join(here, "../../tools/quality-rebuild-capture/games.json"), "utf8")
) as { readonly defaults: { readonly readyTimeoutMs: number }; readonly games: readonly GameEntry[] };
const S11_FRAMES = 300;
const S11_OUT = process.env.QR_S11_OUT ?? join(here, "../reports/qr-prd03-s11-readbacks.json");

/** Same URL shape as `capture-games.mjs --flags post`: game flags ∪ `post`. */
function s11Url(origin: string, game: GameEntry): string {
  const flags = [...new Set([...(game.qrFlags ?? []), "post"])];
  return `${origin}${game.route}${game.route.includes("?") ? "&" : "?"}a3d-qr=${encodeURIComponent(flags.join(","))}`;
}

/** Installed before any page script: counts every readPixels on any GL context. */
function installReadPixelsSpy(): void {
  const w = window as unknown as { __QR_S11_READPIXELS__: number };
  w.__QR_S11_READPIXELS__ = 0;
  for (const ctor of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
    const proto = ctor?.prototype as { readPixels?: (...args: unknown[]) => unknown } | undefined;
    const original = proto?.readPixels;
    if (!proto || typeof original !== "function") continue;
    proto.readPixels = function spiedReadPixels(this: unknown, ...args: unknown[]) {
      w.__QR_S11_READPIXELS__ += 1;
      return original.apply(this, args);
    };
  }
}

async function measureGame(page: Page, frames: number) {
  return page.evaluate(async (frameCount) => {
    type LiveApp = { diagnostics(): { frame?: { readbacksThisFrame?: number } } };
    const w = window as unknown as { __QR_S11_READPIXELS__: number; __AURA3D_LIVE_APPS__?: { all?: () => readonly LiveApp[] } };
    // Count only inside the measured window.
    w.__QR_S11_READPIXELS__ = 0;
    let c28Frames = 0;
    let c28Readbacks = 0;
    let liveApps = 0;
    for (let i = 0; i < frameCount; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const apps = w.__AURA3D_LIVE_APPS__?.all?.() ?? [];
      liveApps = Math.max(liveApps, apps.length);
      let reported = false;
      for (const app of apps) {
        const frame = app.diagnostics().frame;
        if (frame && typeof frame.readbacksThisFrame === "number") {
          reported = true;
          c28Readbacks += frame.readbacksThisFrame;
        }
      }
      if (reported) c28Frames += 1;
    }
    return { frames: frameCount, liveApps, c28Frames, c28Readbacks, readPixelsCalls: w.__QR_S11_READPIXELS__ };
  }, frames);
}

test.describe("PRD-03 03-S11 — §6.9 readback ban across the 18 game routes", () => {
  test.describe.configure({ timeout: 300_000 });
  let server: ExampleDevServer;
  const rows: GameReadbackRow[] = [];

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    // A failed test restarts the Playwright worker (fresh `rows`), so merge
    // with rows an earlier worker of this run already wrote.
    mkdirSync(dirname(S11_OUT), { recursive: true });
    let previous: GameReadbackRow[] = [];
    try {
      previous = (JSON.parse(readFileSync(S11_OUT, "utf8")) as { rows?: GameReadbackRow[] }).rows ?? [];
    } catch {
      previous = [];
    }
    const merged = new Map(previous.map((row) => [row.id, row]));
    for (const row of rows) merged.set(row.id, row);
    writeFileSync(S11_OUT, JSON.stringify({ schema: "qr-prd03-s11-readbacks/v1", framesPerGame: S11_FRAMES, rows: [...merged.values()] }, null, 2));
    await server?.close();
  });

  test("games.json lists all 18 game routes", () => {
    expect(gamesConfig.games).toHaveLength(18);
  });

  for (const game of gamesConfig.games) {
    test(`${game.id}: ${S11_FRAMES} frames with readbacks == 0`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 300)));
      await page.addInitScript(installReadPixelsSpy);
      const url = s11Url(server.origin, game);
      let row: GameReadbackRow;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForFunction(() => document.querySelector("canvas") !== null, undefined, { timeout: 150_000 });
        let ready = false;
        if (game.readyExpr) {
          ready = await page
            .waitForFunction(game.readyExpr, undefined, { timeout: gamesConfig.defaults.readyTimeoutMs })
            .then(() => true, () => false);
        }
        const measured = await measureGame(page, S11_FRAMES);
        row = { id: game.id, url, ready, ...measured, pageErrors };
      } catch (error) {
        row = { id: game.id, url, ready: false, frames: 0, liveApps: 0, c28Frames: 0, c28Readbacks: -1, readPixelsCalls: -1, pageErrors, error: String(error).slice(0, 300) };
      } finally {
        await context.close();
      }
      rows.push(row);
      console.log("[qr-prd03-s11]", JSON.stringify(row));
      expect(row.error ?? null).toBeNull();
      expect(row.frames).toBe(S11_FRAMES);
      expect(row.liveApps).toBeGreaterThan(0);
      // The C-28 counters must actually report (A3D_QR_TIERS is in every
      // game's flag set) — a missing `frame` section would make 0 vacuous.
      expect(row.c28Frames).toBe(S11_FRAMES);
      expect(row.c28Readbacks).toBe(0);
      expect(row.readPixelsCalls).toBe(0);
    });
  }
});
