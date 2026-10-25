import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Apex Overdrive screenshot retake (served from apps/showcase-roadster-rush through the dev server). Remote only. Frames: `@@SC apex-overdrive <name> <i> <n> <b64>`. */

const emit = (name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC apex-overdrive ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};
const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

type G = { game: { manual: boolean; mode: string; start(): void; simStep(dt: number): void; triggerAction(a: string, o?: unknown): unknown; gameOver?: () => void } };
const run = (page: Page, steps: number) => page.evaluate((n) => { const g = (window as unknown as { __GAME__: G }).__GAME__.game; g.manual = true; for (let i = 0; i < n; i++) g.simStep(1 / 60); g.manual = true; }, steps);


const snap = async (page: Page, name: string): Promise<void> => {
  const frames = () => page.evaluate(() => (window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);
  const before = await frames();
  await page.evaluate(() => (window as unknown as { __AURA3D_SHOWCASE_ROADSTER_RUSH__?: { app?: { step(dt: number): void } } }).__AURA3D_SHOWCASE_ROADSTER_RUSH__?.app?.step(1 / 60));
  try { await page.waitForFunction((n) => ((window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= n + 3, before, { timeout: 5 * 60_000, polling: 500 }); } catch { /* capture anyway */ }
  await page.waitForTimeout(500);
  emit(name, await page.screenshot({ type: "jpeg", quality: 90 }));
};

test.describe("shotsc apex", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [mode, w, h] of [["desktop", 1280, 720], ["mobile", 390, 844]] as const) {
    test(`apex ${mode}`, async ({ browser }) => {
      const tag = `${w}x${h}`;
      const errors: string[] = [];
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
      page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      await page.goto(`${server.origin}/apps/showcase-roadster-rush/?seed=42`, { waitUntil: "domcontentloaded" });
      let ready = true;
      try { await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 1_500_000, polling: 1000 }); } catch { ready = false; }
      process.stdout.write(`@@SCSTATE apex-overdrive ${tag} ready=${ready}\n`);
      if (ready) {
        await page.waitForTimeout(1500);
        await snap(page, `title.${tag}`);
        await page.evaluate(() => { const g = (window as unknown as { __GAME__: G }).__GAME__.game; g.manual = true; g.mode = "title"; g.start(); g.manual = true; });
        await run(page, 60); await snap(page, `gameplay-early.${tag}`);
        await page.evaluate(() => { const w = window as unknown as { __GAME__: G; __AURA3D_SHOWCASE_ROADSTER_RUSH__: { triggerScenario(n: string): void } }; w.__GAME__.game.triggerAction("pickup", { kind: "shield" }); w.__AURA3D_SHOWCASE_ROADSTER_RUSH__.triggerScenario("ramp"); w.__GAME__.game.manual = true; });
        await run(page, 30); await snap(page, `key-ramp.${tag}`);
        if (mode === "desktop") {
          await run(page, 480); await snap(page, `mid-drive.${tag}`);
          const ended = await page.evaluate(() => { const g = (window as unknown as { __GAME__: G }).__GAME__.game as unknown as { gameOver: () => void; mode: string; manual: boolean }; try { g.gameOver(); g.manual = true; return g.mode; } catch (e) { return `ERR ${String(e)}`; } });
          process.stdout.write(`@@SCSTATE apex-overdrive ${tag} results mode=${ended}\n`);
          await run(page, 2); await snap(page, `results.${tag}`);
        }
      }
      await page.close();
      process.stdout.write(`@@SCERRORS apex-overdrive ${tag} ${JSON.stringify(errors.slice(0, 8))}\n`);
      expect(true).toBe(true);
    });
  }

  for (const dsf of [1, 2] as const) {
    test(`apex card ${dsf}x`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: dsf });
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/apps/showcase-roadster-rush/?seed=42`, { waitUntil: "domcontentloaded" });
      let ready = true;
      try { await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 1_500_000, polling: 1000 }); } catch { ready = false; }
      if (ready) {
        await page.evaluate(() => { const w = window as unknown as { __GAME__: G; __AURA3D_SHOWCASE_ROADSTER_RUSH__: { triggerScenario(n: string): void } }; const g = w.__GAME__.game; g.manual = true; g.mode = "title"; g.start(); g.triggerAction("pickup", { kind: "shield" }); w.__AURA3D_SHOWCASE_ROADSTER_RUSH__.triggerScenario("ramp"); g.manual = true; });
        await run(page, 90); await snap(page, `card.${dsf}x`);
      } else process.stdout.write(`@@SCSTATE apex-overdrive card.${dsf}x NOT-READY\n`);
      await ctx.close();
    });
  }
});
