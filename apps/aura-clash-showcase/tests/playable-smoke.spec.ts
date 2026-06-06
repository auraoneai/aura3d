import { expect, test, type Page } from "@playwright/test";

type AuraClashArenaProof = {
  route: string;
  app: "Aura Clash Arena";
  release: "1.0.9";
  version: string;
  status: "loading" | "running" | "paused" | "error";
  error: string | null;
  frame: number;
  roundTime: number;
  totalHits: number;
  lastHitFrame: number;
  callout: string;
  visibleFighterAsset: string;
  noPrimitiveFighters: true;
  renderer: {
    surface: "aura3d-production-gltf-animation";
    backend: string;
    drawCalls: number;
  };
  player: ProofFighter;
  rival: ProofFighter;
  animation: {
    visibleSkinnedGlb: true;
    skinnedDrawItems: number;
    playerSkinningBindings: number;
    rivalSkinningBindings: number;
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
  controls: {
    lastInput: string;
    downSupported: boolean;
    specialRequiresMeter: boolean;
    koLocked: boolean;
    resetCount: number;
  };
  fighterAssets: {
    player: { id: string; url: string; hash: string };
    rival: { id: string; url: string; hash: string };
    distinct: boolean;
    releaseReady: boolean;
  };
};

type ProofFighter = {
  name: string;
  health: number;
  meter: number;
  x: number;
  y: number;
  grounded: boolean;
  action: string;
  activeClip: string;
  attacking: string | null;
};

test("AuraClash boots Aura3D runtime", async ({ page }) => {
  const proof = await loadPlayable(page);
  expect(proof.route).toBe("/playable/");
  expect(proof.app).toBe("Aura Clash Arena");
  expect(proof.release).toBe("1.0.9");
  expect(proof.version).toBe("aura-clash-arena-production-gltf-animation");
  expect(proof.status).toBe("running");
  expect(proof.runtime.frameLoop).toBe(true);
  expect(proof.runtime.evidence).toBe(true);
  await expect(page.locator("canvas#aura-clash-arena-canvas")).toBeVisible();
  expect(await page.locator("body").textContent()).not.toMatch(/Aura Clash V\d+/);
});

test("AuraClash advances frames", async ({ page }) => {
  const before = await loadPlayable(page);
  await expect.poll(async () => (await readProof(page)).frame).toBeGreaterThan(before.frame);
});

test("AuraClash loads GLB fighters", async ({ page }) => {
  const proof = await loadPlayable(page);
  expect(proof.noPrimitiveFighters).toBe(true);
  expect(proof.visibleFighterAsset).toMatch(/auraClashPlayerRig\.[a-f0-9]+\.glb$/);
  expect(proof.fighterAssets.distinct).toBe(true);
  expect(proof.fighterAssets.releaseReady).toBe(true);
  expect(proof.fighterAssets.player.id).toBe("auraClashPlayerRig");
  expect(proof.fighterAssets.rival.id).toBe("auraClashRivalRig");
  expect(proof.fighterAssets.player.hash).not.toBe(proof.fighterAssets.rival.hash);
  expect(proof.fighterAssets.player.id).not.toBe("auraClashTrainingMannequin");
  expect(proof.fighterAssets.rival.id).not.toBe("auraClashTrainingMannequin");
  expect(proof.animation.visibleSkinnedGlb).toBe(true);
  expect(proof.animation.skinnedDrawItems).toBeGreaterThan(0);
  expect(proof.animation.playerSkinningBindings).toBeGreaterThan(0);
  expect(proof.animation.rivalSkinningBindings).toBeGreaterThan(0);
  const statuses = await page.evaluate(async (urls) => Promise.all(urls.map((url) => fetch(url).then((response) => response.status))), [
    proof.fighterAssets.player.url,
    proof.fighterAssets.rival.url
  ]);
  expect(statuses).toEqual([200, 200]);
});

test("AuraClash responds to movement input", async ({ page }) => {
  const before = await loadPlayable(page);
  await hold(page, "KeyD", 700);
  const after = await readProof(page);
  expect(after.player.x).toBeGreaterThan(before.player.x + 0.08);
  expect(after.animation.playerLastTracks).toBeGreaterThan(0);
});

test("AuraClash supports down and fast-fall input", async ({ page }) => {
  await loadPlayable(page);
  await hold(page, "KeyS", 260);
  await expect.poll(async () => (await readProof(page)).player.action).toBe("down");
  await hold(page, "Space", 100);
  await page.keyboard.down("KeyS");
  await expect.poll(async () => (await readProof(page)).controls.lastInput).toBe("down");
  await page.keyboard.up("KeyS");
});

test("AuraClash supports guard input", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyQ");
  await expect.poll(async () => (await readProof(page)).player.action).toBe("guard");
  const proof = await readProof(page);
  expect(proof.controls.lastInput).toBe("guard");
  await page.keyboard.up("KeyQ");
});

test("AuraClash plays attack animation", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyJ");
  await expect.poll(async () => (await readProof(page)).player.activeClip).toBe("Punch_Jab");
  await page.keyboard.up("KeyJ");
});

test("AuraClash gates special without crashing or pausing", async ({ page }) => {
  const before = await loadPlayable(page);
  expect(before.controls.specialRequiresMeter).toBe(true);
  await hold(page, "KeyL", 240);
  const after = await readProof(page);
  expect(after.status).toBe("running");
  expect(after.error).toBeNull();
  expect(after.controls.lastInput).toBe("special");
  expect(after.player.health).toBe(before.player.health);
});

