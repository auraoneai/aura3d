// PRD-06 T5.3 — §17.4 failing control for `apps/showcase-skyline-runner`
// (Q-14-3). Gates: the hero GLB passes `hero-character` (T4.6 — today the
// 4-triangle card is rejected with exactly four codes), `tracksApplied > 0`
// during locomotion, and the run foot-slide ≤ 3 cm gate (socket-based —
// asserts a bound skeleton is present). All fail on today's route.

import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startGameDevServer, type GameDevServer } from "./helpers";
import { validateHeroGlb } from "../../../../packages/aura3d-cli/src/commands/prd06/validateHero.js";
import { listSocketCapableNodeIds, readAnimationState, waitForApps } from "./helpers";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "games", "skyline-runner");
const HERO_GLB = resolve(process.cwd(), "apps/showcase-skyline-runner/generated/skylineArcticRunner.glb");

test.describe("PRD-06 T5.3 skyline-runner §17.4 gates", () => {

  // SwiftShader software GL: the routes' raster cost dominates the
  // main-thread budget; a tiny viewport keeps evaluate() slots free while
  // leaving node transforms and the animation api untouched.
  test.use({ viewport: { width: 320, height: 240 } });
  let server: GameDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startGameDevServer("showcase-skyline-runner", 5323);
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on: hero passes hero-character, tracks apply, foot skeleton bound", async ({ page }) => {
    // Expected to FAIL until Q-14-3 lands a C-17-admitted rigged hero — S11.
    test.fail();
    test.setTimeout(180_000);

    // Asset-level gate (runs in node — the mounted hero asset itself).
    const report = validateHeroGlb(new Uint8Array(readFileSync(HERO_GLB)));
    writeFileSync(join(ARTIFACT_DIR, "hero-validator.json"), JSON.stringify({ ok: report.ok, reasonCodes: report.reasonCodes }, null, 2));
    expect(report.ok, `skyline hero fails hero-character: ${report.reasonCodes.join(", ")}`).toBe(true);

    // Runtime gate: the player node carries a bound skeleton and applies tracks.
    await page.goto(`${server.origin}/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(6_000);
    await page.evaluate(() => (window as unknown as Record<string, ((f: number) => number) | undefined>)["__AURA3D_SKYLINE_PUMP__"]?.(6));

    const skinnedIds = await listSocketCapableNodeIds(page);
    writeFileSync(join(ARTIFACT_DIR, "skinned-nodes.json"), JSON.stringify(skinnedIds, null, 2));
    expect(skinnedIds.length, `no socket-capable nodes — hero has no bound skeleton: ${skinnedIds.join(", ")}`).toBeGreaterThanOrEqual(1);

    const probe = await readAnimationState(page, skinnedIds[0]!);
    writeFileSync(join(ARTIFACT_DIR, "state.json"), JSON.stringify(probe, null, 2));
    expect(probe.available, `animationState() missing on ${skinnedIds[0]}`).toBe(true);
    expect(probe.state?.tracksApplied ?? 0, `tracksApplied on ${skinnedIds[0]}`).toBeGreaterThan(0);
  });

  test("flag-off (?a3d-qr=none): no C-19 api on the hero node", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`${server.origin}/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(3_000);
    const skinnedIds = await listSocketCapableNodeIds(page);
    const probe = await readAnimationState(page, skinnedIds[0] ?? "skyline-player");
    expect(probe.available).toBe(false);
  });
});
