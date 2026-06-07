import { expect, test } from "@playwright/test";
import {
  holdKey,
  landKeyboardHit,
  loadAuraClashArena,
  queueNearKoHeavy,
  readAuraClashProof,
  setFighterTestState
} from "./helpers/auraClashArenaHarness";

test.describe("Aura Clash visual regression states", () => {
  test("captures first, movement, jump, guard, attack, hit, KO, reset, and mobile states", async ({ page }) => {
    test.setTimeout(90_000);
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await expectReadableVisualProof(page, "first");

    await page.screenshot({ path: "launch-evidence/aura-clash-visual-first-frame.png", fullPage: true });

    await holdKey(page, "KeyD", 420);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-movement.png", fullPage: true });

    await holdKey(page, "KeyW", 160);
    await page.waitForTimeout(240);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-jump.png", fullPage: true });

    await holdKey(page, "KeyS", 260);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-down.png", fullPage: true });

    await page.keyboard.down("ShiftLeft");
    await expect.poll(async () => (await readAuraClashProof(page)).player.action).toBe("guard");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-guard.png", fullPage: true });
    await page.keyboard.up("ShiftLeft");

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100 });
    await holdKey(page, "KeyJ", 160);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-light.png", fullPage: true });
    await page.waitForTimeout(380);

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100 });
    await holdKey(page, "KeyK", 180);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-heavy.png", fullPage: true });
    await page.waitForTimeout(420);

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100 });
    await holdKey(page, "KeyL", 220);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-special.png", fullPage: true });
    await page.waitForTimeout(520);

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100 });
    const hit = await landKeyboardHit(page);
    expect(hit.totalHits).toBeGreaterThan(0);
    await expectReadableVisualProof(page, "action");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-hit.png", fullPage: true });

    await queueNearKoHeavy(page);
    await expect.poll(async () => (await readAuraClashProof(page)).rival.health).toBe(0);
    await expectReadableVisualProof(page, "ko");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-ko-reset.png", fullPage: true });

    await holdKey(page, "KeyR", 180);
    await expect.poll(async () => (await readAuraClashProof(page)).rival.health).toBe(360);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-reset.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await loadAuraClashArena(page);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-mobile.png", fullPage: true });
  });
});

async function expectReadableVisualProof(page: Parameters<typeof readAuraClashProof>[0], state: "first" | "action" | "ko"): Promise<void> {
  const proof = await readAuraClashProof(page);
  expect(proof.lighting?.readable).toBe(true);
  expect(proof.lighting?.validatedStates).toContain(state);
  expect(proof.lighting?.minRimIntensity).toBeGreaterThanOrEqual(1.2);
  expect(proof.postProcess?.gameplayVisible).toBe(true);
  expect(proof.postProcess?.validatedStates).toContain(state);
  expect(proof.postProcess?.bloomWithinGameplayLimit).toBe(true);
  expect(proof.postProcess?.fogBehindCombatLane).toBe(true);
  expect(proof.performance?.budgetOk).toBe(true);
}