test("AuraClash resolves a hit", async ({ page }) => {
  const before = await loadPlayable(page);
  const proof = await landPlayerHit(page);
  expect(proof.totalHits).toBeGreaterThan(0);
  expect(proof.rival.health).toBeLessThan(before.rival.health);
  expect(proof.rival.health).toBeGreaterThan(0);
  expect(proof.lastHitFrame).toBeGreaterThan(0);
  expect(proof.callout).toBe("HIT");
  expect(Math.abs(proof.rival.x - proof.player.x)).toBeGreaterThanOrEqual(0.72);
  expect(proof.player.grounded).toBe(true);
});

test("AuraClash updates HUD health", async ({ page }) => {
  const proof = await landPlayerHit(page);
  await expect(page.locator("#rival-state")).toContainText(`${proof.rival.health} HP`);
  await expect(page.locator("#toast")).toContainText(/lands|damage/i);
});

test("AuraClash supports pause", async ({ page }) => {
  await loadPlayable(page);
  await hold(page, "KeyP", 180);
  await expect.poll(async () => (await readProof(page)).status).toBe("paused");
  await expect(page.locator("#callout")).toHaveText("PAUSE");
  await hold(page, "KeyP", 180);
  await expect.poll(async () => (await readProof(page)).status).toBe("running");
});

test("AuraClash captures visual proof screenshots", async ({ page }) => {
  test.setTimeout(60_000);
  await loadPlayable(page);
  await page.screenshot({ path: "launch-evidence/aura-clash-arena-first-frame.png", fullPage: true });
  const proof = await landPlayerHit(page);
  await page.screenshot({ path: "launch-evidence/aura-clash-arena-combat-frame.png", fullPage: true });
  expect(proof.animation.playerLastSkinningPalettes + proof.animation.rivalLastSkinningPalettes).toBeGreaterThan(0);
  expect(proof.rival.health).toBeLessThan(240);
});

test("AuraClash locks combat after KO and reset clears the round; any control starts the next round", async ({ page }) => {
  test.setTimeout(35_000);
  await loadPlayable(page, "?auraTestDriver=1");
  await queueNearKoHeavy(page);
  await expect.poll(async () => (await readProof(page)).rival.health, {
    message: "deterministic heavy strike should KO the near-KO rival through the normal resolver"
  }).toBe(0);
  const proof = await readProof(page);
  expect(proof.rival.health).toBe(0);
  expect(proof.controls.koLocked).toBe(true);
  const hitsAtKo = proof.totalHits;
  await page.waitForTimeout(260);
  const afterKo = await readProof(page);
  expect(afterKo.totalHits).toBe(hitsAtKo);
  await hold(page, "KeyL", 180);
  await expect.poll(async () => (await readProof(page)).controls.resetCount).toBeGreaterThan(0);
  const reset = await readProof(page);
  expect(reset.player.health).toBe(240);
  expect(reset.rival.health).toBe(240);
  expect(reset.totalHits).toBe(0);
  expect(reset.controls.koLocked).toBe(false);
});

async function loadPlayable(page: Page, search = ""): Promise<AuraClashArenaProof> {
  await page.goto(`/playable/${search}`, { waitUntil: "networkidle" });
  await page.locator(".aca").focus();
  await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_ARENA_PROOF__?: unknown }).__AURA_CLASH_ARENA_PROOF__));
  const proof = await readProof(page);
  expect(proof.error).toBeNull();
  return proof;
}

async function readProof(page: Page): Promise<AuraClashArenaProof> {
  const proof = await page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__;
  });
  expect(proof).toBeTruthy();
  return proof!;
}

async function queueNearKoHeavy(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as Window & {
    __AURA_CLASH_ARENA_TEST_DRIVER__?: unknown;
  }).__AURA_CLASH_ARENA_TEST_DRIVER__), null, { timeout: 3_000 });
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: {
        setRivalHealth(health: number): void;
        setPlayerMeter(meter: number): void;
        setPositions(playerX: number, rivalX: number): void;
        queuePlayerAttack(move: "light" | "heavy" | "special"): void;
      };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash KO test driver was not installed.");
    driver.setPositions(-0.95, 0.5);
    driver.setRivalHealth(9);
    driver.setPlayerMeter(100);
    driver.queuePlayerAttack("heavy");
  });
}

async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function landPlayerHit(page: Page, options: { reload?: boolean } = {}): Promise<AuraClashArenaProof> {
  const start = options.reload !== false ? await loadPlayable(page) : await readProof(page);
  if (options.reload === false) await page.locator(".aca").focus();
  await approachCombatRange(page);
  await expect.poll(async () => (await readProof(page)).player.grounded).toBe(true);
  for (const code of ["KeyK", "KeyJ", "KeyK", "KeyJ", "KeyK", "KeyJ", "KeyK", "KeyJ", "KeyK", "KeyJ", "KeyK", "KeyJ"] as const) {
    await approachCombatRange(page);
    await hold(page, code, 240);
    await page.waitForTimeout(520);
    const current = await readProof(page);
    if (current.rival.health < start.rival.health) return current;
  }
  await expect.poll(async () => (await readProof(page)).rival.health, { timeout: 20_000 }).toBeLessThan(start.rival.health);
  return readProof(page);
}

async function approachCombatRange(page: Page): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    const proof = await readProof(page);
    const gap = proof.rival.x - proof.player.x;
    if (Math.abs(gap) >= 0.9 && Math.abs(gap) <= 1.18 && proof.player.grounded) return;
    await hold(page, gap > 0 ? "KeyD" : "KeyA", Math.abs(gap) > 1.25 ? 180 : 70);
  }
}
