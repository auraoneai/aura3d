// PRD-06 T5.4 — §17.4 failing control for `apps/showcase-neon-swarm`
// (Q-14-4). Gates: `neonCourierAvatar` passes `hero-character` (today it is
// unskinned), `neon-player` carries a bound skeleton, a fire layer on the
// upper body coexists with the lower-body run (`activeActions` on ≥ 2 masked
// layers while moving + firing), and the `sin(t*9)*0.04` bob is deleted —
// courier core-ring y variance ≈ 0. All fail today.

import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startGameDevServer, type GameDevServer } from "./helpers";
import { validateHeroGlb } from "../../../../packages/aura3d-cli/src/commands/prd06/validateHero.js";
import { readAnimationState, readNodeTransform, socketValid, waitForApps, range } from "./helpers";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "games", "neon-swarm");
const COURIER_GLB = resolve(process.cwd(), "apps/showcase-neon-swarm/assets/models/neonCourierAvatar.glb");

test.describe("PRD-06 T5.4 neon-swarm §17.4 gates", () => {

  // SwiftShader software GL: the routes' raster cost dominates the
  // main-thread budget; a tiny viewport keeps evaluate() slots free while
  // leaving node transforms and the animation api untouched.
  test.use({ viewport: { width: 320, height: 240 } });
  let server: GameDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startGameDevServer("showcase-neon-swarm", 5324);
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on: courier passes hero-character, bound skeleton, masked fire layer, no bob", async ({ page }) => {
    // S11 named gate (P-21): expected-red until Q-14-4 lands — the spec
    // fails ONLY on the named gate below; a timeout or crash fails honestly.
    test.setTimeout(180_000);

    const report = validateHeroGlb(new Uint8Array(readFileSync(COURIER_GLB)));
    writeFileSync(join(ARTIFACT_DIR, "hero-validator.json"), JSON.stringify({ ok: report.ok, reasonCodes: report.reasonCodes }, null, 2));
    expect(report.ok, `S11 gate (expected-red until Q-14-4): neonCourierAvatar fails hero-character: ${report.reasonCodes.join(", ")}`).toBe(true);

    await page.goto(`${server.origin}/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(6_000);

    expect(await socketValid(page, "neon-player", "Hips"), "neon-player has no bound skeleton").toBe(true);

    // Move + fire: lower-body run + masked upper-body fire layer together.
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(1_200);
    await page.keyboard.press("KeyJ"); // pulse fire (falls back harmlessly if unbound)
    await page.waitForTimeout(400);
    const probe = await readAnimationState(page, "neon-player");
    await page.keyboard.up("KeyD");
    writeFileSync(join(ARTIFACT_DIR, "fire-run-state.json"), JSON.stringify(probe, null, 2));
    const layers = new Set((probe.state?.activeActions ?? []).map((a) => a.layer ?? "base"));
    expect(probe.available, "animationState() missing on neon-player").toBe(true);
    expect(layers.size, `activeActions layers during run+fire: ${JSON.stringify(probe.state?.activeActions)}`).toBeGreaterThanOrEqual(2);

    // Bob deleted: courier core ring y stays ~flat across 10 rendered seconds.
    const ys: number[] = [];
    for (let i = 0; i < 8; i++) {
      const t = await readNodeTransform(page, "neon-courier-core-ring");
      if (t.position) ys.push(t.position[1]);
      await page.waitForTimeout(1_200);
    }
    writeFileSync(join(ARTIFACT_DIR, "core-ring-ys.json"), JSON.stringify(ys, null, 2));
    expect(range(ys), `courier bob amplitude ${(range(ys) * 100).toFixed(2)} cm`).toBeLessThan(0.005);
  });

  test("flag-off (?a3d-qr=none): no C-19 api on the player node", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${server.origin}/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await page.waitForTimeout(3_000);
    const probe = await readAnimationState(page, "neon-player");
    expect(probe.available).toBe(false);
  });
});
