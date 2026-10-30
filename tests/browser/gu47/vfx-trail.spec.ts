import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 WP-6 (E-F) receipt `vfx-trail` (PRD acceptance: ribbon >= 30 m long behind a moving node, no
 * `VFX_TRAIL_PENDING`). Remote only, phase 2:
 *   RUN_ID=gu47-vfx-trail SPECS='tests/browser/gu47/vfx-trail.spec.ts' tools/remote-acr/run.sh
 * A sphere runs at 25 m/s along a 80 m track; `app.effects.trail(runner, { width: 0.6, life: 1.5 })` follows it.
 * Software WebGL2: one presented frame advances at most 0.1 s, so the spec polls until the ribbon is long enough.
 * Output: `RECEIPT vfx-trail <json>` in the log and the frame under tests/reports/gu47/ (commit to
 * evidence/receipts/vfx-trail/ with `git add -f`).
 */

test.describe("GU47 E-F receipt vfx-trail", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("a ribbon at least 30 m long follows the moving node", async ({ page }) => {
    test.setTimeout(1_200_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/tests/browser/gu47/vfx-receipts-harness.html?mode=trail&vfxdebug=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_GU47_VFX__?.status === "ready" || window.__AURA3D_GU47_VFX__?.status === "error", undefined, { timeout: 300_000 });
    await page.waitForFunction(() => (window.__AURA3D_GU47_VFX__?.trail?.length ?? 0) >= 30, undefined, { timeout: 900_000, polling: 1000 });

    const harness = await page.evaluate(() => window.__AURA3D_GU47_VFX__);
    const debug = await page.evaluate(() => (window as unknown as { __AURA_VFX_DEBUG__?: () => { notes: { code: string }[]; trails: { length: number }[] } }).__AURA_VFX_DEBUG__?.());
    mkdirSync(resolve("tests/reports/gu47"), { recursive: true });
    await page.screenshot({ path: resolve("tests/reports/gu47/vfx-trail.png") });
    writeFileSync(resolve("tests/reports/gu47/vfx-trail.json"), `${JSON.stringify({ harness, debug, pageErrors }, null, 2)}\n`);
    console.log(`RECEIPT vfx-trail ${JSON.stringify({ length: harness?.trail?.length, points: harness?.trail?.pointCount, runnerX: harness?.runnerX })}`);

    expect(pageErrors).toEqual([]);
    expect(harness?.trail?.alive).toBe(true);
    expect(harness?.trail?.length ?? 0).toBeGreaterThanOrEqual(30);
    expect((debug?.notes ?? []).map((note) => note.code)).not.toContain("VFX_TRAIL_PENDING");
    expect(debug?.trails.some((trail) => trail.length >= 30)).toBe(true);
  });
});
