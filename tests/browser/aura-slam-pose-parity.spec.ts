import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * M-POSE render parity: the athlete posed by the REAL original adapter code and by the native port must render the same
 * pixels (same app, camera, lights). Remote only (tools/remote-acr/run.sh); never local Playwright.
 */
const LAB = "/examples/aura-slam/view/rigparity/";
type Result = { name: string; width: number; height: number; differing: number; maxDelta: number; litPixels: number; darker: number; lighter: number };
type Win = Window & { __RIG_PARITY__?: { ready: boolean; count: number; names: string[]; compare(i: number): Promise<Result> }; __RIG_PARITY_ERROR__?: string };

test.describe("aura-slam-pose-parity", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("native rig renders identically to the original adapter code at every fixed pose", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 200)}`); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as Win).__RIG_PARITY__?.ready) || Boolean((window as unknown as Win).__RIG_PARITY_ERROR__), undefined, { timeout: 600_000 });
    const err = await page.evaluate(() => (window as unknown as Win).__RIG_PARITY_ERROR__);
    expect(err, `harness error: ${err}`).toBeUndefined();
    const count = await page.evaluate(() => (window as unknown as Win).__RIG_PARITY__!.count);
    expect(count).toBeGreaterThanOrEqual(18);
    const results: Result[] = [];
    for (let i = 0; i < count; i++) {
      const r = await page.evaluate((idx) => (window as unknown as Win).__RIG_PARITY__!.compare(idx), i);
      results.push(r);
      process.stdout.write(`@@RIG_PARITY ${JSON.stringify(r)}\n`);
    }
    for (const r of results) {
      expect(r.litPixels, `${r.name}: the athlete must actually render (pixels differing from the empty scene)`).toBeGreaterThan(1500);
      expect(r.differing, `${r.name}: ${r.differing} pixels differ (max channel delta ${r.maxDelta})`).toBe(0);
    }
    process.stdout.write(`@@RIG_PROBLEMS ${JSON.stringify(problems)}\n`);
    expect(problems).toEqual([]);
  });

  test("footprint probe: how much of the frame changes when the athlete is added, with and without sun shadows", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    for (const shadow of ["on", "off"]) {
      await page.goto(`${server.origin}${LAB}${shadow === "off" ? "?shadow=0" : ""}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as Win).__RIG_PARITY__?.ready) || Boolean((window as unknown as Win).__RIG_PARITY_ERROR__), undefined, { timeout: 600_000 });
      for (const idx of [0, 2, 12]) {
        const r = await page.evaluate((i) => (window as unknown as Win).__RIG_PARITY__!.compare(i), idx);
        process.stdout.write(`@@RIG_FOOTPRINT shadow=${shadow} ${JSON.stringify(r)}\n`);
        expect(r.differing).toBe(0);
      }
    }
  });
});
