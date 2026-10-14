import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  loadAuraClashArena,
  readAuraClashProof,
  setFighterTestState,
  queuePlayerAttack
} from "./helpers/auraClashArenaHarness";

/**
 * New-feel evidence for the Aura Clash upgrade (Phase 5 Clash gates + the four-game pass).
 *
 * These assertions cover the combat *picture* beyond raw HP math: confirmed-hit victim flash,
 * the special screen-freeze, the running rival AI role, fighter-length buffering, and reduced-motion
 * camera gating. Everything is read from window.__AURA_CLASH_ARENA_PROOF__.feel / .camera,
 * which are published from mounted runtime state every frame.
 */

async function landCleanHit(page: Page): Promise<void> {
  await setFighterTestState(page, {
    playerX: -0.86,
    rivalX: 0.44,
    rivalHealth: 240,
    playerMeter: 100,
    suppressRivalGuard: true
  });
  await queuePlayerAttack(page, "heavy");
  await expect.poll(async () => (await readAuraClashProof(page)).totalHits, {
    timeout: 10000
  }).toBeGreaterThan(0);
}

async function pollForTruth(page: Page, read: (proof: Awaited<ReturnType<typeof readAuraClashProof>>) => boolean, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    const proof = await readAuraClashProof(page);
    if (read(proof)) return true;
    await page.waitForTimeout(35);
  }
  return false;
}

