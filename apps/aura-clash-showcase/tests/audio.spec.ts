import { expect, test } from "@playwright/test";
import { holdKey, loadAuraClashArena, queuePlayerAttack, readAuraClashProof, setFighterTestState } from "./helpers/auraClashArenaHarness";

test("Aura Clash unlocks audio and publishes gameplay cue proof", async ({ page }) => {
  await loadAuraClashArena(page, "?auraTestDriver=1");
  await page.mouse.click(120, 120);
  await holdKey(page, "KeyW", 120);
  // Assert against the cue *history*, not `lastCue`. `lastCue` is a single mutable slot, and
  // ambient cues legitimately overwrite it: a jump lands, the foot plants, and `footstep` fires.
  // Verified live — immediately after the input `lastCue` is "jump" and `recentCues` ends
  // [..., "jump"], but a few frames later `lastCue` is "footstep". Polling `lastCue` was therefore
  // racing the landing rather than testing whether the jump published a cue at all.
  await expect.poll(async () => (await readAuraClashProof(page)).audio?.recentCues ?? [], {
    message: "jump input should publish an audio cue"
  }).toContain("jump");
  await loadAuraClashArena(page, "?auraTestDriver=1");
  await page.mouse.click(120, 120);
  await holdKey(page, "ShiftLeft", 180);
  await expect.poll(async () => (await readAuraClashProof(page)).audio?.recentCues ?? [], {
    message: "guard input should publish an audio cue"
  }).toContain("guard");
  let proof = await readAuraClashProof(page);
  expect(proof.audio?.enabled, "audio context should initialize after a user gesture").toBe(true);
  expect(proof.audio?.musicReady).toBe(true);
  expect(proof.audio?.sfxReady).toBe(true);
  expect(proof.audio?.oscillatorFallback).toBe(false);
  expect(proof.audio?.cueCount).toBeGreaterThanOrEqual(10);
  expect(proof.audio?.typedAssetCount).toBeGreaterThanOrEqual(10);
  expect(proof.audio?.assetUrls.every((url) => /\/aura-assets\/auraClash.*Sfx\.[a-f0-9]{8}\.ogg$/.test(url))).toBe(true);
  expect(proof.audio?.audioErrors).toEqual([]);

  // Suppress rival guard: the AI blocks a queued strike almost every time, and a blocked strike is
  // chip damage rather than a hit, so `totalHits` could never advance here.
  await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100, suppressRivalGuard: true });
  const beforeHits = proof.totalHits;
  await queuePlayerAttack(page, "heavy");
  await expect.poll(async () => (await readAuraClashProof(page)).totalHits, {
    message: "queued heavy strike should publish a hit cue through the normal runtime proof"
  }).toBeGreaterThan(beforeHits);
  proof = await readAuraClashProof(page);
  expect(proof.audio?.lastCue, "landed attacks should publish a cue").toMatch(/hit|guard|special|player-hit|rival-hit/i);

  await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100, suppressRivalGuard: true });
  await holdKey(page, "KeyL", 220);
  await expect.poll(async () => (await readAuraClashProof(page)).audio?.recentCues ?? [], {
    message: "accepted special input should publish a dedicated special cue"
  }).toContain("special");
  proof = await readAuraClashProof(page);
  expect(proof.status).not.toBe("error");
  expect(proof.audio?.muted).toBe(false);
  expect(proof.audio?.audioErrors).toEqual([]);

  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setPlayerHealth(health: number): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash KO audio test driver was not installed.");
    driver.setPlayerHealth(0);
  });
  await expect.poll(async () => (await readAuraClashProof(page)).audio?.lastCue, {
    message: "player KO should publish a dedicated KO audio cue"
  }).toBe("ko");
});
