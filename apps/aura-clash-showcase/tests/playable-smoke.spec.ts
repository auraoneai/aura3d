import { expect, test, type Page } from "@playwright/test";

type AuraClashV6Proof = {
  route: string;
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
  expect(proof.version).toBe("v6-production-gltf-animation");
  expect(proof.status).toBe("running");
  expect(proof.runtime.frameLoop).toBe(true);
  expect(proof.runtime.evidence).toBe(true);
  await expect(page.locator("canvas#ac6-canvas, canvas#aura-stage-v6")).toBeVisible();
});

test("AuraClash advances frames", async ({ page }) => {
  const before = await loadPlayable(page);
  await expect.poll(async () => (await readProof(page)).frame).toBeGreaterThan(before.frame);
});

test("AuraClash loads GLB fighters", async ({ page }) => {
  const proof = await loadPlayable(page);
  expect(proof.noPrimitiveFighters).toBe(true);
  expect(proof.visibleFighterAsset).toMatch(/v4UAL1Standard\.[a-f0-9]+\.glb$/);
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

test("AuraClash plays attack animation", async ({ page }) => {
  await loadPlayable(page);
  await page.keyboard.down("KeyJ");
  await expect.poll(async () => (await readProof(page)).player.activeClip).toBe("Punch_Jab");
  await page.keyboard.up("KeyJ");
});

test("AuraClash resolves a hit", async ({ page }) => {
  await loadPlayable(page);
  const proof = await landPlayerHit(page);
  expect(proof.totalHits).toBeGreaterThan(0);
  expect(proof.rival.health).toBeLessThan(100);
  expect(proof.lastHitFrame).toBeGreaterThan(0);
  expect(proof.callout).toBe("HIT");
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
  await page.screenshot({ path: "launch-evidence/playable-smoke-v6-first-frame.png", fullPage: true });
  const proof = await landPlayerHit(page);
  await page.screenshot({ path: "launch-evidence/playable-smoke-v6-combat-frame.png", fullPage: true });
  expect(proof.animation.playerLastSkinningPalettes + proof.animation.rivalLastSkinningPalettes).toBeGreaterThan(0);
  expect(proof.rival.health).toBeLessThan(100);
});

async function loadPlayable(page: Page): Promise<AuraClashV6Proof> {
  await page.goto("/playable/", { waitUntil: "networkidle" });
  await page.locator(".ac6").focus();
  await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_V6_PROOF__?: unknown }).__AURA_CLASH_V6_PROOF__));
  const proof = await readProof(page);
  expect(proof.error).toBeNull();
  return proof;
}

async function readProof(page: Page): Promise<AuraClashV6Proof> {
  const proof = await page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_V6_PROOF__?: AuraClashV6Proof }).__AURA_CLASH_V6_PROOF__;
  });
  expect(proof).toBeTruthy();
  return proof!;
}

async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function landPlayerHit(page: Page, options: { reload?: boolean } = {}): Promise<AuraClashV6Proof> {
  if (options.reload !== false) await loadPlayable(page);
  else await page.locator(".ac6").focus();
  await approachCombatRange(page);
  for (const code of ["KeyL", "KeyK", "KeyJ", "KeyL", "KeyK", "KeyJ"]) {
    await hold(page, code, 280);
    await page.waitForTimeout(440);
    const current = await readProof(page);
    if (current.rival.health < 100) return current;
  }
  await expect.poll(async () => (await readProof(page)).rival.health).toBeLessThan(100);
  return readProof(page);
}

async function approachCombatRange(page: Page): Promise<void> {
  for (let index = 0; index < 16; index += 1) {
    const proof = await readProof(page);
    const gap = proof.rival.x - proof.player.x;
    if (Math.abs(gap) <= 1.15) return;
    await hold(page, gap > 0 ? "KeyD" : "KeyA", 220);
  }
}
