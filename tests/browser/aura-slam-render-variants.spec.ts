import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Draw-call probe for render tuning variants (remote only): logs `SLAMVAR <variant> <json>` with drawCalls and the diag counters. */
const VARIANTS = ["", "cascades=1", "cascades=2", "cascades=1&rigshadows=full", "cascades=3"] as const;

test.describe("aura-slam render variants", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("draw calls per variant (hard court, 640x360)", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    for (const variant of VARIANTS) {
      await page.goto(`${server.origin}/examples/aura-slam/view/harness.html?venue=hard${variant ? `&${variant}` : ""}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as { __AURA_SLAM_RENDER__?: { ready(): boolean } }).__AURA_SLAM_RENDER__?.ready() === true, undefined, { timeout: 600_000 });
      await page.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { show(v: string): Promise<void> } }).__AURA_SLAM_RENDER__.show("hard"));
      await page.waitForFunction(() => ((window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null } }).__AURA_SLAM_RENDER__.drawCalls() ?? 0) > 0, undefined, { timeout: 600_000, polling: 1000 });
      await page.waitForTimeout(4000);
      const out = await page.evaluate(() => {
        const api = (window as unknown as { __AURA_SLAM_RENDER__: { drawCalls(): number | null; diag(): unknown } }).__AURA_SLAM_RENDER__;
        return { drawCalls: api.drawCalls(), diag: api.diag() };
      });
      console.log(`SLAMVAR ${variant || "default"} ${JSON.stringify(out)}`);
    }
  });
});
