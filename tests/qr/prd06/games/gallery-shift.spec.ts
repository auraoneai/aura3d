// PRD-06 T5.6 — §17.4 failing control for `apps/showcase-gallery-shift`
// (Q-14-6). Gates: the thief node carries a bound skeleton (today it is the
// 72-triangle voxel figure — no `socket("Hips")`), and sprint vs sneak remain
// distinct gaits (the T0.17 hip-height gate already proves the clips differ
// under `?a3d-qr=animation`; the failing part here is the rigged thief).

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startGameDevServer, type GameDevServer, findHipsBone, readAnimationState, socketValid, waitForApps, waitForHook, pumpFrames } from "./helpers";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "games", "gallery-shift");
const PUMP = "__GS_PUMP__";

test.describe("PRD-06 T5.6 gallery-shift §17.4 gates", () => {

  // SwiftShader software GL: the routes' raster cost dominates the
  // main-thread budget; a tiny viewport keeps evaluate() slots free while
  // leaving node transforms and the animation api untouched.
  test.use({ viewport: { width: 320, height: 240 } });
  let server: GameDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startGameDevServer("showcase-gallery-shift", 5326);
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on: thief + both guards are clip-driven rigged characters", async ({ page }) => {
    // Expected to FAIL until Q-14-6 swaps the voxel thief and the archive
    // guard-1 sentry for C-17-admitted rigs — S11 failing control. (guard-2's
    // tracksApplied leg already passes under the lane flag; T0.17's gait spec
    // covers the sprint-vs-sneak hip-height gate.)
    test.fail();
    test.setTimeout(180_000);
    await page.goto(`${server.origin}/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await waitForHook(page, PUMP);
    await pumpFrames(page, PUMP, 6);

    const hips = await findHipsBone(page, "thief");
    writeFileSync(join(ARTIFACT_DIR, "thief-hips.json"), JSON.stringify({ hips }, null, 2));
    expect(hips, "thief has no Hips socket — still the voxel figure, not a rigged character").not.toBeNull();
    expect(await socketValid(page, "thief", hips!), `thief socket("${hips}") invalid`).toBe(true);

    for (const id of ["thief", "guard-1", "guard-2"]) {
      const probe = await readAnimationState(page, id);
      expect(probe.available, `animationState() missing on ${id}`).toBe(true);
      expect(probe.state?.tracksApplied ?? 0, `${id} tracksApplied`).toBeGreaterThan(0);
    }
  });

  test("flag-off (?a3d-qr=none): no C-19 api on the thief node", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${server.origin}/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await waitForHook(page, PUMP);
    await pumpFrames(page, PUMP, 4);
    const probe = await readAnimationState(page, "thief");
    expect(probe.available).toBe(false);
  });
});
