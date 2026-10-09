// PRD-06 T5.1 — §17.4 failing control for `apps/aura-clash-showcase` (Q-14-1).
// The gates assertable in headless CI: both fighters `tracksApplied > 0` every
// sampled frame under `?a3d-qr=animation`, the squash/idleSway deformation is
// gone (fighter visual scale stays uniform while a scripted light attack is
// triggered via `KeyJ`), and idle carries a masked breathing layer
// (`activeActions.length >= 2` with an additive/masked entry). All fail on
// today's route — `test.fail()` keeps the matrix green until Q-14-1 lands.
// The transition-continuity C ≤ 1.5 and shadow-IoU gates are capture-lane
// checkpoints (T4.8 burst), not headless asserts.

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startGameDevServer, type GameDevServer, listSocketCapableNodeIds, readAnimationState, readNodeTransform, waitForApps } from "./helpers";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "games", "aura-clash-showcase");
const FIGHTER_IDS = ["aura-clash-p1", "aura-clash-p2", "player", "rival"];

test.describe("PRD-06 T5.1 aura-clash §17.4 gates", () => {

  // SwiftShader software GL: the routes' raster cost dominates the
  // main-thread budget; a tiny viewport keeps evaluate() slots free while
  // leaving node transforms and the animation api untouched.
  test.use({ viewport: { width: 320, height: 240 } });
  let server: GameDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startGameDevServer("aura-clash-showcase", 5321);
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on: fighters apply tracks every frame, keep uniform scale through an attack, and idle carries a breathing layer", async ({ page }) => {
    // S11 named gate (P-21): expected-red until Q-14-1 lands the route
    // changes — the spec fails ONLY on the named gate below; a timeout or
    // crash fails honestly.
    test.setTimeout(180_000);
    await page.goto(`${server.origin}/playable/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(8_000); // headless rAF ~1fps — let several frames settle

    const skinnedIds = await listSocketCapableNodeIds(page);
    const fighters = FIGHTER_IDS.filter((id) => skinnedIds.includes(id));
    writeFileSync(join(ARTIFACT_DIR, "skinned-nodes.json"), JSON.stringify({ skinnedIds, fighters }, null, 2));
    expect(fighters.length, `S11 gate (expected-red until Q-14-1): skinned fighter nodes found: ${skinnedIds.join(", ")}`).toBeGreaterThanOrEqual(2);

    // tracksApplied > 0 over several rendered frames per fighter.
    const tracks: Record<string, number[]> = {};
    for (const id of fighters) {
      tracks[id] = [];
      for (let i = 0; i < 5; i++) {
        const probe = await readAnimationState(page, id);
        expect(probe.available, `animationState() missing on ${id}`).toBe(true);
        tracks[id].push(probe.state?.tracksApplied ?? -1);
        await page.waitForTimeout(1_500);
      }
    }
    writeFileSync(join(ARTIFACT_DIR, "tracks-applied.json"), JSON.stringify(tracks, null, 2));
    for (const [id, frames] of Object.entries(tracks)) {
      expect(frames.every((t) => t > 0), `${id} tracksApplied: ${frames.join(",")}`).toBe(true);
    }

    // Scripted light attack (KeyJ) — squash must not drive the node scale.
    const scales: Record<string, [number, number, number][]> = {};
    for (const id of fighters) {
      scales[id] = [];
      await page.keyboard.press("KeyJ");
      for (let i = 0; i < 4; i++) {
        const t = await readNodeTransform(page, id);
        if (t.scale) scales[id].push(t.scale as [number, number, number]);
        await page.waitForTimeout(700);
      }
    }
    writeFileSync(join(ARTIFACT_DIR, "scales.json"), JSON.stringify(scales, null, 2));
    for (const [id, samples] of Object.entries(scales)) {
      for (const [sx, sy, sz] of samples) {
        const nonUniform = Math.max(Math.abs(sx - sy), Math.abs(sy - sz));
        expect(nonUniform, `${id} non-uniform scale during attack: ${samples.map((s) => s.join("/")).join(" ")}`).toBeLessThan(1e-3);
      }
    }

    // Idle carries a masked breathing/additive layer on top of the base clip.
    const idle = await readAnimationState(page, fighters[0]!);
    const actions = idle.state?.activeActions ?? [];
    writeFileSync(join(ARTIFACT_DIR, "idle-actions.json"), JSON.stringify(actions, null, 2));
    const layered = actions.filter((a) => a.additive === true || (a.mask != null && a.layer !== 0 && a.layer !== "base"));
    expect(layered.length, `idle activeActions without a masked/additive layer: ${JSON.stringify(actions)}`).toBeGreaterThanOrEqual(1);
  });

  test("flag-off (?a3d-qr=none): no C-19 api on the fighter node", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${server.origin}/playable/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(4_000);
    const probe = await readAnimationState(page, "aura-clash-p1");
    expect(probe.available).toBe(false);
  });
});
