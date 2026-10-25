import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Representative smoke for the port-kit migration (model loader, shared black-frame guard, cue bank): each port boots on
 * software WebGL2 through the example dev server, takes a gesture (which creates the audio graph and the cue bank), and
 * reports console errors, failed requests and the median / max GL draw calls per animation frame before and after the
 * gesture. Run it on the base tree and on the migrated tree and compare the PCKITS_JSON lines.
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright.
 */
const PORTS = [
  "drift-and-deliver-port", "last-train-port", "ninja-runner-port", "strange-orbit-port",
  "splat-rush-port", "where-the-wind-wanders-port", "roadster-hours-port", "silt-and-signal-port"
];
const BOOT_WAIT_MS = 14_000;
const WINDOW_MS = 6_000;

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

async function frameWindow(page: Page, ms: number): Promise<{ frames: number; median: number; max: number }> {
  await page.evaluate(() => { (window as unknown as { __pckitsFrames: number[] }).__pckitsFrames = []; });
  await page.waitForTimeout(ms);
  const frames = await page.evaluate(() => (window as unknown as { __pckitsFrames: number[] }).__pckitsFrames.slice());
  return { frames: frames.length, median: median(frames), max: frames.length ? Math.max(...frames) : 0 };
}

test.describe("port kit migration smoke", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const port of PORTS) {
    test(`boots with no console errors: ${port}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const badResponses: string[] = [];
      const compat: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 240));
        if (/SAFETY_COMPAT_MODE|SAFETY_BLACK_FRAME|self.?heal/i.test(m.text())) compat.push(m.text().slice(0, 160));
      });
      page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 240)));
      page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 140)}`); });
      await page.setViewportSize({ width: 320, height: 240 });
      await page.addInitScript(() => {
        const w = window as unknown as { __pckitsDraws: number; __pckitsFrames: number[] };
        w.__pckitsDraws = 0;
        w.__pckitsFrames = [];
        for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype] as Array<Record<string, unknown>>) {
          for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
            const original = proto[name] as ((...args: unknown[]) => unknown) | undefined;
            if (!original) continue;
            proto[name] = function (this: unknown, ...args: unknown[]) { w.__pckitsDraws++; return original.apply(this, args); };
          }
        }
        let last = 0;
        const tick = (): void => {
          if (w.__pckitsFrames.length < 4000) w.__pckitsFrames.push(w.__pckitsDraws - last);
          last = w.__pckitsDraws;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.goto(`${server.origin}/examples/${port}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas", { timeout: 300_000 });
      await page.waitForTimeout(BOOT_WAIT_MS);
      const before = await frameWindow(page, WINDOW_MS);

      await page.mouse.click(160, 120);
      for (const key of ["Enter", "Space"]) { await page.keyboard.press(key); await page.waitForTimeout(250); }
      await page.waitForTimeout(1_500);
      const after = await frameWindow(page, WINDOW_MS);

      const result = { port, consoleErrors, pageErrors, badResponses: badResponses.slice(0, 8), compat, before, after };
      console.log(`PCKITS_JSON ${JSON.stringify(result)}`);
      expect(pageErrors, JSON.stringify(pageErrors)).toEqual([]);
      expect(consoleErrors, JSON.stringify(consoleErrors)).toEqual([]);
      expect(before.max, "the scene drew").toBeGreaterThan(0);
    });
  }
});
