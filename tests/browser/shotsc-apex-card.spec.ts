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

  for (const dsf of [1, 2] as const) {
    test(`apex card ${dsf}x`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: dsf });
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/apps/showcase-roadster-rush/?seed=42`, { waitUntil: "domcontentloaded" });
      let ready = true;
      try { await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 1_500_000, polling: 1000 }); } catch { ready = false; }
      if (ready) {
        await page.evaluate(() => { const w = window as unknown as { __GAME__: G; __AURA3D_SHOWCASE_ROADSTER_RUSH__: { triggerScenario(n: string): void } }; const g = w.__GAME__.game; g.manual = true; g.mode = "title"; g.start(); g.manual = true; });
        await run(page, 45); await snap(page, `card.${dsf}x`);
      } else process.stdout.write(`@@SCSTATE apex-overdrive card.${dsf}x NOT-READY\n`);
      await ctx.close();
    });
  }
});
