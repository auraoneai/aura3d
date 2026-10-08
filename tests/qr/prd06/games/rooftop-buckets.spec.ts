// PRD-06 T5.2 — §17.4 failing control for `apps/showcase-rooftop-buckets`
// (Q-14-2). Gates: the skinned athletes (`shooter-player-mesh`,
// `contest-defender-mesh` — the `rooftopLayupScorer`/`rooftopDefender` models,
// mounted only under `animationDebugCapture` today) are visible in NORMAL
// play; the shooter/defender root sways (`Math.sin(elapsedPlayTime * …)`)
// are gone — yaw variance ≈ 0 across pumped frames. Both fail today.
// The ≥20° shooting-arm delta gate rides on the same skinned-athlete mount
// and is asserted via `socket` presence once visible.

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startGameDevServer, type GameDevServer, pumpFrames, readNodeTransform, socketValid, waitForApps, waitForHook, range } from "./helpers";

const ARTIFACT_DIR = join(process.cwd(), "artifacts", "prd06", "games", "rooftop-buckets");
const PUMP = "__RB_PUMP__";

test.describe("PRD-06 T5.2 rooftop-buckets §17.4 gates", () => {

  // SwiftShader software GL: the routes' raster cost dominates the
  // main-thread budget; a tiny viewport keeps evaluate() slots free while
  // leaving node transforms and the animation api untouched.
  test.use({ viewport: { width: 320, height: 240 } });
  let server: GameDevServer;

  test.beforeAll(async () => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    server = await startGameDevServer("showcase-rooftop-buckets", 5322);
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flag-on: skinned athletes visible in normal play, root sways deleted", async ({ page }) => {
    // Expected to FAIL until Q-14-2 lands — S11 failing control.
    test.fail();
    test.setTimeout(180_000);
    await page.goto(`${server.origin}/?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await waitForHook(page, PUMP);

    const shooter = await readNodeTransform(page, "shooter-player-mesh");
    const defender = await readNodeTransform(page, "contest-defender-mesh");
    writeFileSync(join(ARTIFACT_DIR, "athlete-mounts.json"), JSON.stringify({ shooter, defender }, null, 2));

    expect(shooter.exists && shooter.visible === true, "shooter-player-mesh not visible in normal play").toBe(true);
    expect(defender.exists && defender.visible === true, "contest-defender-mesh not visible in normal play").toBe(true);

    // Skinned rigs bound on the visible athletes.
    expect(await socketValid(page, "shooter-player-mesh", "Hips"), "shooter-player-mesh has no skeleton socket").toBe(true);
    expect(await socketValid(page, "contest-defender-mesh", "Hips"), "contest-defender-mesh has no skeleton socket").toBe(true);

    // No root sway: shooter yaw sampled across 12 pumped frames stays ~flat.
    const yaws: number[] = [];
    for (let i = 0; i < 12; i++) {
      await pumpFrames(page, PUMP, 1);
      const t = await readNodeTransform(page, "shooter-player");
      if (t.rotationEuler) yaws.push(t.rotationEuler[1]);
    }
    writeFileSync(join(ARTIFACT_DIR, "shooter-yaws.json"), JSON.stringify(yaws, null, 2));
    expect(range(yaws), `shooter yaw sway amplitude ${(range(yaws) * 1000).toFixed(1)} mrad ≥ 10 mrad`).toBeLessThan(0.01);
  });

  test("flag-off (?a3d-qr=none): no C-19 api on the shooter node", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`${server.origin}/?a3d-qr=none`, { waitUntil: "domcontentloaded" });
    await waitForApps(page);
    await pumpFrames(page, PUMP, 4).catch(() => -1);
    const probe = await page.evaluate(() => {
      const app = window.__AURA3D_LIVE_APPS__?.all()[0];
      const handle = app?.nodes.get("shooter-player") as { animation?: { animationState?: () => unknown } } | undefined;
      return typeof handle?.animation?.animationState === "function";
    });
    expect(probe).toBe(false);
  });
});
