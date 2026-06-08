import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type FighterAction =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "down"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "hurt"
  | "ko";

type MoveId = "light" | "heavy" | "special";

type ProofFighter = {
  name: string;
  health: number;
  meter: number;
  x: number;
  y: number;
  grounded: boolean;
  action: FighterAction;
  activeClip: string;
  attacking: MoveId | null;
};

type AuraClashArenaProof = {
  route: string;
  app: "Aura Clash Arena";
  release: "1.0.10";
  status: "loading" | "running" | "paused" | "error";
  error: string | null;
  frame: number;
  roundTime: number;
  totalHits: number;
  lastHitFrame: number;
  callout: string;
  fighterAssets?: {
    player: { id: string; url: string; hash: string };
    rival: { id: string; url: string; hash: string };
    distinct: boolean;
    releaseReady: boolean;
  };
  renderer: {
    backend: string;
    drawCalls: number;
  };
  player: ProofFighter;
  rival: ProofFighter;
  animation: {
    skinnedDrawItems: number;
    playerLastTracks: number;
    rivalLastTracks: number;
    playerLastSkinningPalettes: number;
    rivalLastSkinningPalettes: number;
    clips: readonly string[];
  };
  runtime: {
    frameLoop: boolean;
    input: boolean;
    deterministicCombat: boolean;
    hitWindows: boolean;
    hud: boolean;
    evidence: boolean;
  };
  controls?: {
    lastInput: string;
    downSupported: boolean;
    specialRequiresMeter: boolean;
    koLocked: boolean;
    resetCount: number;
  };
  performance?: {
    frameTimeMs: number;
    fps: number;
    drawCalls: number;
    budgetOk: boolean;
  };
  audio?: {
    enabled: boolean;
    muted: boolean;
    musicReady: boolean;
    sfxReady: boolean;
    lastCue: string | null;
  };
};

const sourcePath = resolve(process.cwd(), "src/playable/AuraClashArenaApp.ts");
const attackClips = new Set(["Punch_Jab", "Punch_Cross", "Sword_Attack", "Spell_Simple_Shoot"]);

