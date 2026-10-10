// PRD-06 T5.5 — §17.4 failing control for `apps/showcase-mech-hangar`
// (Q-14-5). Gates: mechs report `tracksApplied > 0` (rigid part assemblies
// today), at least one mech node carries a bound skeleton (socket valid —
// enabling the idle-vs-action limb Δ ≥ 15° gate), and walk SFX is driven by
// clip footstep events rather than the 0.42 s timer. The SFX-sync gate is a
// capture-lane checkpoint; the headless asserts are the two skeletal ones.

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startGameDevServer, type GameDevServer, listSocketCapableNodeIds, readAnimationState, waitForApps } from "./helpers";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "games", "mech-hangar");

test.describe("PRD-06 T5.5 mech-hangar §17.4 gates", () => {

  // SwiftShader software GL: the routes' raster cost dominates the
  // main-thread budget; a tiny viewport keeps evaluate() slots free while
  // leaving node transforms and the animation api untouched.
  test.use({ viewport: { width: 320, height: 240 } });
  let server: GameDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startGameDevServer("showcase-mech-hangar", 5325);
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on: a mech node applies tracks and carries a bound skeleton", async ({ page }) => {
    // S11 named gate (P-21): expected-red until Q-14-5 rigs the mechs — the
    // spec fails ONLY on the named gate below; a timeout or crash fails
    // honestly.
    test.setTimeout(180_000);
    await page.goto(`${server.origin}/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(6_000);

    // Any mounted mech part (mech-player-*/mech-rival-* or bare asset keys)
    // must expose the C-19 api and apply tracks once rigged.
    const skinnedIds = await listSocketCapableNodeIds(page);
    writeFileSync(join(ARTIFACT_DIR, "skinned-nodes.json"), JSON.stringify(skinnedIds, null, 2));
    const mechs = skinnedIds.filter((id) => /mech|chassis|legs|arms|weapon/i.test(id));
    expect(mechs.length, `S11 gate (expected-red until Q-14-5): no socket-capable mech nodes (rigged parts absent): ${skinnedIds.join(", ")}`).toBeGreaterThanOrEqual(1);

    const probe = await readAnimationState(page, mechs[0]!);
    writeFileSync(join(ARTIFACT_DIR, "state.json"), JSON.stringify(probe, null, 2));
    expect(probe.available, `animationState() missing on ${mechs[0]}`).toBe(true);
    expect(probe.state?.tracksApplied ?? 0, `tracksApplied on ${mechs[0]}`).toBeGreaterThan(0);
  });

  test("flag-off (?a3d-qr=none): no socket-capable mech node", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${server.origin}/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(3_000);
    const skinnedIds = await listSocketCapableNodeIds(page);
    expect(skinnedIds.filter((id) => /mech/i.test(id)).length).toBe(0);
  });
});