test.describe("Aura Clash combat feel", () => {
  test("a real hit fires the confirmed-hit victim flash", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    const idle = await readAuraClashProof(page);
    expect(idle.feel?.rivalFlashStrength ?? 0, "no hit yet means no victim flash").toBe(0);

    await landCleanHit(page);
    const sawFlash = await pollForTruth(page, (proof) => (proof.feel?.rivalFlashStrength ?? 0) > 0);
    expect(sawFlash, "a confirmed hit must briefly flash the defender rig's materials").toBe(true);
  });

  test("special spends meter and exposes a screen-freeze beat", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    // Keep the rival well out of range so this assertion isolates the meter *spend*: the moment the
    // special lands the attacker's meter is kicked back up by the engine, so a close-range probe would
    // be masked. Power-hit damage is covered by the existing playable-smoke suite.
    await setFighterTestState(page, { playerX: -2.0, rivalX: 2.0, rivalHealth: 360, playerMeter: 100 });
    // Hold L and poll the published feel proof in one rapid loop. The screen-freeze is a ~5-frame
    // window and the meter is spent the moment the special begins, but the engine re-syncs the actor
    // meter back toward its cap, so the reliable signal is a meter drop *below the 100 cap* during the
    // special itself (100 -> 80). A close-range probe is additionally masked by the +18 kickback on
    // landing, which is why the rival starts out of range here.
    const METER_CAP = 100;
    await page.keyboard.down("KeyL");
    let sawSpecial = false;
    let sawFreeze = false;
    let sawMeterSpend = false;
    for (let i = 0; i < 120 && !(sawSpecial && sawFreeze && sawMeterSpend); i += 1) {
      const proof = await readAuraClashProof(page);
      const attacking = proof.player.attacking ?? proof.player.action;
      if (attacking === "special") sawSpecial = true;
      if ((proof.feel?.playerSpecialFreeze ?? 0) > 0) sawFreeze = true;
      if (proof.player.meter < METER_CAP) sawMeterSpend = true;
      if (!sawSpecial) await page.waitForTimeout(20);
    }
    await page.keyboard.up("KeyL");
    expect(sawSpecial, "L must start a special").toBe(true);
    expect(sawFreeze, "special startup must publish a screen-freeze beat").toBe(true);
    expect(sawMeterSpend, "a fired special must spend meter at startup").toBe(true);
  });

  test("the rival AI resolves a deterministic role that is a known role name", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    const roleSeen = await pollForTruth(page, (proof) => {
      const role = proof.feel?.rivalAiRole;
      return role !== undefined && role !== "neutral";
    });
    expect(roleSeen, "the rival AI must resolve a non-neutral role during play").toBe(true);
    const allowed = new Set(["approach", "space", "punish-whiff", "meaty-wakeup", "neutral"]);
    for (let i = 0; i < 10; i += 1) {
      const role = (await readAuraClashProof(page)).feel?.rivalAiRole ?? "neutral";
      expect(allowed.has(role), "unexpected rival AI role").toBe(true);
    }
  });

  test("fighter-length buffering and reduced-motion camera gating hold", async ({ page, browser }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    const proof = await readAuraClashProof(page);
    expect(proof.feel?.fighterLengthBuffering, "input buffer must be fighter-length (6-8f)").toBe(true);

    const rmResponded = await withReducedMotion(browser, async (page2) => {
      await loadAuraClashArena(page2 as Page, "?auraTestDriver=1");
      await setFighterTestState(page2 as Page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 240, playerMeter: 100, suppressRivalGuard: true });
      await queuePlayerAttack(page2 as Page, "heavy");
      await expect.poll(async () => (await readAuraClashProof(page2 as Page)).totalHits, { timeout: 10000 }).toBeGreaterThan(0);
      let cameraResponded = false;
      for (let i = 0; i < 14; i += 1) {
        await page2.waitForTimeout(40);
        if ((await readAuraClashProof(page2 as Page)).camera?.respondingToCombat) cameraResponded = true;
      }
      return cameraResponded;
    });
    expect(rmResponded, "reduced motion must disable the camera punch/shake").toBe(false);
  });

  test("low health enters a static tension phase and suppresses secondary stage motion", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await setFighterTestState(page, {
      playerX: -1.2,
      rivalX: 1.2,
      playerHealth: 80,
      rivalHealth: 360,
      suppressRivalGuard: true
    });

    await expect.poll(async () => (await readAuraClashProof(page)).feel?.lowHealthTension).toBe(true);
    const proof = await readAuraClashProof(page);
    expect(proof.feel?.lowHealthSecondaryMotionSuppressed).toBe(true);
    expect(proof.feel?.crowdCheer ?? 1).toBeLessThanOrEqual(0.12);
    await expect(page.locator(".aca")).toHaveAttribute("data-low-health-tension", "true");
    await expect(page.locator(".aca-clock")).toHaveCSS("animation-name", "none");
  });

  test("a whiff holds recovery without impact VFX, hit audio, or camera response", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await setFighterTestState(page, {
      playerX: -2.2,
      rivalX: 2.2,
      rivalHealth: 360,
      suppressRivalGuard: true
    });
    await queuePlayerAttack(page, "heavy");

    let sawRecovery = false;
    let outcome: string | undefined;
    for (let attempt = 0; attempt < 500 && outcome !== "whiff"; attempt += 1) {
      const proof = await readAuraClashProof(page);
      sawRecovery ||= proof.player.action === "recover";
      outcome = proof.presentation?.lastOutcome;
      if (outcome !== "whiff") await page.waitForTimeout(20);
    }
    expect(outcome).toBe("whiff");
    const proof = await readAuraClashProof(page);
    expect(sawRecovery, "the missed strike must expose an authored recovery hold").toBe(true);
    expect(proof.callout).toBe("WHIFF");
    expect(proof.presentation?.activeImpactKinds ?? []).toEqual([]);
    expect(proof.camera?.respondingToCombat).toBe(false);
    expect(proof.audio?.recentCues ?? []).not.toContain("player-hit");
  });

  test("guard break has a distinct pose, impact, audio cue, callout, and camera beat", async ({ page }) => {
    await loadAuraClashArena(page, "?auraTestDriver=1");
    await setFighterTestState(page, {
      playerX: -0.5,
      rivalX: 0.5,
      rivalHealth: 360,
      rivalGuardMeter: 0,
      forceRivalGuard: true
    });
    await queuePlayerAttack(page, "heavy");

    let proof = await readAuraClashProof(page);
    for (let attempt = 0; attempt < 500 && proof.presentation?.lastOutcome !== "guard-break"; attempt += 1) {
      await page.waitForTimeout(20);
      proof = await readAuraClashProof(page);
    }
    expect(proof.presentation?.lastOutcome).toBe("guard-break");
    expect(proof.callout).toBe("GUARD BREAK");
    expect(proof.rival.action).toBe("hurt");
    expect(proof.presentation?.activeImpactKinds ?? []).toContain("guard-break");
    expect(proof.audio?.lastCue).toBe("guard-break");
    expect(proof.camera?.respondingToCombat).toBe(true);
  });
});

async function withReducedMotion(browser: Browser, run: (page: Page) => Promise<boolean>): Promise<boolean> {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    return await run(page);
  } finally {
    await context.close();
  }
}

export {};
