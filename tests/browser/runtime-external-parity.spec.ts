import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = resolve(process.cwd(), "tests/reports/external-parity-runtime.json");
const screenshotPath = resolve(process.cwd(), "tests/reports/external-parity-example-screenshots/game-slice-runtime.png");

type ExternalParityRuntimeReport = {
  ok: boolean;
  generatedAt: string;
  screenshots: string[];
  completedTasks: {
    task: string;
    evidence: string[];
  }[];
  blockedTasks: string[];
  gameSlice?: unknown;
  mobileTouch?: unknown;
};

const report: ExternalParityRuntimeReport = {
  ok: false,
  generatedAt: new Date().toISOString(),
  screenshots: ["tests/reports/external-parity-example-screenshots/game-slice-runtime.png"],
  completedTasks: [
    {
      task: "Add runtime scene orchestration used by the ExternalParity game slice.",
      evidence: ["examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add character controller integration with physics, camera, animation, and input.",
      evidence: ["packages/physics/src/CharacterController.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic AI perception and memory evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/Perception.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add behavior-tree blackboard runtime decision evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/BehaviorTree.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add decision-tree branch/action selection evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/DecisionTree.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add utility-AI action scoring and selected-decision evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/UtilityAI.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add finite-state-machine AI lifecycle and transition evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/StateMachine.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add GOAP objective planning evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/GOAP.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add hierarchical-task-network objective decomposition evidence to the ExternalParity game slice.",
      evidence: ["packages/scripting/src/HTN.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add runtime scripting hooks for init, update, fixedUpdate, trigger/collision, input, and teardown.",
      evidence: ["examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add particles integrated into real scenes with blending, sorting, bounds, and performance metrics.",
      evidence: ["examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add spatial audio scene integration with unlock handling and mixer controls.",
      evidence: ["packages/audio/src/SceneAudioBridge.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add runtime error overlay for asset, render, physics, animation, script, and audio errors.",
      evidence: ["examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add mobile/touch controls to viewer, editor, and game examples.",
      evidence: ["examples/asset-viewer/main.ts", "apps/editor/src/viewport/EditorViewport.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old input recording/playback concepts into current runtime input evidence.",
      evidence: ["packages/input/src/InputReplay.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old virtual touch joystick concepts into current runtime input evidence.",
      evidence: ["packages/input/src/VirtualTouchControls.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
  ],
  blockedTasks: [
    "The ExternalParity game slice uses generated local glTF validation assets, not externally licensed production art.",
    "The player asset is rendered as a generated glTF model; lit skinning and animation state machine claims remain blocked here."
  ]
};

test.describe("externalParity runtime systems", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = Boolean(report.gameSlice) && Boolean(report.mobileTouch);
    report.generatedAt = new Date().toISOString();
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("game slice produces externalParity runtime systems, restart, screenshot, and report evidence", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__AURA3D_GAME_DEMO__?.metrics.visualAssetsLoaded === true, undefined, { timeout: 15_000 });

    await page.locator("[data-testid='unlock-audio']").click();
    await setControlValue(page, "[data-testid='binding-select']", "pointer", "change");
    await setControlValue(page, "[data-testid='mixer-volume']", "0.6", "input");
    await setControlValue(page, "[data-testid='mixer-mute']", true, "change");
    await setControlValue(page, "[data-testid='particle-sort']", "front-to-back", "change");
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("touchstart");
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerdown", { clientX: 160, clientY: 120, button: 0, pointerId: 1 });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerup", { clientX: 160, clientY: 120, button: 0, pointerId: 1 });
    await page.locator("[data-testid='inject-script-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-asset-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-render-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-physics-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-animation-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-audio-error']").dispatchEvent("click");
    await page.locator("[data-testid='reload-behavior']").dispatchEvent("click");

    await setTestGamepad(page, 0, false);
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(() => window.__AURA3D_GAME_DEMO__?.metrics.objectivePhase === "won", undefined, { timeout: 45_000 });
    await page.keyboard.up("ArrowRight");
    await page.locator("[data-testid='restart-objective']").click();
    await page.waitForFunction(() => window.__AURA3D_GAME_DEMO__?.metrics.objectivePhase === "playing" && Number(window.__AURA3D_GAME_DEMO__?.metrics.objectiveRestartCount ?? 0) >= 1, undefined, { timeout: 10_000 });
    await page.waitForFunction(() => Number(window.__AURA3D_GAME_DEMO__?.metrics.scriptErrors ?? 0) >= 1, undefined, { timeout: 10_000 });

    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const state = await page.evaluate(() => window.__AURA3D_GAME_DEMO__);
    const pixels = await canvasPixelStats(page);
    report.gameSlice = { state, pixels };

    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.renderer).toBe("webgl2");
    expect(String(state?.visualClaim ?? "")).toContain("Interactive runtime slice");
    expect(state?.metrics.visualAssetsLoaded).toBe(true);
    expect(state?.metrics.productionLikePlayerModel).toBe(true);
    expect(state?.metrics.productionLikeArenaAsset).toBe(true);
    expect(state?.metrics.primitivePlayerFallback).toBe(false);
    expect(Number(state?.metrics.visualAssetRenderItems ?? 0)).toBeGreaterThanOrEqual(16);
    expect(Number(state?.diagnostics?.drawCalls ?? 0)).toBeGreaterThanOrEqual(8);
    expect(state?.metrics.characterController).toBe(true);
    expect(state?.metrics.cameraMode).toBe("third-person-follow");
    expect(Number(state?.metrics.characterControllerJumpCount ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.physicsBodies ?? 0)).toBeGreaterThanOrEqual(6);
    expect(state?.featureEvidence?.oldBranchTwoBoneIkPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchPerceptionPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchBehaviorTreePort).toBe(true);
    expect(state?.featureEvidence?.oldBranchDecisionTreePort).toBe(true);
    expect(state?.featureEvidence?.oldBranchUtilityAiPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchStateMachinePort).toBe(true);
    expect(state?.featureEvidence?.oldBranchGoapPlannerPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchHtnPlannerPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchWeaponSystemPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchFpsWeaponPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchFpsEnemyTacticsPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchFpsLevelPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchFpsHudPort).toBe(true);
    expect(state?.featureEvidence?.renderedSpaceEnvironment).toBe(true);
    expect(state?.featureEvidence?.layeredSpaceBackground).toBe(true);
    expect(state?.featureEvidence?.spaceNebulaDustTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchSpaceWavePowerUpPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchPowerUpEffectPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchInputReplayPort).toBe(true);
    expect(state?.featureEvidence?.inputReplayRecording).toBe(true);
    expect(state?.featureEvidence?.inputReplayPlayback).toBe(true);
    expect(state?.featureEvidence?.inputReplaySeekLoop).toBe(true);
    expect(state?.featureEvidence?.oldBranchVirtualTouchJoystickPort).toBe(true);
    expect(state?.featureEvidence?.virtualTouchJoystickDeadZone).toBe(true);
    expect(state?.featureEvidence?.virtualTouchJoystickClamped).toBe(true);
    expect(state?.featureEvidence?.virtualTouchJoystickRecentered).toBe(true);
    expect(state?.metrics.oldBranchTwoBoneIkPort).toBe(true);
    expect(state?.metrics.twoBoneIkReached).toBe(true);
    expect(Number(state?.metrics.twoBoneIkEndDistance ?? 1)).toBeLessThan(0.01);
    expect(Number(state?.metrics.twoBoneIkUpperLength ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.twoBoneIkLowerLength ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.twoBoneIkPoleInfluence ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchBehaviorTreePort).toBe(true);
    expect(state?.metrics.oldBranchPerceptionPort).toBe(true);
    expect(Number(state?.metrics.aiPerceptionMemoryCount ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.aiPerceptionStrongestMemory ?? "")).toMatch(/pickup|exit|hazard/);
    expect(Number(state?.metrics.aiPerceptionTopConfidence ?? 0)).toBeGreaterThanOrEqual(0);
    expect(String(state?.metrics.aiBehaviorTreeStatus ?? "")).toMatch(/running|success/);
    expect(Number(state?.metrics.aiBehaviorTreeTicks ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.aiBehaviorTreeIntent ?? "")).toMatch(/collect-pickup|reach-exit|celebrate/);
    expect(String(state?.metrics.aiBehaviorTreeTarget ?? "")).toMatch(/pickup|exit/);
    expect(String(state?.metrics.aiBehaviorTreeTrace ?? "")).toContain("intent=");
    expect(Number(state?.metrics.aiBlackboardVersion ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiBlackboardChanges ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchDecisionTreePort).toBe(true);
    expect(String(state?.metrics.aiDecisionTreeAction ?? "")).toMatch(/collect-pickup|reach-exit|evade-hazard|celebrate-objective/);
    expect(state?.metrics.aiDecisionTreeExecuted).toBe(true);
    expect(String(state?.metrics.aiDecisionTreePath ?? "")).toContain("objective-won");
    expect(Number(state?.metrics.aiDecisionTreeNodes ?? 0)).toBeGreaterThanOrEqual(7);
    expect(Number(state?.metrics.aiDecisionTreeDepth ?? 0)).toBeGreaterThanOrEqual(2);
    expect(state?.metrics.oldBranchUtilityAiPort).toBe(true);
    expect(String(state?.metrics.aiUtilityAction ?? "")).toMatch(/collect-pickup|reach-exit|avoid-hazard/);
    expect(Number(state?.metrics.aiUtilityScore ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiUtilityScoreCount ?? 0)).toBeGreaterThanOrEqual(3);
    expect(String(state?.metrics.aiUtilityScores ?? "")).toContain("collect-pickup");
    expect(String(state?.metrics.aiUtilityConsiderations ?? "")).not.toBe("");
    expect(state?.metrics.oldBranchStateMachinePort).toBe(true);
    expect(String(state?.metrics.aiStateMachineState ?? "")).toMatch(/seeking-pickup|seeking-exit|avoiding-hazard|celebrating/);
    expect(Number(state?.metrics.aiStateMachineTicks ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiStateMachineTransitions ?? 0)).toBeGreaterThanOrEqual(1);
    expect(String(state?.metrics.aiStateMachineHistory ?? "")).toContain("seeking");
    expect(String(state?.metrics.aiStateMachineTrace ?? "")).not.toBe("");
    expect(state?.metrics.oldBranchGoapPlannerPort).toBe(true);
    expect(state?.metrics.aiGoapPlanValid).toBe(true);
    expect(Number(state?.metrics.aiGoapPlanLength ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.aiGoapPlanCost ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiGoapNodesExplored ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.aiGoapPlan ?? "")).toContain("collect-pickup");
    expect(String(state?.metrics.aiGoapPlan ?? "")).toContain("finish-objective");
    expect(state?.metrics.oldBranchHtnPlannerPort).toBe(true);
    expect(state?.metrics.aiHtnPlanValid).toBe(true);
    expect(state?.metrics.aiHtnRootTask).toBe("complete-objective");
    expect(Number(state?.metrics.aiHtnPlanLength ?? 0)).toBeGreaterThanOrEqual(2);
    expect(String(state?.metrics.aiHtnPlan ?? "")).toContain("finish-objective");
    expect(String(state?.metrics.aiHtnMethodTrace ?? "")).toContain("complete-objective:");
    expect(Number(state?.metrics.aiHtnDecompositions ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.aiHtnIterations ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchWeaponSystemPort).toBe(true);
    expect(state?.metrics.weaponSystemSource).toBe("origin-master-space-shooter-weapons-adapted");
    expect(Number(state?.metrics.weaponLaserProjectiles ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.weaponMissileProjectiles ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.weaponPlasmaProjectiles ?? 0)).toBeGreaterThanOrEqual(16);
    expect(Number(state?.metrics.weaponTotalDamage ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.weaponMaxSpreadRadians ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchFpsWeaponPort).toBe(true);
    expect(state?.metrics.fpsWeaponSource).toBe("origin-master-fps-weapon-adapted");
    expect(state?.metrics.fpsWeaponName).toBe("M4A1 Rifle");
    expect(state?.metrics.fpsWeaponFiringMode).toBe("auto");
    expect(state?.metrics.fpsWeaponFired).toBe(true);
    expect(Number(state?.metrics.fpsWeaponAmmo ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsWeaponReserveAmmo ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsWeaponBulletsPerShot ?? 0)).toBe(8);
    expect(Number(state?.metrics.fpsWeaponTotalDamage ?? 0)).toBeGreaterThan(100);
    expect(Number(state?.metrics.fpsWeaponSpreadDegrees ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsWeaponFireCooldown ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsWeaponMuzzleFlashSeconds ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsWeaponShellEjectionSeconds ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.fpsWeaponReloadComplete).toBe(true);
    expect(Number(state?.metrics.fpsWeaponReloadedAmmo ?? 0)).toBeGreaterThan(3);
    expect(state?.metrics.oldBranchFpsEnemyTacticsPort).toBe(true);
    expect(state?.metrics.fpsEnemyTacticsSource).toBe("origin-master-fps-enemy-ai-adapted");
    expect(state?.metrics.fpsEnemyAttackState).toBe("attack");
    expect(state?.metrics.fpsEnemyAttackReady).toBe(true);
    expect(state?.metrics.fpsEnemyCoverState).toBe("take_cover");
    expect(state?.metrics.fpsEnemyCoverRequested).toBe(true);
    expect(state?.metrics.fpsEnemyInCover).toBe(true);
    expect(state?.metrics.fpsEnemyInvestigateState).toBe("investigate");
    expect(state?.metrics.fpsEnemyCanHearPlayer).toBe(true);
    expect(Number(state?.metrics.fpsEnemyMovementSpeed ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchFpsLevelPort).toBe(true);
    expect(state?.metrics.fpsLevelSource).toBe("origin-master-fps-level-adapted");
    expect(Number(state?.metrics.fpsLevelRooms ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics.fpsLevelCorridors ?? 0)).toBeGreaterThanOrEqual(7);
    expect(Number(state?.metrics.fpsLevelCoverPoints ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics.fpsLevelPatrolPoints ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics.fpsLevelEnemySpawns ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics.fpsLevelPickupSpawns ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics.fpsLevelNavMeshPoints ?? 0)).toBeGreaterThan(Number(state?.metrics.fpsLevelRooms ?? 0));
    expect(Number(state?.metrics.fpsLevelAverageRoomArea ?? 0)).toBeGreaterThanOrEqual(36);
    expect(Number(state?.metrics.fpsLevelTotalCorridorLength ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchFpsHudPort).toBe(true);
    expect(state?.metrics.fpsHudSource).toBe("origin-master-fps-hud-adapted");
    expect(Number(state?.metrics.fpsHudHealthPercent ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsHudHealthBarPixels ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.fpsHudAmmoText ?? "")).toContain("/");
    expect(Number(state?.metrics.fpsHudDamageFlashAlpha ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fpsHudCrosshairSpreadPixels ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.fpsHudHitMarkerVisible).toBe(true);
    expect(Number(state?.metrics.fpsHudMinimapBlips ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.fpsHudKillFeedVisible).toBe(true);
    expect(String(state?.metrics.fpsHudWaveText ?? "")).toContain("WAVE:");
    expect(state?.metrics.renderedSpaceEnvironment).toBe(true);
    expect(String(state?.metrics.spaceEnvironmentHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(String(state?.metrics.spaceEnvironmentResourceHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.spaceEnvironmentStars ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceEnvironmentVisibleStars ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceEnvironmentNebulae ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceEnvironmentDust ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceEnvironmentForegroundScroll ?? 0)).toBeGreaterThan(Number(state?.metrics.spaceEnvironmentDistantScroll ?? 0));
    expect(Number(state?.metrics.spaceEnvironmentAverageBrightness ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceEnvironmentNebulaCoverage ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceEnvironmentDustAlpha ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchSpaceWavePowerUpPort).toBe(true);
    expect(state?.metrics.spaceWaveSource).toBe("origin-master-space-shooter-wave-powerup-adapted");
    expect(Number(state?.metrics.spaceWaveNumber ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.spaceWaveEnemyType ?? "")).toMatch(/fighter|bomber|turret|carrier|boss/);
    expect(String(state?.metrics.spaceWaveFormation ?? "")).toMatch(/line|v-formation|surround|random|sides/);
    expect(Number(state?.metrics.spaceWaveCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceWaveTotalScoreValue ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spaceWavePowerUpWeight ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchPowerUpEffectPort).toBe(true);
    expect(state?.metrics.powerUpEffectSource).toBe("origin-master-space-shooter-powerup-effects-adapted");
    expect(String(state?.metrics.powerUpEffectType ?? "")).toMatch(/health|shield|weapon|speed|life|multiplier/);
    expect(String(state?.metrics.powerUpChangedFields ?? "")).not.toBe("");
    expect(Number(state?.metrics.triggerEvents ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.objectivePhase).toBe("playing");
    expect(Number(state?.metrics.objectiveWinCount ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.objectiveRestartCount ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.liveParticles ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.particleUploadBytes ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.particleUpdateMs ?? 0)).toBeGreaterThanOrEqual(0);
    expect(state?.metrics.particleSortMode).toBe("front-to-back");
    expect(state?.metrics.particleBlending).toBe(true);
    expect(Number(state?.metrics.particleVisibleAfterCulling ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.audioUnlocked).toBe(true);
    expect(Number(state?.metrics.audioPlays ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.audioMixerVolume ?? 0)).toBeCloseTo(0.6);
    expect(state?.metrics.audioMixerMuted).toBe(true);
    expect(state?.metrics.spatialAudio).toBe(true);
    expect(Number(state?.metrics.spatialDistance ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchInputReplayPort).toBe(true);
    expect(state?.metrics.inputReplaySource).toBe("origin-master-input-recorder-playback-adapted");
    expect(Number(state?.metrics.inputReplayEvents ?? 0)).toBeGreaterThanOrEqual(6);
    expect(Number(state?.metrics.inputReplayFrames ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.inputReplayEmittedEvents ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.inputReplayEvents ?? 0));
    expect(Number(state?.metrics.inputReplayLoopCount ?? 0)).toBeGreaterThanOrEqual(1);
    expect(String(state?.metrics.inputReplayFirstEventTypes ?? "")).toContain("key");
    expect(state?.metrics.oldBranchVirtualTouchJoystickPort).toBe(true);
    expect(state?.metrics.virtualTouchJoystickSource).toBe("origin-master-touch-joystick-virtual-input-adapted");
    expect(Number(state?.metrics.virtualTouchJoystickActiveMagnitude ?? 0)).toBeGreaterThan(0.8);
    expect(Number(state?.metrics.virtualTouchJoystickReleasedMagnitude ?? -1)).toBe(0);
    expect(Number(state?.metrics.virtualTouchJoystickConsumedTouches ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.virtualTouchJoystickDeadZone ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.virtualTouchJoystickFloatingCenter).toBe(true);
    expect(state?.metrics.virtualTouchJoystickReturnToCenter).toBe(true);
    expect(Number(state?.metrics.mobileUnlockAttempts ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.bindingPreset).toBe("pointer");
    expect(Number(state?.metrics.scriptHookInit ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.scriptHookUpdate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.scriptHookFixedUpdate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.scriptHookInput ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.scriptHookTrigger ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.scriptHookCollision ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.scriptHookTeardown ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.runtimeErrorCount ?? 0)).toBeGreaterThanOrEqual(6);
    expect(state?.metrics.runtimeOverlayVisible).toBe(true);
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("script");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("asset");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("render");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("physics");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("animation");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("audio");
    expect(pixels.nonBlankPixels).toBeGreaterThan(300);
    expect(pixels.colorBuckets).toBeGreaterThanOrEqual(1);
  });

  test("asset viewer, editor, and game slice expose mobile touch controls", async ({ page }) => {
    await page.goto(`${server.origin}/examples/asset-viewer/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 30_000 });
    await dispatchTouchDrag(page, "[data-testid='asset-viewer-canvas']", false);
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls?.lastInput)).toBe("touch");
    const assetViewer = await page.evaluate(() => ({
      status: window.__AURA3D_ASSET_VIEWER__?.status,
      lastInput: window.__AURA3D_ASSET_VIEWER__?.cameraControls?.lastInput,
      touchControls: window.__AURA3D_ASSET_VIEWER__?.cameraControls?.touchControls,
      pointerControls: window.__AURA3D_ASSET_VIEWER__?.cameraControls?.pointerControls
    }));

    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 20_000 });
    await dispatchTouchDrag(page, ".editor-viewport", false);
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__?.getState().viewportCamera.lastInput)).toBe("touch");
    const editor = await page.evaluate(() => ({
      status: window.__AURA3D_EDITOR_APP__?.getState().status,
      lastInput: window.__AURA3D_EDITOR_APP__?.getState().viewportCamera.lastInput,
      touchControls: window.__AURA3D_EDITOR_APP__?.getState().viewportCamera.touchControls,
      pointerControls: window.__AURA3D_EDITOR_APP__?.getState().viewportCamera.pointerControls
    }));

    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("touchstart");
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerdown", { clientX: 160, clientY: 120, button: 0, pointerId: 44, pointerType: "touch" });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerup", { clientX: 160, clientY: 120, button: 0, pointerId: 44, pointerType: "touch" });
    await expect.poll(() => page.evaluate(() => Number(window.__AURA3D_GAME_DEMO__?.metrics.mobileUnlockAttempts ?? 0))).toBeGreaterThanOrEqual(1);
    const game = await page.evaluate(() => ({
      status: window.__AURA3D_GAME_DEMO__?.status,
      mobileUnlockAttempts: window.__AURA3D_GAME_DEMO__?.metrics.mobileUnlockAttempts,
      mobileUnlockHandling: window.__AURA3D_GAME_DEMO__?.metrics.mobileUnlockHandling,
      pointerTouches: window.__AURA3D_GAME_DEMO__?.metrics.pointerTouches
    }));

    report.mobileTouch = { assetViewer, editor, game };
    expect(assetViewer).toMatchObject({ status: "ready", lastInput: "touch", touchControls: true, pointerControls: true });
    expect(editor).toMatchObject({ status: "ready", lastInput: "touch", touchControls: true, pointerControls: true });
    expect(game).toMatchObject({ status: "ready", mobileUnlockHandling: true });
  });
});

async function setTestGamepad(page: Page, axisX: number, jump: boolean): Promise<void> {
  await page.evaluate(({ axisX, jump }) => {
    window.__AURA3D_TEST_GAMEPADS__ = [{
      id: "external-parity-runtime-gamepad",
      index: 0,
      connected: true,
      axes: [axisX, 0],
      buttons: [{ pressed: jump, value: jump ? 1 : 0 }],
    }];
  }, { axisX, jump });
}

async function setControlValue(page: Page, selector: string, value: string | boolean, eventType: "change" | "input"): Promise<void> {
  await page.locator(selector).evaluate((element, payload) => {
    if (element instanceof HTMLInputElement && typeof payload.value === "boolean") {
      element.checked = payload.value;
      element.dispatchEvent(new Event(payload.eventType, { bubbles: true }));
      return;
    }
    if ((element instanceof HTMLInputElement || element instanceof HTMLSelectElement) && typeof payload.value === "string") {
      element.value = payload.value;
      element.dispatchEvent(new Event(payload.eventType, { bubbles: true }));
      return;
    }
    throw new Error(`Unsupported control for ${payload.selector}`);
  }, { selector, value, eventType });
}

async function canvasPixelStats(page: Page): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='game-slice-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { nonBlankPixels: 0, colorBuckets: 0 };
    const width = Math.min(320, canvas.width);
    const height = Math.min(180, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const a = pixels[index + 3] ?? 0;
      if (r > 8 || g > 8 || b > 8 || a > 8) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      }
    }
    return { nonBlankPixels, colorBuckets: buckets.size };
  });
}

async function dispatchTouchDrag(page: Page, selector: string, shiftKey: boolean): Promise<void> {
  await page.locator(selector).evaluate((element, payload) => {
    const target = element as HTMLElement;
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 180,
      pointerId: 73,
      pointerType: "touch",
      button: 0,
      shiftKey: payload.shiftKey
    };
    target.dispatchEvent(new PointerEvent("pointerdown", options));
    target.dispatchEvent(new PointerEvent("pointermove", { ...options, clientX: 232, clientY: 206 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...options, clientX: 232, clientY: 206 }));
  }, { shiftKey });
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    __AURA3D_GAME_DEMO__?: {
      readonly status: "ready" | "error";
      readonly renderer?: string;
      readonly visualClaim?: string;
      readonly metrics: Record<string, number | string | boolean>;
      readonly featureEvidence?: Record<string, number | string | boolean>;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly error?: string;
    };
    __AURA3D_ASSET_VIEWER__?: {
      readonly status: "ready" | "error";
      readonly cameraControls?: {
        readonly lastInput?: string;
        readonly touchControls?: boolean;
        readonly pointerControls?: boolean;
      };
    };
    __AURA3D_EDITOR_APP__?: {
      getState(): {
        readonly status: "ready" | "error" | "booting";
        readonly viewportCamera: {
          readonly lastInput?: string;
          readonly touchControls?: boolean;
          readonly pointerControls?: boolean;
        };
      };
    };
    __AURA3D_TEST_GAMEPADS__?: readonly {
      readonly id: string;
      readonly index: number;
      readonly connected: boolean;
      readonly axes: readonly number[];
      readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
    }[];
  }
}
