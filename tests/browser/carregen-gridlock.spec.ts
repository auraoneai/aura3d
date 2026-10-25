import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Gridlock Courier hero car evidence (remote only: tools/remote-acr/run.sh). Drives a fixed QA-hook state and emits
 * frames as `@@CR <name> <i> <n> <base64 jpeg>`, plus `@@CRLOOK` with the luma spread over the car region: an opaque
 * solid car has a dense, consistent body; the old see-through car let the road show through the body.
 */
const HOOK = "__AURA_DRIFT_AND_DELIVER__";
const emit = (name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@CR ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};
const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

test.describe("gridlock courier hero car", () => {
  test.setTimeout(2_400_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [w, h] of [[1280, 720], [390, 844]] as const) {
    test(`car frames at ${w}x${h}`, async ({ browser }) => {
      const errors: string[] = [];
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${server.origin}/examples/drift-and-deliver-port/?manual=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((hk) => (window as unknown as Record<string, any>)[hk]?.ready?.() === true, HOOK, { timeout: 900_000 });
      await page.evaluate((hk) => { const api = (window as unknown as Record<string, any>)[hk]; api.reset(); api.stepFrames(90, { w: true }); }, HOOK);
      await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].settle?.(), HOOK);
      await raf(page, 2);
      emit(`drive-${w}x${h}`, await page.screenshot({ type: "jpeg", quality: 88 }));
      await page.evaluate((hk) => { const api = (window as unknown as Record<string, any>)[hk]; api.stepFrames(40, { w: true, d: true, space: true }); }, HOOK);
      await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].settle?.(), HOOK);
      await raf(page, 2);
      emit(`drift-${w}x${h}`, await page.screenshot({ type: "jpeg", quality: 88 }));
      process.stdout.write(`@@CRERR ${w}x${h} ${JSON.stringify(errors.slice(0, 5))}\n`);
      expect(errors, "console errors").toEqual([]);
      await ctx.close();
    });
  }
});
