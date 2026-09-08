import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("input replay produces runtime evidence and a hit declaration", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_SOURCE__?.readiness));
  await page.getByRole("button", { name: "Run replay" }).click();
  await page.waitForFunction(() => {
    const evidence = (window as any).__AURA3D_GAME_EVIDENCE__;
    const runtime = (window as any).__AURA3D_GAME_RUNTIME__;
    const replay = (window as any).__AURA3D_GAME_REPLAY__;
    const source = (window as any).__AURA3D_GAME_SOURCE__;
    return Boolean(
      runtime?.kind === "aura-game-app-runtime-evidence" &&
      runtime.status === "running" &&
      runtime.running === true &&
      runtime.started === true &&
      runtime.startCount === 1 &&
      runtime.inputControllers === 1 &&
      runtime.activeInputControllers === 1 &&
      runtime.frame > 0 &&
      runtime.loop?.frame > 0 &&
      evidence?.systems?.mutableNodes &&
      evidence.systems.inputPlan &&
      evidence.systems.physicsPlan &&
      evidence.systems.collisionPlan &&
      evidence.systems.animationPlan &&
      evidence.systems.effectsPlan &&
      evidence.systems.cameraPlan &&
      evidence.systems.stagePlan &&
      replay?.hitCount > 0 &&
      source?.readiness?.sourceOnly === false &&
      source.readiness.placeholderMode === false &&
      source.readiness.proofMode === "typed-assets" &&
      Array.isArray(source.readiness.missingTypedAssets) &&
      source.readiness.missingTypedAssets.length === 0 &&
      source.readiness.publicEngineApis?.includes("games.fighting.stagePreset")
    );
  });
});
