import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { humanPolicy, mulberry32 } from "./aura-slam-policy";

/**
 * Aura Slam integration (docs/aura-slam/ARCHITECTURE.md gates G4/G5/G6 support). Remote only (tools/remote-acr/run.sh, software
 * WebGL2 under Xvfb). Build the production wrapper first with `node tools/aura-slam/build-wrapper.mjs` (output
 * tests/browser/aura-slam-dist, which the runner image copies with tests/browser).
 *
 * 1. production build: boots, menu, Quick Match with a real click, real keys serve/pause/resume, 0 console errors, every
 *    asset URL 200, draw calls > 0, ?diag=1 reports no shader failure; frames for the evidence sheet (SLAMINT_FRAME logs).
 * 2. sim in a real browser: the seeded scripted human plays full matches on the shipped engine module loaded in the page;
 *    every checkpoint digest equals the golden produced from the ORIGINAL match-engine.js (tests/unit/aura-slam/autoplay-golden.test.ts).
 */
const DIST = path.resolve("tests/browser/aura-slam-dist");
const golden = JSON.parse(readFileSync(path.resolve("tests/browser/aura-slam-golden.json"), "utf8")) as { scenarios: Array<{ scenario: { options: Record<string, unknown>; seed: number; maxTicks: number; every: number }; result: { checkpoints: Array<{ tick: number; hash: string }>; final: Record<string, unknown> } }> };
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".wav": "audio/wav", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };

