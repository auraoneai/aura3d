import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Regression for the 4.1.2 misfire: the black-frame guard read a REAL WebGL canvas (no preserveDrawingBuffer) from tasks in
 * which nothing had been drawn and reloaded healthy games. Here the page has a real WebGL2 context, a HUD callback that never
 * draws and a game loop that does, in several draw patterns. Remote only (tools/remote-acr/run.sh); never local Playwright.
 */
const LAB = "/examples/guard-canvas-lab/";
type Obs = { calls: number; samples: number; blackSamples: number; healthy: boolean; lastStats?: { litFraction: number; max: number; mean: number }; reason?: string };
type Lab = { mode: string; frames: number; draws: number; error?: string; rung: () => number; observation: () => Obs | null };

test.describe("black-frame guard on a real WebGL2 canvas", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  const snapshot = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const lab = (window as unknown as { __GUARD_LAB__?: Lab }).__GUARD_LAB__;
      return { error: lab?.error, frames: lab?.frames ?? 0, draws: lab?.draws ?? 0, rung: lab?.rung() ?? -1, obs: lab?.observation() ?? null, search: location.search };
    });

  for (const variant of [
    { name: "raf, every frame", query: "mode=lit" },
    { name: "raf, draws every 4th callback", query: "mode=lit&drawEvery=4" },
    { name: "timer-driven draws (not in a rAF task)", query: "mode=lit&pattern=timer" },
    { name: "offscreen pass first, default framebuffer in a later callback", query: "mode=lit&pattern=fbo" },
    { name: "dark but valid scene", query: "mode=dark" }
  ]) {
    test(`healthy: ${variant.name} never reloads and samples as lit`, async ({ page }) => {
      await page.goto(`${server.origin}${LAB}?${variant.query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => ((window as unknown as { __GUARD_LAB__?: Lab }).__GUARD_LAB__?.draws ?? 0) >= 150, undefined, { timeout: 600_000 });
      await page.waitForTimeout(8000);
      const s = await snapshot(page);
      process.stdout.write(`@@GUARDCANVAS ${variant.name} ${JSON.stringify(s)}\n`);
      expect(s.error).toBeUndefined();
      expect(s.search).not.toContain("a3d-qr");
      expect(s.rung).toBe(0);
      expect(s.obs!.samples, "the guard actually sampled frames").toBeGreaterThan(3);
      expect(s.obs!.blackSamples, "no sample of a healthy frame read black").toBe(0);
      expect(s.obs!.lastStats!.litFraction).toBeGreaterThan(0.5);
    });
  }

  test("a scene that draws but outputs black reloads exactly once, one rung down, and records why", async ({ page }) => {
    const navs: string[] = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(server.origin, "")); });
    await page.goto(`${server.origin}${LAB}?mode=black`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/a3d-qr=game/, { timeout: 780_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __GUARD_LAB__?: Lab }).__GUARD_LAB__), undefined, { timeout: 60_000 });
    const s = await snapshot(page);
    process.stdout.write(`@@GUARDCANVAS black ${JSON.stringify({ navs, ...s })}\n`);
    expect(navs[0], "the first load is the plain page").toBe(`${LAB}?mode=black`);
    expect(navs[1], "the first reload is exactly one rung down").toContain("a3d-qr=game%2C-vfxFog");
    expect(navs[1], "...and not two").not.toContain("-post");
    expect(s.rung).toBeGreaterThanOrEqual(1);
    const reason = await page.evaluate(() => sessionStorage.getItem("aura3d-heal:/examples/guard-canvas-lab/:reason"));
    expect(reason).toMatch(/black for \d+ samples/);
  });
});
