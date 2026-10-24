import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * The black-frame guard must fire only for a scene that draws but outputs black: not for a dim valid scene, and not
 * for a slow load with the overlay still up. Remote only (tools/remote-acr/run.sh); never local Playwright.
 */
const LAB = "/examples/selfheal-lab/";
type Observation = { calls: number; readyAtCall: number | null; samples: number; blackSamples: number; healthy: boolean; skipped: { notReady: number }; lastStats?: { litFraction: number; max: number }; reason?: string };
type Lab = { mode: string; frames: number; running: boolean; overlayVisible: boolean; rung: () => number; observation: () => Observation | null };
type Win = Window & { __SELFHEAL_LAB__?: Lab; __SELFHEAL_LAB_ERROR__?: string };

test.describe("black-frame guard fires only for black output", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  const snapshot = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const w = window as unknown as Win;
      const o = w.__SELFHEAL_LAB__?.observation() ?? null;
      return { error: w.__SELFHEAL_LAB_ERROR__, frames: w.__SELFHEAL_LAB__?.frames ?? 0, running: w.__SELFHEAL_LAB__?.running ?? false, overlay: w.__SELFHEAL_LAB__?.overlayVisible ?? false, rung: w.__SELFHEAL_LAB__?.rung() ?? -1, observation: o, search: location.search };
    });

  test("black output (draws, every pixel black): reloads one rung down and records why", async ({ page }) => {
    await page.goto(`${server.origin}${LAB}?mode=black`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/a3d-qr=game/, { timeout: 780_000 });
    await page.waitForFunction(() => Boolean((window as unknown as Win).__SELFHEAL_LAB__), undefined, { timeout: 60_000 });
    const after = await snapshot(page);
    process.stdout.write(`@@SELFHEAL black ${JSON.stringify(after)}\n`);
    expect(after.search).toContain("a3d-qr=game%2C-vfxFog");
    expect(after.rung).toBeGreaterThanOrEqual(1);
    const reason = await page.evaluate(() => sessionStorage.getItem("aura3d-heal:/examples/selfheal-lab/:reason"));
    expect(reason, "the reason for the reload is recorded").toMatch(/black for \d+ samples/);
  });

  test("dark but valid scene: never reloads and samples as lit", async ({ page }) => {
    await page.goto(`${server.origin}${LAB}?mode=dark`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => ((window as unknown as Win).__SELFHEAL_LAB__?.frames ?? 0) >= 300 && ((window as unknown as Win).__SELFHEAL_LAB__?.observation()?.samples ?? 0) >= 4, undefined, { timeout: 780_000 });
    const s = await snapshot(page);
    process.stdout.write(`@@SELFHEAL dark ${JSON.stringify(s)}\n`);
    expect(s.error).toBeUndefined();
    expect(s.search).not.toContain("a3d-qr");
    expect(s.rung).toBe(0);
    expect(s.observation!.lastStats!.litFraction, "a dark scene with real content is mostly lit texels, never black").toBeGreaterThan(0.5);
    expect(s.observation!.blackSamples).toBe(0);
  });

  test("slow load (overlay up, canvas black for 12 s): never reloads, judges only after the overlay is gone", async ({ page }) => {
    await page.goto(`${server.origin}${LAB}?mode=slow&slowMs=12000`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => ((window as unknown as Win).__SELFHEAL_LAB__?.frames ?? 0) >= 120, undefined, { timeout: 300_000 });
    const during = await snapshot(page);
    process.stdout.write(`@@SELFHEAL slow-during ${JSON.stringify(during)}\n`);
    if (during.overlay) {
      expect(during.search).not.toContain("a3d-qr");
      expect(during.observation!.skipped.notReady).toBeGreaterThan(20);
      expect(during.observation!.readyAtCall).toBeNull();
    }
    await page.waitForFunction(() => { const l = (window as unknown as Win).__SELFHEAL_LAB__; return Boolean(l?.running) && (l?.observation()?.samples ?? 0) >= 4; }, undefined, { timeout: 780_000 });
    const after = await snapshot(page);
    process.stdout.write(`@@SELFHEAL slow-after ${JSON.stringify(after)}\n`);
    expect(after.error).toBeUndefined();
    expect(after.search).not.toContain("a3d-qr");
    expect(after.rung).toBe(0);
    expect(after.observation!.lastStats!.litFraction).toBeGreaterThan(0.05);
  });
});