function serveDist(): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    let file = path.join(DIST, url);
    if (!file.startsWith(DIST)) { res.statusCode = 403; res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

type Win = Window & { __TOP_TENNIS_CONTROL__: { getState(): Record<string, any>; startOffline(): void }; advanceTime(ms: number): void; render_game_to_text(): string; __AURA_AURA_SLAM__?: { diagnostics?: () => { drawCalls?: number } } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__TOP_TENNIS_CONTROL__.getState());
const advance = (page: Page, ms: number) => page.evaluate((n) => (window as unknown as Win).advanceTime(n), ms);


/** Serve once with real keys when it is the player's serve (toss, then hit at the apex); otherwise just let time pass. */
async function playOn(page: Page, ms: number): Promise<void> {
  const s = await state(page);
  if (s.mode === "playing" && !s.paused && s.server === "player" && s.phase === "serve") {
    await page.keyboard.press("Space");
    for (let i = 0; i < 40; i++) {
      const b = (await state(page)).ball;
      if (b.z >= 0.82 && b.vz <= 0.55) break;
      await advance(page, 100);
    }
    await page.keyboard.press("Space");
  }
  await advance(page, ms);
}

async function emitFrame(page: Page, name: string): Promise<void> {
  const jpg = await page.screenshot({ type: "jpeg", quality: 86 });
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / 16000);
  for (let i = 0; i < n; i++) console.log(`SLAMINT_FRAME ${name} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
}

async function open(page: Page, origin: string, query: string, errors: string[], bad: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${origin}/apps/showcase-top-tennis/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 900_000, polling: 2000 });
}

test.describe("aura-slam integration", () => {
  test.setTimeout(3_600_000);

  test("production build: menu, Quick Match, real keys, pause, assets, diagnostics, frames", async ({ browser }) => {
    expect(existsSync(path.join(DIST, "apps/showcase-top-tennis/index.html")), "run node tools/aura-slam/build-wrapper.mjs first").toBe(true);
    const server = await serveDist();
    try {
      for (const viewport of [{ name: "1280", width: 1280, height: 720, mobile: false }, { name: "390", width: 390, height: 844, mobile: true }]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, ...(viewport.mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
        const page = await context.newPage();
        const errors: string[] = [], bad: string[] = [];
        await open(page, server.origin, "?diag=1&heal=0", errors, bad);
        await emitFrame(page, `menu-${viewport.name}`);

        if (!viewport.mobile) {
          await page.click("#aura-btn-play");
          await expect(page.locator("#match-hud")).not.toHaveClass(/hidden/, { timeout: 120_000 });
          await emitFrame(page, `serve-${viewport.name}`);
          expect((await state(page)).phase).toBe("serve");
          await page.keyboard.press("Space");
          expect((await state(page)).phase).toBe("serveToss");
          for (let i = 0; i < 40; i++) {
            const b = (await state(page)).ball;
            if (b.z >= 0.82 && b.vz <= 0.55) break;
            await advance(page, 100);
          }
          await page.keyboard.press("Space");
          await advance(page, 700);
          expect(["rally", "point"], "the serve is in play or has resolved").toContain((await state(page)).phase);
          await emitFrame(page, `rally-${viewport.name}`);
          await page.keyboard.press("KeyP");
          expect((await state(page)).paused).toBe(true);
          // engine.step counts `tick` even while paused (as the original does); simulated time is what must hold still.
          const paused = await state(page);
          await advance(page, 500);
          const stillPaused = await state(page);
          expect(stillPaused.time, "paused sim time does not advance").toBe(paused.time);
          expect(JSON.stringify(stillPaused.ball), "paused ball does not move").toBe(JSON.stringify(paused.ball));
          await page.keyboard.press("KeyP");
          expect((await state(page)).paused).toBe(false);

          const before = (await state(page)).score;
          for (let i = 0; i < 80; i++) {
            await playOn(page, 1000);
            const s = (await state(page)).score;
            if (s.playerPoints !== before.playerPoints || s.aiPoints !== before.aiPoints || s.playerGames !== before.playerGames || s.aiGames !== before.aiGames) break;
          }
          await emitFrame(page, `point-${viewport.name}`);
          const after = (await state(page)).score;
          expect(JSON.stringify(after), "a point was scored").not.toBe(JSON.stringify(before));

          for (let i = 0; i < 600 && (await state(page)).mode !== "gameover"; i++) await playOn(page, 3000);
          expect((await state(page)).mode, "an idle player eventually loses the match").toBe("gameover");
          await emitFrame(page, `results-${viewport.name}`);
        } else {
          await page.tap("#aura-btn-play").catch(() => page.evaluate(() => (window as unknown as Win).__TOP_TENNIS_CONTROL__.startOffline()));
          await expect(page.locator("#match-hud")).not.toHaveClass(/hidden/, { timeout: 120_000 });
          await advance(page, 300);
          await emitFrame(page, `serve-${viewport.name}`);
        }

        const dc = await page.evaluate(() => (window as unknown as Win).__AURA_AURA_SLAM__?.diagnostics?.()?.drawCalls ?? null);
        const panel = await page.evaluate(() => document.body.innerText);
        console.log(`SLAMINT_METRICS ${JSON.stringify({ viewport: viewport.name, drawCalls: dc, diagTail: panel.slice(0, 600) })}`);
        expect(dc ?? 0, "draw calls > 0").toBeGreaterThan(0);
        expect(panel, "diagnostics show no shader failure").not.toMatch(/(compile|link) (error|fail)|shader.*fail/i);
        expect(bad, "every asset URL answers 200").toEqual([]);
        expect(errors, "no console errors").toEqual([]);
        await context.close();
      }
    } finally { await server.close(); }
  });

  test("the black-frame self-heal does not fire on a normally rendering page (no spurious reload)", async ({ page }) => {
    expect(existsSync(path.join(DIST, "apps/showcase-top-tennis/index.html"))).toBe(true);
    const server = await serveDist();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      const errors: string[] = [], bad: string[] = [];
      let navigations = 0;
      page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
      await open(page, server.origin, "?diag=1", errors, bad);
      const afterBoot = navigations;
      await page.click("#aura-btn-play");
      await expect(page.locator("#match-hud")).not.toHaveClass(/hidden/, { timeout: 120_000 });
      await page.waitForTimeout(30_000);
      const url = page.url();
      console.log(`SLAMINT_HEAL ${JSON.stringify({ navigationsAfterBoot: navigations - afterBoot, totalNavigations: navigations, url })}`);
      expect(navigations - afterBoot, "no reload while the game renders").toBe(0);
      expect(url, "no heal rung applied").not.toMatch(/a3d-qr|heal-rung/);
      expect(errors).toEqual([]);
    } finally { await server.close(); }
  });

  test("seeded scripted human plays full matches in a real browser; digests equal the original engine's golden", async ({ page }) => {
    const dev: ExampleDevServer = await startExampleDevServer();
    try {
      await page.addInitScript(() => { (globalThis as { __AURA_SLAM_NO_BOOT__?: boolean }).__AURA_SLAM_NO_BOOT__ = true; });
      await page.goto(`${dev.origin}/examples/aura-slam/`, { waitUntil: "domcontentloaded" });
      for (const entry of golden.scenarios) {
        const result = await page.evaluate(async ({ scenario, policySrc, rngSrc }) => {
          const specifier = "/examples/aura-slam/sim/create.ts";
          const { createMatchEngine } = await import(/* @vite-ignore */ specifier);
          const humanPolicy = new Function(`return ${policySrc}`)() as (e: any, r: () => number, t: number) => void;
          const mulberry32 = new Function(`return ${rngSrc}`)() as (s: number) => () => number;
          const fnv = (text: string): string => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
          const round = (_k: string, v: unknown): unknown => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v);
          const digest = (e: { snapshot(): unknown }): string => fnv(JSON.stringify(e.snapshot(), round));
          let events = 0;
          const engine = (createMatchEngine as any)({ ...scenario.options, onEvent: () => { events++; } });
          const rng = mulberry32(scenario.seed);
          const checkpoints: Array<{ tick: number; hash: string }> = [];
          let tick = 0;
          for (; tick < scenario.maxTicks; tick++) {
            humanPolicy(engine, rng, tick);
            engine.step(1 / 60);
            if (tick % scenario.every === 0) checkpoints.push({ tick, hash: digest(engine) });
            if (engine.state.mode === "gameover") break;
          }
          const s = engine.state;
          return { checkpoints, final: { tick, mode: s.mode, winner: s.winner ?? null, games: [s.score.playerGames, s.score.aiGames], events, hash: digest(engine) } };
        }, { scenario: entry.scenario, policySrc: humanPolicy.toString(), rngSrc: mulberry32.toString() });
        console.log(`SLAMINT_AUTOPLAY ${JSON.stringify({ options: entry.scenario.options, final: result.final })}`);
        expect(result.final, JSON.stringify(entry.scenario.options)).toEqual(entry.result.final);
        expect(result.checkpoints).toEqual(entry.result.checkpoints);
      }
    } finally { await dev.close(); }
  });
});
