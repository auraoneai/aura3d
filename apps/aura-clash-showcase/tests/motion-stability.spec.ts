import { expect, test } from "@playwright/test";
import {
  holdKey,
  loadAuraClashArena,
  queueNearKoHeavy,
  readAuraClashProof,
  setFighterTestState
} from "./helpers/auraClashArenaHarness";

const evidenceDir = "launch-evidence/motion-stability";

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
    await page.keyboard.down("KeyA");
    const renderedRotations: Array<readonly [number, number, number, number]> = [];
    const positions: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      await page.waitForTimeout(70);
      const sample = await readAuraClashProof(page);
      positions.push(sample.player.x);
      renderedRotations.push(sample.player.renderedRoot.rotation);
      await page.screenshot({ path: `${evidenceDir}/backpedal-${String(index + 1).padStart(2, "0")}.png`, fullPage: true });
    }
    await page.keyboard.up("KeyA");
    const proof = await readAuraClashProof(page);
    expect(proof.player.x).toBeLessThan(-0.6);
    expect(proof.player.facing, "player retreat must keep the rival in front").toBe(1);
    expect(proof.rival.facing, "rival must keep the player in front").toBe(-1);
    expect(proof.player.x).toBeLessThan(proof.rival.x);
    expect(positions.every((position, index) => index === 0 || position <= positions[index - 1]!)).toBe(true);
    const adjacentQuaternionDots = renderedRotations.slice(1).map((rotation, index) =>
      Math.abs(rotation.reduce((sum, value, component) => sum + value * renderedRotations[index]![component]!, 0))
    );
    expect(Math.min(...adjacentQuaternionDots), "backpedal root must turn continuously rather than flip").toBeGreaterThan(0.995);
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

    const samples: Array<{
      playerX: number;
      rivalX: number;
      playerRoot: string;
      rivalRoot: string;
      frameWidth: number;
      impact: number;
      settled: boolean;
    }> = [];
    for (let index = 0; index < 8; index += 1) {
      await page.waitForTimeout(80);
      const proof = await readAuraClashProof(page);
      samples.push({
        playerX: proof.player.x,
        rivalX: proof.rival.x,
        playerRoot: JSON.stringify(proof.player.renderedRoot),
        rivalRoot: JSON.stringify(proof.rival.renderedRoot),
        frameWidth: proof.camera?.frameWidthUnits ?? -1,
        impact: proof.camera?.impactStrength ?? -1,
        settled: proof.camera?.settled ?? false
      });
      await page.screenshot({ path: `${evidenceDir}/ko-settle-${String(index + 1).padStart(2, "0")}.png`, fullPage: true });
    }

    expect(new Set(samples.map((sample) => sample.playerX)).size, "winner root must not creep after KO").toBe(1);
    expect(new Set(samples.map((sample) => sample.rivalX)).size, "loser root must not creep after KO").toBe(1);
    expect(new Set(samples.map((sample) => sample.playerRoot)).size, "winner rendered root must not shake after KO").toBe(1);
    expect(new Set(samples.map((sample) => sample.rivalRoot)).size, "loser rendered root must not shake after KO").toBe(1);
    expect(new Set(samples.map((sample) => sample.frameWidth)).size, "KO camera bounds must not jitter").toBe(1);
    expect(samples.every((sample) => sample.impact === 0 && sample.settled), "KO must clear residual hit-stop").toBe(true);
  });
});
