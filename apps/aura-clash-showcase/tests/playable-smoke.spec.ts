import { expect, test, type Page } from "@playwright/test";

type AuraClashArenaProof = {
  route: string;
  app: "Aura Clash Arena";
  release: "1.0.6";
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
  expect(proof.release).toBe("1.0.6");
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
  expect(proof.visibleFighterAsset).toMatch(/auraClashTrainingMannequin\.[a-f0-9]+\.glb$/);
  expect(proof.animation.visibleSkinnedGlb).toBe(true);
  expect(proof.animation.skinnedDrawItems).toBeGreaterThan(0);
  expect(proof.animation.playerSkinningBindings).toBeGreaterThan(0);
  expect(proof.animation.rivalSkinningBindings).toBeGreaterThan(0);
  const status = await page.evaluate(async (url) => fetch(url).then((response) => response.status), proof.visibleFighterAsset);
  expect(status).toBe(200);
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
  expect(proof.rival.health).toBeLessThan(120);
});

test("AuraClash locks combat after KO and reset clears the round", async ({ page }) => {
  test.setTimeout(90_000);
  await loadPlayable(page);
  let proof = await readProof(page);
  for (let index = 0; index < 48 && proof.rival.health > 0; index += 1) {
    await approachCombatRange(page);
    await hold(page, "KeyK", 260);
    await page.waitForTimeout(520);
    proof = await readProof(page);
  }
  expect(proof.rival.health).toBe(0);
  expect(proof.controls.koLocked).toBe(true);
  const hitsAtKo = proof.totalHits;
  await hold(page, "KeyK", 360);
  await page.waitForTimeout(500);
  const afterKo = await readProof(page);
  expect(afterKo.totalHits).toBe(hitsAtKo);
  await hold(page, "KeyR", 180);
  await expect.poll(async () => (await readProof(page)).controls.resetCount).toBeGreaterThan(0);
  const reset = await readProof(page);
  expect(reset.player.health).toBe(120);
  expect(reset.rival.health).toBe(120);
  expect(reset.totalHits).toBe(0);
  expect(reset.controls.koLocked).toBe(false);
});

async function loadPlayable(page: Page): Promise<AuraClashArenaProof> {
  await page.goto("/playable/", { waitUntil: "networkidle" });
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
  for (const code of ["KeyK", "KeyJ", "KeyK", "KeyJ"]) {
    await hold(page, code, 240);
    await page.waitForTimeout(440);
    const current = await readProof(page);
    if (current.rival.health < start.rival.health) return current;
  }
  await expect.poll(async () => (await readProof(page)).rival.health).toBeLessThan(start.rival.health);
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
