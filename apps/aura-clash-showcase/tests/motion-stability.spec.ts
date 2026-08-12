import { expect, test } from "@playwright/test";
import {
  holdKey,
  loadAuraClashArena,
  queueNearKoHeavy,
  readAuraClashProof,
  setFighterTestState
} from "./helpers/auraClashArenaHarness";

test.describe("Aura Clash motion stability", () => {
  test("backpedalling keeps both fighters facing one another", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await setFighterTestState(page, {
      playerX: -0.6,
      rivalX: 0.8,
      suppressRivalGuard: true
    });

    // Move Mara away from Rook. A side-view fighter backpedals here; it must not rotate 180 degrees
    // and expose its back merely because the movement vector points left.
    await holdKey(page, "KeyA", 420);
    const proof = await readAuraClashProof(page);
    expect(proof.player.x).toBeLessThan(-0.6);
    expect(proof.player.facing, "player retreat must keep the rival in front").toBe(1);
    expect(proof.rival.facing, "rival must keep the player in front").toBe(-1);
    expect(proof.player.x).toBeLessThan(proof.rival.x);
  });

  test("KO presentation clears impact motion and remains spatially settled", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await setFighterTestState(page, {
      playerX: -0.95,
      rivalX: 0.5,
      rivalHealth: 9,
      playerMeter: 100,
      suppressRivalGuard: true
    });
    await queueNearKoHeavy(page);
    await expect.poll(async () => (await readAuraClashProof(page)).controls?.koLocked).toBe(true);

    const samples: Array<{ playerX: number; rivalX: number; frameWidth: number; impact: number; settled: boolean }> = [];
    for (let index = 0; index < 8; index += 1) {
      await page.waitForTimeout(80);
      const proof = await readAuraClashProof(page);
      samples.push({
        playerX: proof.player.x,
        rivalX: proof.rival.x,
        frameWidth: proof.camera?.frameWidthUnits ?? -1,
        impact: proof.camera?.impactStrength ?? -1,
        settled: proof.camera?.settled ?? false
      });
    }

    expect(new Set(samples.map((sample) => sample.playerX)).size, "winner root must not creep after KO").toBe(1);
    expect(new Set(samples.map((sample) => sample.rivalX)).size, "loser root must not creep after KO").toBe(1);
    expect(new Set(samples.map((sample) => sample.frameWidth)).size, "KO camera bounds must not jitter").toBe(1);
    expect(samples.every((sample) => sample.impact === 0 && sample.settled), "KO must clear residual hit-stop").toBe(true);
  });
});
