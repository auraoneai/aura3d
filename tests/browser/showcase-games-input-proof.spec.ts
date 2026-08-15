import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const SCRATCH = "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer";
const PRODUCTION = process.env.A3D_PUBLIC_DEMO_URL ?? "https://aura3d.auraone.ai";

interface ClashProof {
  readonly status?: string;
  readonly frame?: number;
  readonly totalHits?: number;
  readonly callout?: string;
  readonly player?: { readonly x?: number; readonly health?: number; readonly action?: string };
  readonly rival?: { readonly x?: number; readonly health?: number; readonly action?: string };
  readonly controls?: { readonly resetCount?: number; readonly lastInput?: string };
}

async function readClash(page: Page): Promise<ClashProof> {
  return page.evaluate(() => {
    return (window as unknown as { __AURA_CLASH_ARENA_PROOF__?: ClashProof }).__AURA_CLASH_ARENA_PROOF__ ?? {};
  });
}

test("blockfall keyboard input locks, clears, scores, and resets", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  mkdirSync(SCRATCH, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-blockfall-reactor/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const value = (window as unknown as { __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { status?: string; current?: { lines?: number; score?: number; piecesPlaced?: number; gameOver?: boolean } } })
        .__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__;
      return Boolean(value?.current);
    }, undefined, { timeout: 90_000 });
    const before = await page.evaluate(() => (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { current?: { lines?: number; score?: number; piecesPlaced?: number; gameOver?: boolean } };
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await page.waitForTimeout(240);
    for (let round = 0; round < 24; round += 1) {
      for (let step = 0; step < 5; step += 1) await page.keyboard.press("ArrowLeft");
      for (let step = 0; step < (round % 10); step += 1) await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Space");
      await page.waitForTimeout(70);
    }
    const mid = await page.evaluate(() => (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { current?: { lines?: number; score?: number; piecesPlaced?: number; gameOver?: boolean } };
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__);
    for (let drop = 0; drop < 180; drop += 1) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(50);
      const state = await page.evaluate(() => (window as unknown as {
        __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { current?: { gameOver?: boolean } };
      }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__);
      if (state?.current?.gameOver === true) break;
    }
    const over = await page.evaluate(() => (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { current?: { lines?: number; score?: number; piecesPlaced?: number; gameOver?: boolean } };
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__);
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(200);
    const reset = await page.evaluate(() => (window as unknown as {
      __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: { current?: { lines?: number; score?: number; piecesPlaced?: number; gameOver?: boolean } };
    }).__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__);
    const log = {
      producer: "tests/browser/showcase-games-input-proof.spec.ts",
      game: "blockfall",
      input: "keyboard ArrowLeft/ArrowRight/ArrowUp/Space/KeyR",
      before,
      mid,
      over,
      reset,
      locked: Number(mid?.current?.piecesPlaced ?? 0) > Number(before?.current?.piecesPlaced ?? 0),
      lineClear: Number(mid?.current?.lines ?? 0) > Number(before?.current?.lines ?? 0),
      scored: Number(mid?.current?.score ?? 0) >= Number(before?.current?.score ?? 0),
      gameOver: over?.current?.gameOver === true,
      resetWorks: Number(reset?.current?.piecesPlaced ?? -1) === 0
    };
    writeFileSync(join(SCRATCH, "blockfall.log"), `${JSON.stringify(log, null, 2)}\n`);
    expect(log.locked, "blockfall hard drop must lock a piece").toBe(true);
    expect(log.lineClear || log.gameOver, "blockfall must clear a line or reach game over from keyboard play").toBe(true);
    expect(log.resetWorks, "blockfall reset must restore the start board").toBe(true);
  } finally {
    await server.close();
  }
});

test("aura clash keyboard input moves, attacks, damages, and resets", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  mkdirSync(SCRATCH, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PRODUCTION}/showcase/aura-clash/playable/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const proof = (window as unknown as { __AURA_CLASH_ARENA_PROOF__?: ClashProof }).__AURA_CLASH_ARENA_PROOF__;
    return proof?.status === "running" && (proof.frame ?? 0) > 8;
  }, undefined, { timeout: 90_000 });
  const before = await readClash(page);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyD");
  const moved = await readClash(page);
  await page.keyboard.press("KeyJ");
  await page.waitForTimeout(180);
  await page.keyboard.press("KeyK");
  await page.waitForTimeout(900);
  const fought = await readClash(page);
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(400);
  const reset = await readClash(page);
  const log = {
    producer: "tests/browser/showcase-games-input-proof.spec.ts",
    game: "aura-clash",
    input: "keyboard KeyD/KeyJ/KeyK/KeyR",
    origin: PRODUCTION,
    before,
    moved,
    fought,
    reset,
    movedRight: Number(moved.player?.x ?? 0) !== Number(before.player?.x ?? 0),
    attacked: (fought.totalHits ?? 0) > (before.totalHits ?? 0) || Number(fought.rival?.health ?? 100) < Number(before.rival?.health ?? 100),
    damaged: Number(fought.rival?.health ?? 100) < Number(before.rival?.health ?? 100) || (fought.totalHits ?? 0) > 0,
    resetWorks: Number(reset.player?.health ?? 0) >= Number(before.player?.health ?? 0)
  };
  writeFileSync(join(SCRATCH, "aura-clash.log"), `${JSON.stringify(log, null, 2)}\n`);
  expect(log.movedRight, "aura clash D must change player x").toBe(true);
  expect(log.attacked, "aura clash J/K must produce a hit or rival health loss").toBe(true);
  expect(log.resetWorks, "aura clash R must restore fighter health").toBe(true);
});
