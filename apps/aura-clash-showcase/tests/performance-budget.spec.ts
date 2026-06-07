import { expect, test } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { holdKey, loadAuraClashArena, readAuraClashProof } from "./helpers/auraClashArenaHarness";

test("Aura Clash enforces route performance and asset budgets", async ({ page }) => {
  test.setTimeout(75_000);
  await loadAuraClashArena(page);

  for (let index = 0; index < 12; index += 1) {
    await holdKey(page, index % 2 === 0 ? "KeyD" : "KeyA", 160);
    await holdKey(page, index % 3 === 0 ? "KeyJ" : "KeyK", 120);
  }

  const proof = await readAuraClashProof(page);
  expect(proof.performance, "performance proof must be published every frame").toBeTruthy();
  expect(proof.performance?.budgetOk, "release proof must stay inside the 60fps-class route budget").toBe(true);
  expect(proof.performance?.frameTimeMs).toBeLessThanOrEqual(16.7);
  expect(proof.performance?.fps).toBeGreaterThanOrEqual(55);
  expect(proof.performance?.drawCalls).toBeLessThanOrEqual(160);

  const resourceBudget = readProductionAssetBudget();

  expect(resourceBudget.resourceCount).toBeGreaterThan(0);
  expect(resourceBudget.jsBytes, "Built JS budget should stay under 1.4 MB for the showcase route").toBeLessThan(1_400_000);
  expect(resourceBudget.cssBytes, "CSS budget should stay under 180 KB encoded for the showcase route").toBeLessThan(180_000);
  expect(resourceBudget.maxGlbBytes, "Each playable fighter GLB should stay under 8.5 MB").toBeLessThan(8_500_000);
  expect(resourceBudget.glbBytes, "Combined playable fighter GLB budget should stay under 17 MB").toBeLessThan(17_000_000);
});

test("Aura Clash keeps long-session memory and DOM counts stable", async ({ page }) => {
  test.setTimeout(90_000);
  await loadAuraClashArena(page);

  const baseline = await sampleRuntimeStability(page);

  for (let index = 0; index < 36; index += 1) {
    await holdKey(page, index % 2 === 0 ? "KeyD" : "KeyA", 120);
    await holdKey(page, index % 4 === 0 ? "KeyL" : index % 3 === 0 ? "KeyK" : "KeyJ", 110);
    if (index % 6 === 0) await holdKey(page, "KeyW", 90);
    if (index % 9 === 0) await holdKey(page, "ShiftLeft", 120);
    await page.waitForTimeout(80);
  }

  await page.waitForTimeout(750);
  const final = await sampleRuntimeStability(page);
  const proof = await readAuraClashProof(page);

  expect(proof.performance?.budgetOk, "long-session route proof should remain inside the active performance budget").toBe(true);
  expect(final.canvasCount, "long-session play should not leak canvases").toBe(baseline.canvasCount);
  expect(final.domNodeCount, "long-session play should not grow route DOM nodes unbounded").toBeLessThanOrEqual(baseline.domNodeCount + 12);
  expect(final.proofFrame, "proof frame should continue advancing during the stability run").toBeGreaterThan(baseline.proofFrame + 60);

  if (baseline.usedJSHeapSize !== null && final.usedJSHeapSize !== null) {
    const heapGrowth = final.usedJSHeapSize - baseline.usedJSHeapSize;
    expect(heapGrowth, "long-session JS heap growth should stay under 14 MB").toBeLessThan(14_000_000);
  }
});

function readProductionAssetBudget(): {
  jsBytes: number;
  cssBytes: number;
  glbBytes: number;
  maxGlbBytes: number;
  resourceCount: number;
} {
  const distAssets = resolve(process.cwd(), "dist/assets");
  const publicAssets = resolve(process.cwd(), "public/aura-assets");
  const distFiles = readdirSync(distAssets).map((name) => join(distAssets, name));
  const jsBytes = distFiles.filter((file) => file.endsWith(".js")).reduce((sum, file) => sum + statSync(file).size, 0);
  const cssBytes = distFiles.filter((file) => file.endsWith(".css")).reduce((sum, file) => sum + statSync(file).size, 0);
  const glbFiles = readdirSync(publicAssets)
    .filter((name) => /^auraClash(Player|Rival)Rig\..+\.glb$/.test(name))
    .map((name) => join(publicAssets, name));
  const glbSizes = glbFiles.map((file) => statSync(file).size);
  return {
    jsBytes,
    cssBytes,
    glbBytes: glbSizes.reduce((sum, size) => sum + size, 0),
    maxGlbBytes: Math.max(...glbSizes),
    resourceCount: distFiles.length + glbFiles.length
  };
}

async function sampleRuntimeStability(page: import("@playwright/test").Page): Promise<{
  usedJSHeapSize: number | null;
  domNodeCount: number;
  canvasCount: number;
  proofFrame: number;
}> {
  return page.evaluate(() => {
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }).memory;
    const proof = (window as Window & {
      __AURA_CLASH_ARENA_PROOF__?: { frame?: number };
    }).__AURA_CLASH_ARENA_PROOF__;

    return {
      usedJSHeapSize: typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null,
      domNodeCount: document.querySelectorAll("*").length,
      canvasCount: document.querySelectorAll("canvas").length,
      proofFrame: proof?.frame ?? 0
    };
  });
}
