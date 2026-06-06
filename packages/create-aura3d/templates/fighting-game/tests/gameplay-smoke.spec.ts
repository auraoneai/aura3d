import { expect, test } from "@playwright/test";

test("input replay produces runtime evidence and a hit declaration", async ({ page }) => {
  await page.goto("/");
  await page.click("#hud-replay-button");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_EVIDENCE__?.systems?.inputPlan));
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_RUNTIME__?.kind === "aura-game-app-runtime-evidence"));
  await page.waitForFunction(() => ((window as any).__AURA3D_GAME_REPLAY__?.hitCount ?? 0) > 0);
  const evidence = await page.evaluate(() => (window as any).__AURA3D_GAME_EVIDENCE__);
  const runtime = await page.evaluate(() => (window as any).__AURA3D_GAME_RUNTIME__);
  const replay = await page.evaluate(() => (window as any).__AURA3D_GAME_REPLAY__);
  const source = await page.evaluate(() => (window as any).__AURA3D_GAME_SOURCE__);

  expect(runtime).toMatchObject({
    status: "running",
    running: true,
    started: true,
    startCount: 1,
    inputControllers: 1,
    activeInputControllers: 1
  });
  expect(runtime.frame).toBeGreaterThan(0);
  expect(runtime.loop.frame).toBeGreaterThan(0);
  expect(evidence.systems.mutableNodes).toBeTruthy();
  expect(evidence.systems.inputPlan).toBeTruthy();
  expect(evidence.systems.physicsPlan).toBeTruthy();
  expect(evidence.systems.collisionPlan).toBeTruthy();
  expect(evidence.systems.animationPlan).toBeTruthy();
  expect(evidence.systems.effectsPlan).toBeTruthy();
  expect(evidence.systems.cameraPlan).toBeTruthy();
  expect(evidence.systems.stagePlan).toBeTruthy();
  expect(replay.hitCount).toBeGreaterThan(0);
  expect(source.readiness.sourceOnly).toBe(true);
  expect(source.readiness.publicEngineApis).toContain("games.fighting.stagePreset");
});
