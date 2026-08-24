import { expect, test } from "@playwright/test";
import {
  holdKey,
  loadAuraClashArena,
  queueNearKoHeavy,
  queuePlayerAttack,
  readAuraClashProof,
  setFighterTestState
} from "./helpers/auraClashArenaHarness";

test.describe("Aura Clash visual regression states", () => {
  test("captures first, movement, jump, guard, hit, whiff, guard-break, KO, reset, and mobile states", async ({ page }) => {
    test.setTimeout(90_000);
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await expectReadableVisualProof(page, "first");

    await page.screenshot({ path: "launch-evidence/aura-clash-visual-first-frame.png", fullPage: true });

    await setFighterTestState(page, { playerX: -1.2, rivalX: 1.2, suppressRivalGuard: true });
    await page.keyboard.down("KeyD");
    await expect.poll(async () => (await readAuraClashProof(page)).player.action).toBe("walk");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-movement.png", fullPage: true });
    await page.keyboard.up("KeyD");

    // Movement closes the lane enough for the rival AI to interrupt with hitstun. Reset only the
    // transient combat state so this frame proves an actual player jump rather than racing the AI.
    await setFighterTestState(page, { playerX: -1.2, rivalX: 1.2, suppressRivalGuard: true });
    await page.keyboard.down("KeyW");
    await expect.poll(async () => (await readAuraClashProof(page)).player.grounded, {
      message: "jump capture must prove the fighter is airborne"
    }).toBe(false);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-jump.png", fullPage: true });
    await page.keyboard.up("KeyW");
    await expect.poll(async () => (await readAuraClashProof(page)).player.grounded).toBe(true);

    await page.keyboard.down("KeyS");
    await expect.poll(async () => (await readAuraClashProof(page)).player.action).toBe("down");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-down.png", fullPage: true });
    await page.keyboard.up("KeyS");

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

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100, suppressRivalGuard: true });
    const hitsBeforeSpecial = (await readAuraClashProof(page)).totalHits;
    await page.evaluate(() => {
      const driver = (window as Window & {
        __AURA_CLASH_ARENA_TEST_DRIVER__?: { pauseOnNextHit(): void };
      }).__AURA_CLASH_ARENA_TEST_DRIVER__;
      if (!driver) throw new Error("Aura Clash test driver was not installed.");
      driver.pauseOnNextHit();
    });
    await page.keyboard.press("KeyL");
    await expect.poll(async () => (await readAuraClashProof(page)).totalHits, {
      message: "special capture must include a real landed hit",
      intervals: [10, 20, 30, 50]
    }).toBeGreaterThan(hitsBeforeSpecial);
    // The driver freezes the exact real landed-hit frame so full-page capture cannot advance the
    // authored pose, hit-stop camera response or live render-item VFX independently.
    await expect.poll(async () => (await readAuraClashProof(page)).status).toBe("paused");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-special.png", fullPage: true });
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(520);

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100, suppressRivalGuard: true });
    const hitsBeforeHitFrame = (await readAuraClashProof(page)).totalHits;
    await page.evaluate(() => {
      const driver = (window as Window & {
        __AURA_CLASH_ARENA_TEST_DRIVER__?: { pauseOnNextHit(): void };
      }).__AURA_CLASH_ARENA_TEST_DRIVER__;
      if (!driver) throw new Error("Aura Clash test driver was not installed.");
      driver.pauseOnNextHit();
    });
    await page.keyboard.press("KeyJ");
    await expect.poll(async () => (await readAuraClashProof(page)).totalHits, {
      message: "hit capture must freeze a real landed hit",
      intervals: [10, 20, 30, 50]
    }).toBeGreaterThan(hitsBeforeHitFrame);
    await expect.poll(async () => (await readAuraClashProof(page)).status).toBe("paused");
    await expectReadableVisualProof(page, "action");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-hit.png", fullPage: true });
    await resumeFromCapture(page);

    await setFighterTestState(page, { playerX: -2.2, rivalX: 2.2, rivalHealth: 360, suppressRivalGuard: true });
    await page.evaluate(() => {
      const driver = (window as Window & {
        __AURA_CLASH_ARENA_TEST_DRIVER__?: { pauseOnNextWhiff(): void };
      }).__AURA_CLASH_ARENA_TEST_DRIVER__;
      if (!driver) throw new Error("Aura Clash test driver was not installed.");
      driver.pauseOnNextWhiff();
    });
    await queuePlayerAttack(page, "heavy");
    await expect.poll(async () => (await readAuraClashProof(page)).presentation?.lastOutcome, {
      message: "whiff capture must follow a real out-of-range attack"
    }).toBe("whiff");
    await expect.poll(async () => (await readAuraClashProof(page)).status).toBe("paused");
    const whiff = await readAuraClashProof(page);
    expect(whiff.callout).toBe("WHIFF");
    expect(whiff.presentation?.activeImpactKinds ?? []).toEqual([]);
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-whiff.png", fullPage: true });
    await resumeFromCapture(page);

    await setFighterTestState(page, {
      playerX: -0.5,
      rivalX: 0.5,
      rivalHealth: 360,
      rivalGuardMeter: 0,
      forceRivalGuard: true
    });
    await queuePlayerAttack(page, "heavy");
    await expect.poll(async () => (await readAuraClashProof(page)).presentation?.lastOutcome, {
      message: "guard-break capture must follow a depleted guarded strike"
    }).toBe("guard-break");
    await pauseCurrentPose(page);
    const guardBreak = await readAuraClashProof(page);
    expect(guardBreak.callout).toBe("GUARD BREAK");
    expect(guardBreak.presentation?.activeImpactKinds ?? []).toContain("guard-break");
    await page.screenshot({ path: "launch-evidence/aura-clash-visual-guard-break.png", fullPage: true });
    await resumeFromCapture(page);

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

async function pauseCurrentPose(page: Parameters<typeof readAuraClashProof>[0]): Promise<void> {
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: { pauseForCapture(): void };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash test driver was not installed.");
    driver.pauseForCapture();
  });
  await expect.poll(async () => (await readAuraClashProof(page)).status).toBe("paused");
}

async function resumeFromCapture(page: Parameters<typeof readAuraClashProof>[0]): Promise<void> {
  await page.keyboard.press("KeyP");
  await expect.poll(async () => (await readAuraClashProof(page)).status).toBe("running");
}

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
