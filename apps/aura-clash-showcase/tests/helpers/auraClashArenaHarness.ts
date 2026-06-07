import { expect, type Page } from "@playwright/test";

export type AuraClashMoveId = "light" | "heavy" | "special";

export type AuraClashArenaProof = {
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
  player: {
    name: string;
    health: number;
    meter: number;
    x: number;
    y: number;
    grounded: boolean;
    action: string;
    activeClip: string;
    attacking: AuraClashMoveId | null;
  };
  rival: {
    name: string;
    health: number;
    meter: number;
    x: number;
    y: number;
    grounded: boolean;
    action: string;
    activeClip: string;
    attacking: AuraClashMoveId | null;
  };
  fighterAssets?: {
    player: { id: string; url: string; hash: string };
    rival: { id: string; url: string; hash: string };
    distinct: boolean;
    releaseReady: boolean;
  };
  renderer?: {
    backend: string;
    drawCalls: number;
  };
  animation?: {
    visibleSkinnedGlb: boolean;
    skinnedDrawItems: number;
    playerSkinningBindings: number;
    rivalSkinningBindings: number;
    playerLastTracks: number;
    rivalLastTracks: number;
    playerLastSkinningPalettes: number;
    rivalLastSkinningPalettes: number;
    clips: readonly string[];
  };
  runtime?: {
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
  lighting?: {
    contractId: "aura-clash-lighting-review-v1";
    presetId: string;
    readable: boolean;
    validatedStates: readonly ["first", "action", "ko"];
    ambientIntensity: number;
    keyIntensity: number;
    minRimIntensity: number;
    silhouetteSeparation: "rim-and-key";
    backgroundSeparation: "dark-stage-with-cyan-emerald-rim";
  };
  postProcess?: {
    contractId: "aura-clash-material-postprocess-review-v1";
    presetId: string;
    gameplayVisible: boolean;
    performanceBudgetOk: boolean;
    bloomIntensity: number;
    reducedFlashBloomIntensity: number;
    bloomWithinGameplayLimit: boolean;
    fogRange: readonly [number, number];
    fogBehindCombatLane: boolean;
    validatedStates: readonly ["first", "action", "ko"];
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
    recentCues: readonly string[];
    cueCount: number;
    typedAssetCount: number;
    assetUrls: readonly string[];
    oscillatorFallback: false;
    audioErrors: readonly string[];
  };
  deterministicReplay: {
    kind: "aura-clash-deterministic-replay-proof";
    runner: "game.runSimulation";
    inputReplay: "game.inputReplay";
    frameCount: number;
    eventCount: number;
    finalHash: string;
    repeatedFinalHash: string;
    stable: boolean;
    exportedReplay: {
      schemaVersion: "aura-game-input-replay/v1";
      checksum: string;
      frameCount: number;
      duration: number;
    };
    finalSnapshot: {
      playerX: number;
      rivalHp: number;
      hits: number;
      ko: boolean;
      roundTime: number;
    };
  };
};

export async function loadAuraClashArena(page: Page, search = ""): Promise<AuraClashArenaProof> {
  await page.goto(`/playable/${search}`, { waitUntil: "networkidle" });
  await page.locator(".aca").focus();
  await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_ARENA_PROOF__?: unknown }).__AURA_CLASH_ARENA_PROOF__));
  const proof = await readAuraClashProof(page);
  expect(proof.error).toBeNull();
  expect(proof.status).not.toBe("error");
  return proof;
}

export async function readAuraClashProof(page: Page): Promise<AuraClashArenaProof> {
  const proof = await page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__;
  });
  expect(proof, "window.__AURA_CLASH_ARENA_PROOF__ must be present").toBeTruthy();
  return proof!;
}

export async function holdKey(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

export async function setFighterTestState(
  page: Page,
  options: { playerX?: number; rivalX?: number; rivalHealth?: number; playerMeter?: number } = {}
): Promise<void> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate((input) => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
        queuePlayerAttack(move: AuraClashMoveId): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash test driver was not installed.");
    driver.setPositions(input.playerX ?? -0.86, input.rivalX ?? 0.44);
    driver.setRivalHealth(input.rivalHealth ?? 300);
    driver.setPlayerMeter(input.playerMeter ?? 100);
  }, options);
}

export async function landKeyboardHit(page: Page): Promise<AuraClashArenaProof> {
  const before = await readAuraClashProof(page);
  for (const code of ["KeyJ", "KeyK", "KeyL", "KeyJ", "KeyK"] as const) {
    await holdKey(page, code, 230);
    await page.waitForTimeout(300);
    const proof = await readAuraClashProof(page);
    if (proof.totalHits > before.totalHits) return proof;
  }
  await queuePlayerAttack(page, "heavy");
  await expect.poll(async () => (await readAuraClashProof(page)).totalHits, {
    timeout: 8_000
  }).toBeGreaterThan(before.totalHits);
  return readAuraClashProof(page);
}

export async function queueNearKoHeavy(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
        queuePlayerAttack(move: AuraClashMoveId): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash KO test driver was not installed.");
    driver.setPositions(-0.95, 0.5);
    driver.setRivalHealth(9);
    driver.setPlayerMeter(100);
    driver.queuePlayerAttack("heavy");
  });
}

export async function queuePlayerAttack(page: Page, move: AuraClashMoveId): Promise<void> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate((queuedMove) => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        queuePlayerAttack(move: AuraClashMoveId): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash attack test driver was not installed.");
    driver.queuePlayerAttack(queuedMove);
  }, move);
}