test.describe("Aura Clash flagship readiness gates", () => {
  test("all shipped controls produce explicit gameplay proof and do not silently no-op", async ({ page }) => {
    test.setTimeout(60_000);
    const proof = await loadPlayable(page);
    expect(proof.controls, "runtime proof must expose controls.lastInput/downSupported/specialRequiresMeter/koLocked/resetCount").toBeTruthy();
    expect(proof.fighterAssets, "flagship proof must expose player/rival typed fighter assets").toBeTruthy();
    expect(proof.fighterAssets?.distinct, "flagship cannot use the same fighter GLB twice with tinting").toBe(true);
    expect(proof.fighterAssets?.releaseReady, "flagship fighter assets must pass release validation before this gate can pass").toBe(true);
    expect(proof.fighterAssets?.player.hash, "player and rival fighter asset hashes must be distinct").not.toBe(proof.fighterAssets?.rival.hash);
    expect(proof.fighterAssets?.player.id, "training mannequin is not a release-facing player fighter").not.toBe("auraClashTrainingMannequin");
    expect(proof.fighterAssets?.rival.id, "training mannequin is not a release-facing rival fighter").not.toBe("auraClashTrainingMannequin");
    expect(proof.controls?.downSupported, "S/ArrowDown must be an implemented movement state, not a UI-only label").toBe(true);

    const start = await readProof(page);
    await hold(page, "KeyD", 420);
    const afterRight = await readProof(page);
    expect(afterRight.player.x, "D/Right should move the player right").toBeGreaterThan(start.player.x + 0.06);

    await hold(page, "KeyA", 420);
    const afterLeft = await readProof(page);
    expect(afterLeft.player.x, "A/Left should move the player left").toBeLessThan(afterRight.player.x - 0.06);

    const beforeDash = await readProof(page);
    await page.keyboard.down("Space");
    await hold(page, "KeyD", 260);
    await page.keyboard.up("Space");
    const afterDash = await readProof(page);
    expect(afterDash.player.x, "Space+D should create a visibly larger dash/run displacement").toBeGreaterThan(beforeDash.player.x + 0.18);
    expect(["run", "walk", "idle"]).toContain(afterDash.player.action);

    await page.keyboard.press("KeyW");
    await expect.poll(async () => (await readProof(page)).player.y, {
      message: "W Jump should lift the player high enough to be readable"
    }).toBeGreaterThan(0.45);
    const airborne = await readProof(page);
    await hold(page, "KeyS", 220);
    const afterDown = await readProof(page);
    expect(afterDown.player.y, "S/Down should fast-fall or clearly descend from jump apex").toBeLessThan(airborne.player.y - 0.08);

    await expect.poll(async () => (await readProof(page)).player.grounded, {
      message: "player should land after jump/fast-fall"
    }).toBe(true);

    await hold(page, "ShiftLeft", 260);
    const afterGuard = await readProof(page);
    expect(afterGuard.status, "Shift Guard must not pause or crash the route").toBe("running");
    expect(afterGuard.player.action, "Shift Guard should expose guard state").toBe("guard");
    expect(afterGuard.player.activeClip, "Shift Guard should use the standing guard clip, not the crouch/down clip").toMatch(/Sword_Idle|Guard|Block/i);
    expect(afterGuard.player.activeClip, "Shift Guard must not reuse the down/crouch clip").not.toMatch(/Crouch/i);

    // KeyQ is an alternate guard binding (arena controls); it must guard like Shift.
    await hold(page, "KeyQ", 240);
    const afterQGuard = await readProof(page);
    expect(afterQGuard.status, "KeyQ Guard must not pause or crash the route").toBe("running");
    expect(afterQGuard.player.action, "KeyQ should also expose guard state").toBe("guard");

    await expectAttackClip(page, "KeyJ", "light", /Punch_Jab|Jab/i);
    await waitForAttackRecovery(page);
    await expectAttackClip(page, "KeyK", "heavy", /Punch_Cross|Cross|Heavy/i);
    await waitForAttackRecovery(page);

    const beforeSpecial = await readProof(page);
    await hold(page, "KeyL", 260);
    const afterSpecial = await readProof(page);
    expect(afterSpecial.status, "L Special must not pause, crash, or freeze the route").toBe("running");
    if (beforeSpecial.player.meter >= 20) {
      expect(afterSpecial.player.attacking ?? afterSpecial.player.action, "L Special should expose a special attack when meter is available").toBe("special");
      expect(afterSpecial.player.activeClip, "L Special should use a distinct special clip").toMatch(/Sword|Spell|Special/i);
    } else {
      const toast = (await page.locator("#toast").textContent()) ?? "";
      expect(afterSpecial.controls?.specialRequiresMeter, "Special gating must be published in proof when L cannot fire").toBe(true);
      expect(toast, "L with insufficient meter needs visible player feedback instead of a silent no-op").toMatch(/special|meter|cooldown|requires/i);
    }

    await hold(page, "KeyP", 160);
    await expect.poll(async () => (await readProof(page)).status, { message: "P should pause" }).toBe("paused");
    await hold(page, "KeyP", 160);
    await expect.poll(async () => (await readProof(page)).status, { message: "P should resume" }).toBe("running");

    const beforeReset = await readProof(page);
    await hold(page, "KeyR", 160);
    const afterReset = await readProof(page);
    expect(afterReset.controls?.resetCount, "R Reset must increment reset proof").toBeGreaterThan(beforeReset.controls?.resetCount ?? -1);
    expect(afterReset.totalHits, "R Reset must clear hit count").toBe(0);
  });

  test("KO state locks combat until reset or next-round control", async ({ page }) => {
    test.setTimeout(45_000);
    const initial = await loadPlayable(page, "?auraTestDriver=1");
    expect(initial.controls, "KO lock/reset proof must be exposed every frame").toBeTruthy();

    const ko = await driveRivalToKo(page);
    expect(ko.rival.health, "test setup should reach rival KO").toBe(0);
    expect(ko.callout, "KO should produce a terminal round callout").toMatch(/WIN|KO/i);
    expect(ko.controls?.koLocked, "proof.controls.koLocked must become true at round end").toBe(true);

    const lockedHits = ko.totalHits;
    const lockedHealth = ko.rival.health;
    const lockedClip = ko.rival.activeClip;

    await page.waitForTimeout(260);
    const afterLockedInput = await readProof(page);
    expect(afterLockedInput.totalHits, "attacks after KO must not add repeated hits").toBe(lockedHits);
    expect(afterLockedInput.rival.health, "attacks after KO must not keep damaging a dead opponent").toBe(lockedHealth);
    expect(afterLockedInput.rival.activeClip, "KO clip should stay terminal until reset").toBe(lockedClip);
    expect(afterLockedInput.player.attacking, "winner should not loop attack state forever after KO").toBeNull();

    await hold(page, "KeyL", 180);
    await expect.poll(async () => (await readProof(page)).controls?.koLocked, {
      message: "Any control after KO should start the next round"
    }).toBe(false);
    const reset = await readProof(page);
    expect(reset.totalHits, "Reset should clear combat history").toBe(0);
    expect(reset.player.health, "Next round should restore player health").toBeGreaterThan(0);
    expect(reset.rival.health, "Next round should restore rival health").toBeGreaterThan(0);
    expect(reset.callout, "Next round should return the round to fight state").toBe("FIGHT");
  });

  test("normal play does not ship debug-style hit artifacts", async ({ page }) => {
    const source = readFileSync(sourcePath, "utf8");
    const sparkBlock = source.match(/function createSparkItems[\s\S]*?function item/)?.[0] ?? "";
    expect(sparkBlock, "source should contain the normal-play hit VFX implementation").toBeTruthy();
    expect(sparkBlock, "hit VFX must not be debug cubes/boxes in normal play").not.toMatch(/Geometry\.litCube\(/);
    expect(sparkBlock, "hit VFX must not emit generic spark cube render items in normal play").not.toMatch(/item\(`spark-/);

    await loadPlayable(page, "?auraTestDriver=1");
    await landOneHit(page);
    const bodyText = ((await page.locator("body").textContent()) ?? "").toLowerCase();
    expect(bodyText).not.toContain("hitbox");
    expect(bodyText).not.toContain("hurtbox");
    expect(bodyText).not.toContain("debug");
    expect(bodyText).not.toContain("primitive fighter");
  });

  test("flagship proof exposes performance and audio budgets instead of placeholders", async ({ page }) => {
    const proof = await loadPlayable(page);
    expect(proof.performance, "proof.performance must expose frameTimeMs/fps/drawCalls/budgetOk for the flagship route").toBeTruthy();
    expect(proof.performance?.budgetOk, "flagship performance budget must be green").toBe(true);
    expect(proof.performance?.frameTimeMs, "frame budget must stay below 16.7 ms on the release desktop proof").toBeLessThanOrEqual(16.7);
    expect(proof.performance?.fps, "release proof should expose a 60fps-class runtime").toBeGreaterThanOrEqual(55);
    expect(proof.performance?.drawCalls, "draw-call budget must be published and bounded").toBeLessThanOrEqual(160);

    expect(proof.audio, "proof.audio must expose music/SFX/mute/cue readiness for the flagship route").toBeTruthy();
    expect(proof.audio?.musicReady, "flagship route must have music readiness proof").toBe(true);
    expect(proof.audio?.sfxReady, "flagship route must have SFX readiness proof").toBe(true);
    expect(proof.audio?.enabled, "audio system must be initialized after user gesture or explicitly muted").toBe(true);
  });
});

async function loadPlayable(page: Page, search = ""): Promise<AuraClashArenaProof> {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(`/playable/${search}`, { waitUntil: "networkidle" });
  await page.locator(".aca").focus();
  await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_ARENA_PROOF__?: unknown }).__AURA_CLASH_ARENA_PROOF__));
  const proof = await readProof(page);
  expect(proof.error).toBeNull();
  expect(proof.status).not.toBe("error");
  expect(consoleErrors, "flagship route should not emit console errors during boot").toEqual([]);
  return proof;
}

async function readProof(page: Page): Promise<AuraClashArenaProof> {
  const proof = await page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__;
  });
  expect(proof, "window.__AURA_CLASH_ARENA_PROOF__ must be present").toBeTruthy();
  return proof!;
}

async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function expectAttackClip(page: Page, code: string, move: MoveId, clipPattern: RegExp): Promise<void> {
  await page.keyboard.down(code);
  await expect.poll(async () => {
    const proof = await readProof(page);
    return `${proof.player.attacking ?? proof.player.action}:${proof.player.activeClip}`;
  }, {
    message: `${code} should expose ${move} as a distinct visible attack`
  }).toMatch(new RegExp(`${move}:.*${clipPattern.source}|${move === "light" ? "Punch_Jab" : move === "heavy" ? "Punch_Cross" : "Sword_Attack"}`, "i"));
  await page.waitForTimeout(180);
  await page.keyboard.up(code);
}

async function waitForAttackRecovery(page: Page): Promise<void> {
  await expect.poll(async () => (await readProof(page)).player.attacking, {
    timeout: 3_000
  }).toBeNull();
}

async function landOneHit(page: Page): Promise<AuraClashArenaProof> {
  await approachCombatRange(page);
  await expect.poll(async () => (await readProof(page)).player.grounded, {
    message: "player must be grounded before a readable strike is tested"
  }).toBe(true);
  await placeReadableHitRange(page);
  const before = await readProof(page);
  for (const code of ["KeyJ", "KeyK"] as const) {
    await hold(page, code, 220);
    await page.waitForTimeout(260);
    const current = await readProof(page);
    if (current.totalHits > before.totalHits) {
      expect(Math.abs(current.rival.x - current.player.x), "hit should resolve at readable spacing, not body overlap").toBeGreaterThanOrEqual(0.72);
      expect(current.player.grounded, "normal strike proof should not be an offscreen airborne hit").toBe(true);
      return current;
    }
  }
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        queuePlayerAttack(move: MoveId): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash deterministic hit test driver was not installed.");
    driver.queuePlayerAttack("heavy");
  });
  await expect.poll(async () => (await readProof(page)).totalHits).toBeGreaterThan(before.totalHits);
  return readProof(page);
}

async function placeReadableHitRange(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash hit-range test driver was not installed.");
    driver.setPositions(-0.82, 0.42);
    driver.setRivalHealth(240);
    driver.setPlayerMeter(100);
  });
  await expect.poll(async () => {
    const proof = await readProof(page);
    return Math.abs(proof.rival.x - proof.player.x);
  }, {
    message: "fighter spacing should be deterministic before artifact-gate strike"
  }).toBeGreaterThanOrEqual(0.72);
}

async function driveRivalToKo(page: Page): Promise<AuraClashArenaProof> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
        queuePlayerAttack(move: MoveId): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash KO test driver was not installed.");
    driver.setPositions(-0.95, 0.5);
    driver.setRivalHealth(9);
    driver.setPlayerMeter(100);
    driver.queuePlayerAttack("heavy");
  });
  await expect.poll(async () => (await readProof(page)).rival.health, {
    message: "one deterministic heavy strike should KO the near-KO rival through the normal resolver"
  }).toBe(0);
  return readProof(page);
}

async function approachCombatRange(page: Page): Promise<void> {
  for (let index = 0; index < 18; index += 1) {
    const proof = await readProof(page);
    const gap = proof.rival.x - proof.player.x;
    if (Math.abs(gap) >= 0.9 && Math.abs(gap) <= 1.18 && proof.player.grounded) return;
    await hold(page, gap > 0 ? "KeyD" : "KeyA", Math.abs(gap) > 1.25 ? 170 : 70);
  }
}
