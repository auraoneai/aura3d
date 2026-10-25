import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { emit, raf, say, shoot } from "./finc-lib";

/** Apex Overdrive final recapture (apps/showcase-roadster-rush through the example dev server). Remote only. */
const SLUG = "apex-overdrive";
type G = { game: { manual: boolean; mode: string; start(): void; simStep(dt: number): void; triggerAction(a: string, o?: unknown): unknown; gameOver?: () => void } };
const run = (page: Page, steps: number) => page.evaluate((n) => { const g = (window as unknown as { __GAME__: G }).__GAME__.game; g.manual = true; for (let i = 0; i < n; i++) g.simStep(1 / 60); g.manual = true; }, steps);
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);

const settleFrame = async (page: Page): Promise<void> => {
  const before = await frames(page);
  await page.evaluate(() => (window as unknown as { __AURA3D_SHOWCASE_ROADSTER_RUSH__?: { app?: { step(dt: number): void } } }).__AURA3D_SHOWCASE_ROADSTER_RUSH__?.app?.step(1 / 60));
  try { await page.waitForFunction((n) => ((window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } }).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= n + 3, before, { timeout: 5 * 60_000, polling: 500 }); } catch { /* capture anyway */ }
  await page.waitForTimeout(500);
};
const bootReady = async (page: Page): Promise<boolean> => {
  try { await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 1_500_000, polling: 1000 }); return true; } catch { return false; }
};
const URL = "/apps/showcase-roadster-rush/?seed=42";

test.describe("finc apex", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [mode, w, h] of [["desktop", 1280, 720], ["mobile", 390, 844]] as const) {
    test(`final apex ${mode}`, async ({ browser }) => {
      const tag = `${w}x${h}`;
      const errors: string[] = [];
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
      page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      await page.goto(`${server.origin}${URL}`, { waitUntil: "domcontentloaded" });
      const ready = await bootReady(page);
      say("SCSTATE", SLUG, { tag, state: "ready", ready });
      if (ready) {
        await page.waitForTimeout(1500);
        await settleFrame(page); await shoot(page, SLUG, tag, "title");
        await page.evaluate(() => { const g = (window as unknown as { __GAME__: G }).__GAME__.game; g.manual = true; g.mode = "title"; g.start(); g.manual = true; });
        await run(page, 60); await settleFrame(page); await shoot(page, SLUG, tag, "gameplay-early");
        await page.evaluate(() => { const w2 = window as unknown as { __GAME__: G; __AURA3D_SHOWCASE_ROADSTER_RUSH__: { triggerScenario(n: string): void } }; w2.__GAME__.game.triggerAction("pickup", { kind: "shield" }); w2.__AURA3D_SHOWCASE_ROADSTER_RUSH__.triggerScenario("ramp"); w2.__GAME__.game.manual = true; });
        await run(page, 30); await settleFrame(page); await shoot(page, SLUG, tag, "key-ramp");
        if (mode === "desktop") {
          await run(page, 480); await settleFrame(page); await shoot(page, SLUG, tag, "mid-drive");
          const ended = await page.evaluate(() => { const g = (window as unknown as { __GAME__: G }).__GAME__.game as unknown as { gameOver: () => void; mode: string; manual: boolean }; try { g.gameOver(); g.manual = true; return g.mode; } catch (e) { return `ERR ${String(e)}`; } });
          say("SCSTATE", SLUG, { tag, state: "results", mode: ended, forced: true });
          await run(page, 2); await settleFrame(page); await shoot(page, SLUG, tag, "results");
        }
      }
      await page.close();
      say("SCERRORS", SLUG, { tag, errors: errors.slice(0, 10) });
      expect(true).toBe(true);
    });
  }

  test("final apex card", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${server.origin}${URL}`, { waitUntil: "domcontentloaded" });
    if (await bootReady(page)) {
      await page.evaluate(() => { const w2 = window as unknown as { __GAME__: G; __AURA3D_SHOWCASE_ROADSTER_RUSH__: { triggerScenario(n: string): void } }; const g = w2.__GAME__.game; g.manual = true; g.mode = "title"; g.start(); g.triggerAction("pickup", { kind: "shield" }); w2.__AURA3D_SHOWCASE_ROADSTER_RUSH__.triggerScenario("ramp"); g.manual = true; });
      await run(page, 90); await settleFrame(page);
      await shoot(page, SLUG, "1440x900", "card.2x");
      const png = await page.screenshot({ type: "png" });
      const b64 = await page.evaluate(async (p) => {
        const img = new Image(); img.src = `data:image/png;base64,${p}`; await img.decode();
        const c = document.createElement("canvas"); c.width = 720; c.height = 450;
        const g2 = c.getContext("2d")!; g2.imageSmoothingQuality = "high"; g2.drawImage(img, 0, 0, 720, 450);
        return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
      }, png.toString("base64"));
      emit(SLUG, "card.1x", Buffer.from(b64, "base64"));
    } else say("SCSTATE", SLUG, { tag: "card", state: "NOT-READY" });
    await ctx.close();
  });
});
