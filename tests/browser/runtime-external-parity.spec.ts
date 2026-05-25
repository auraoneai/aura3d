import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = resolve(process.cwd(), "tests/reports/external-parity-runtime.json");
const screenshotPath = resolve(process.cwd(), "tests/reports/external-parity-example-screenshots/game-slice-runtime.png");

type V4RuntimeReport = {
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

const report: V4RuntimeReport = {
  ok: false,
  generatedAt: new Date().toISOString(),
  screenshots: ["tests/reports/external-parity-example-screenshots/game-slice-runtime.png"],
  completedTasks: [
    {
      task: "Add runtime scene orchestration used by the V4 game slice.",
      evidence: ["examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add character controller integration with physics, camera, animation, and input.",
      evidence: ["packages/physics/src/CharacterController.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic AI navigation pathfinding and agent-steering evidence to the V4 game slice.",
      evidence: ["packages/physics/src/Navigation.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic arrive/steering behavior evidence to the V4 game slice.",
      evidence: ["packages/physics/src/Steering.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic flee, pursuit, evade, and wander steering evidence to the V4 game slice.",
      evidence: ["packages/physics/src/Steering.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic flocking, obstacle avoidance, wall avoidance, and steering-pipeline evidence to the V4 game slice.",
      evidence: ["packages/physics/src/Steering.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic crowd formation and neighbor-avoidance evidence to the V4 game slice.",
      evidence: ["packages/physics/src/Crowd.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add deterministic AI perception and memory evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/Perception.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add behavior-tree blackboard runtime decision evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/BehaviorTree.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add decision-tree branch/action selection evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/DecisionTree.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add utility-AI action scoring and selected-decision evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/UtilityAI.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add finite-state-machine AI lifecycle and transition evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/StateMachine.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add GOAP objective planning evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/GOAP.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Add hierarchical-task-network objective decomposition evidence to the V4 game slice.",
      evidence: ["packages/scripting/src/HTN.ts", "examples/game-slice/main.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old adaptive difficulty and balancing concepts into current runtime evidence.",
      evidence: ["packages/scripting/src/AdaptiveDifficultyFixtures.ts", "examples/game-slice/main.ts", "tests/unit/scripting/weapon-system.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old networking prediction, reconciliation, delta compression, interpolation, and interest-management concepts into current runtime evidence.",
      evidence: ["packages/scripting/src/NetworkReplicationFixtures.ts", "examples/game-slice/main.ts", "tests/unit/scripting/weapon-system.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old cloth simulation, collision, tearing, and material concepts into current runtime evidence.",
      evidence: ["packages/physics/src/ClothFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream4.physics-animation.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old soft-body tetrahedral mesh, deformation, collision, and attachment concepts into current runtime evidence.",
      evidence: ["packages/physics/src/SoftBodyFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream4.physics-animation.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old Voronoi and hierarchical fracture concepts into current runtime evidence.",
      evidence: ["packages/physics/src/FractureFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream4.physics-animation.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old SPH, MPM, particle-buffer, and fluid-renderer concepts into current runtime evidence.",
      evidence: ["packages/physics/src/FluidFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream4.physics-animation.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old fire, smoke, particle-emission, pressure-projection, and ray-marching concepts into current runtime evidence.",
      evidence: ["packages/physics/src/FireSmokeFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream4.physics-animation.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
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
      task: "Port bounded old compressor, EQ, and spectrum-analysis audio concepts into current runtime evidence.",
      evidence: ["packages/audio/src/AudioEffectsAnalysisFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
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
      task: "Port bounded old input action binding processor and interaction concepts into current runtime evidence.",
      evidence: ["packages/input/src/InputActionBindingFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old gesture detection and rumble-pattern concepts into current runtime input evidence.",
      evidence: ["packages/input/src/GestureHapticsFixtures.ts", "examples/game-slice/main.ts", "tests/unit/input/gesture-haptics-fixtures.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old motion-matching trajectory/database concepts into current runtime animation evidence.",
      evidence: ["packages/animation/src/MotionMatchingFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream4.physics-animation.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old virtual touch joystick concepts into current runtime input evidence.",
      evidence: ["packages/input/src/VirtualTouchControls.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    },
    {
      task: "Port bounded old XR session, input, and gaze-LOD concepts into current runtime evidence.",
      evidence: ["packages/input/src/XRFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/runtime-external-parity.spec.ts", "tests/reports/external-parity-runtime.json"]
    }
  ],
  blockedTasks: [
    "The V4 game slice uses generated local glTF validation assets, not externally licensed production art.",
    "The player asset is rendered as a generated glTF model; lit skinning and animation state machine claims remain blocked here."
  ]
};

test.describe("v4 runtime systems", () => {
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

  test("game slice produces v4 runtime systems, restart, screenshot, and report evidence", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.visualAssetsLoaded === true, undefined, { timeout: 15_000 });

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

    await setTestGamepad(page, 0.9, false);
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.objectivePhase === "won", undefined, { timeout: 45_000 });
    await setTestGamepad(page, 0, false);
    await page.locator("[data-testid='restart-objective']").click();
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.objectivePhase === "playing" && Number(window.__GALILEO3D_GAME_DEMO__?.metrics.objectiveRestartCount ?? 0) >= 1, undefined, { timeout: 10_000 });
    await page.waitForFunction(() => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.scriptErrors ?? 0) >= 1, undefined, { timeout: 10_000 });

    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const state = await page.evaluate(() => window.__GALILEO3D_GAME_DEMO__);
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
    expect(state?.featureEvidence?.oldBranchAiNavigationPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchWeightedNavigationPort).toBe(true);
    expect(state?.featureEvidence?.aiNavigationPathfinding).toBe(true);
    expect(state?.featureEvidence?.aiNavigationAgent).toBe(true);
    expect(state?.featureEvidence?.oldBranchSteeringPort).toBe(true);
    expect(state?.featureEvidence?.aiSteeringArrive).toBe(true);
    expect(state?.featureEvidence?.oldBranchAdvancedSteeringPort).toBe(true);
    expect(state?.featureEvidence?.aiSteeringFleeForce).toBe(true);
    expect(state?.featureEvidence?.aiSteeringPursuitPrediction).toBe(true);
    expect(state?.featureEvidence?.aiSteeringEvadePrediction).toBe(true);
    expect(state?.featureEvidence?.aiSteeringWanderTarget).toBe(true);
    expect(state?.featureEvidence?.oldBranchFlockAvoidancePipelinePort).toBe(true);
    expect(Number(state?.featureEvidence?.aiFlockingNeighbors ?? 0)).toBeGreaterThan(0);
    expect(state?.featureEvidence?.aiObstacleAvoidanceDetected).toBe(true);
    expect(state?.featureEvidence?.aiWallAvoidanceDetected).toBe(true);
    expect(String(state?.featureEvidence?.aiSteeringPipelineSelected ?? "")).toMatch(/wall-avoidance|obstacle-avoidance|flocking|wander/);
    expect(state?.featureEvidence?.oldBranchCrowdFormationPort).toBe(true);
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
    expect(state?.featureEvidence?.oldBranchPlatformerControllerPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchPlatformerCameraPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchPlatformerLevelPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchClothSimulationPort).toBe(true);
    expect(state?.featureEvidence?.clothPinnedPbdGrid).toBe(true);
    expect(state?.featureEvidence?.clothWindResponse).toBe(true);
    expect(state?.featureEvidence?.clothCollisionResponse).toBe(true);
    expect(state?.featureEvidence?.clothTearingBoundary).toBe(true);
    expect(state?.featureEvidence?.clothFabricMaterialEvidence).toBe(true);
    expect(state?.featureEvidence?.oldBranchSoftBodyPort).toBe(true);
    expect(state?.featureEvidence?.softBodyTetMesh).toBe(true);
    expect(state?.featureEvidence?.softBodyVolumeShapeTelemetry).toBe(true);
    expect(state?.featureEvidence?.softBodyGroundCollision).toBe(true);
    expect(state?.featureEvidence?.softBodyRigidAttachments).toBe(true);
    expect(state?.featureEvidence?.oldBranchFracturePort).toBe(true);
    expect(state?.featureEvidence?.fractureVoronoiSites).toBe(true);
    expect(state?.featureEvidence?.fractureFragmentMassVelocity).toBe(true);
    expect(state?.featureEvidence?.fractureHierarchyDamage).toBe(true);
    expect(state?.featureEvidence?.fractureGeometryClippingBoundary).toBe(true);
    expect(state?.featureEvidence?.oldBranchFluidPort).toBe(true);
    expect(state?.featureEvidence?.fluidSphDensityPressure).toBe(true);
    expect(state?.featureEvidence?.fluidNeighborSearch).toBe(true);
    expect(state?.featureEvidence?.fluidMpmParticleGridTransfers).toBe(true);
    expect(state?.featureEvidence?.fluidScreenSpaceBoundary).toBe(true);
    expect(state?.featureEvidence?.oldBranchFireSmokePort).toBe(true);
    expect(state?.featureEvidence?.fireCombustionTelemetry).toBe(true);
    expect(state?.featureEvidence?.fireParticleEmission).toBe(true);
    expect(state?.featureEvidence?.smokeProjectionTelemetry).toBe(true);
    expect(state?.featureEvidence?.smokeRayMarchBoundary).toBe(true);
    expect(state?.featureEvidence?.oldBranchSpaceEnvironmentPort).toBe(true);
    expect(state?.featureEvidence?.layeredSpaceBackground).toBe(true);
    expect(state?.featureEvidence?.spaceNebulaDustTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchSpaceWavePowerUpPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchPowerUpEffectPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchAdaptiveMusicPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchAdaptiveDifficultyPort).toBe(true);
    expect(state?.featureEvidence?.adaptiveDifficultyMetrics).toBe(true);
    expect(state?.featureEvidence?.adaptiveDifficultyRules).toBe(true);
    expect(state?.featureEvidence?.adaptiveDifficultyAdjustments).toBe(true);
    expect(state?.featureEvidence?.oldBranchNetworkReplicationPort).toBe(true);
    expect(state?.featureEvidence?.networkPredictionReconciliation).toBe(true);
    expect(state?.featureEvidence?.networkDeltaCompression).toBe(true);
    expect(state?.featureEvidence?.networkInterestManagement).toBe(true);
    expect(state?.featureEvidence?.networkSnapshotInterpolation).toBe(true);
    expect(state?.featureEvidence?.oldBranchCulturalBehaviorPort).toBe(true);
    expect(state?.featureEvidence?.culturalProxemicsTelemetry).toBe(true);
    expect(state?.featureEvidence?.culturalCommunicationTelemetry).toBe(true);
    expect(state?.featureEvidence?.culturalSocialNormTelemetry).toBe(true);
    expect(state?.featureEvidence?.culturalDecisionTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchLearningAgentPort).toBe(true);
    expect(state?.featureEvidence?.learningAgentFeatureExtraction).toBe(true);
    expect(state?.featureEvidence?.learningAgentBehaviorCloning).toBe(true);
    expect(state?.featureEvidence?.learningAgentPpoStats).toBe(true);
    expect(state?.featureEvidence?.learningAgentRewardBreakdown).toBe(true);
    expect(state?.featureEvidence?.oldBranchPlayerBehaviorTelemetryPort).toBe(true);
    expect(state?.featureEvidence?.playerProfileTelemetry).toBe(true);
    expect(state?.featureEvidence?.playerEventTrackingTelemetry).toBe(true);
    expect(state?.featureEvidence?.playerBehaviorPatternTelemetry).toBe(true);
    expect(state?.featureEvidence?.playerAdaptiveInputTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchContentGeneratorPort).toBe(true);
    expect(state?.featureEvidence?.proceduralContentPlanTelemetry).toBe(true);
    expect(state?.featureEvidence?.proceduralContentSeededGeneration).toBe(true);
    expect(state?.featureEvidence?.proceduralContentPlaystyleCustomization).toBe(true);
    expect(state?.featureEvidence?.oldBranchAdaptiveAiPort).toBe(true);
    expect(state?.featureEvidence?.adaptiveAiParameterTelemetry).toBe(true);
    expect(state?.featureEvidence?.adaptiveAiPlayerProfileInput).toBe(true);
    expect(state?.featureEvidence?.oldBranchCloudServicesPort).toBe(true);
    expect(state?.featureEvidence?.cloudSaveOfflineQueueTelemetry).toBe(true);
    expect(state?.featureEvidence?.cloudAchievementsTelemetry).toBe(true);
    expect(state?.featureEvidence?.cloudLeaderboardTelemetry).toBe(true);
    expect(state?.featureEvidence?.cloudRemoteConfigTelemetry).toBe(true);
    expect(state?.featureEvidence?.cloudMatchmakingTelemetry).toBe(true);
    expect(state?.featureEvidence?.cloudContentDeliveryTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchAnalyticsPrivacyPort).toBe(true);
    expect(state?.featureEvidence?.analyticsConsentTelemetry).toBe(true);
    expect(state?.featureEvidence?.analyticsAnonymizationTelemetry).toBe(true);
    expect(state?.featureEvidence?.analyticsBatchingTelemetry).toBe(true);
    expect(state?.featureEvidence?.analyticsMetricsTelemetry).toBe(true);
    expect(state?.featureEvidence?.analyticsProviderBoundaryTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchAudioEnvironmentPort).toBe(true);
    expect(state?.featureEvidence?.oldBranchAudioEffectsAnalysisPort).toBe(true);
    expect(state?.featureEvidence?.audioCompressorTelemetry).toBe(true);
    expect(state?.featureEvidence?.audioEqTelemetry).toBe(true);
    expect(state?.featureEvidence?.audioDelayTelemetry).toBe(true);
    expect(state?.featureEvidence?.audioChorusTelemetry).toBe(true);
    expect(state?.featureEvidence?.audioDistortionTelemetry).toBe(true);
    expect(state?.featureEvidence?.audioFilterTelemetry).toBe(true);
    expect(state?.featureEvidence?.audioSpectrumTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchInputReplayPort).toBe(true);
    expect(state?.featureEvidence?.inputReplayRecording).toBe(true);
    expect(state?.featureEvidence?.inputReplayPlayback).toBe(true);
    expect(state?.featureEvidence?.inputReplaySeekLoop).toBe(true);
    expect(state?.featureEvidence?.oldBranchInputActionBindingPort).toBe(true);
    expect(state?.featureEvidence?.inputActionProcessors).toBe(true);
    expect(state?.featureEvidence?.inputActionHoldTapDoubleTap).toBe(true);
    expect(state?.featureEvidence?.inputActionCompositeAxis).toBe(true);
    expect(state?.featureEvidence?.inputActionModifierChord).toBe(true);
    expect(state?.featureEvidence?.oldBranchGestureHapticsPort).toBe(true);
    expect(state?.featureEvidence?.inputSwipeRotateTelemetry).toBe(true);
    expect(state?.featureEvidence?.inputHapticPatternTelemetry).toBe(true);
    expect(state?.featureEvidence?.inputHapticClaimBoundary).toBe(true);
    expect(state?.featureEvidence?.oldBranchVirtualTouchJoystickPort).toBe(true);
    expect(state?.featureEvidence?.virtualTouchJoystickDeadZone).toBe(true);
    expect(state?.featureEvidence?.virtualTouchJoystickClamped).toBe(true);
    expect(state?.featureEvidence?.virtualTouchJoystickRecentered).toBe(true);
    expect(state?.featureEvidence?.oldBranchXrRuntimePort).toBe(true);
    expect(state?.featureEvidence?.xrSessionCapabilityNegotiation).toBe(true);
    expect(state?.featureEvidence?.xrInlineFallback).toBe(true);
    expect(state?.featureEvidence?.xrControllerInputTelemetry).toBe(true);
    expect(state?.featureEvidence?.xrHandGestureTelemetry).toBe(true);
    expect(state?.featureEvidence?.xrGazeLodTelemetry).toBe(true);
    expect(state?.featureEvidence?.oldBranchMotionMatchingPort).toBe(true);
    expect(state?.featureEvidence?.motionMatchingTrajectoryPrediction).toBe(true);
    expect(state?.featureEvidence?.motionMatchingPoseSelection).toBe(true);
    expect(state?.featureEvidence?.oldBranchFootIkSpringBonePort).toBe(true);
    expect(state?.featureEvidence?.footIkPlacementTelemetry).toBe(true);
    expect(state?.featureEvidence?.footIkHipAdjustmentTelemetry).toBe(true);
    expect(state?.featureEvidence?.springBoneTelemetry).toBe(true);
    expect(state?.featureEvidence?.springBoneCollisionTelemetry).toBe(true);
    expect(state?.metrics.oldBranchAiNavigationPort).toBe(true);
    expect(state?.metrics.oldBranchTwoBoneIkPort).toBe(true);
    expect(state?.metrics.twoBoneIkReached).toBe(true);
    expect(Number(state?.metrics.twoBoneIkEndDistance ?? 1)).toBeLessThan(0.01);
    expect(Number(state?.metrics.twoBoneIkUpperLength ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.twoBoneIkLowerLength ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.twoBoneIkPoleInfluence ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchMotionMatchingPort).toBe(true);
    expect(state?.metrics.motionMatchingSource).toBe("origin-master-motion-matching-system-adapted");
    expect(Number(state?.metrics.motionMatchingDatabasePoses ?? 0)).toBeGreaterThanOrEqual(18);
    expect(String(state?.metrics.motionMatchingSelectedPose ?? "")).toMatch(/^(idle|walk|run|strafe|turn|jump)-[0-9]+$/);
    expect(String(state?.metrics.motionMatchingSelectedClip ?? "")).toMatch(/idle|walk|run|strafe|turn|jump/);
    expect(String(state?.metrics.motionMatchingSelectedTags ?? "")).not.toBe("");
    expect(Number(state?.metrics.motionMatchingTransitionDuration ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.motionMatchingBlendWeight ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.motionMatchingBlendWeight ?? 2)).toBeLessThanOrEqual(1);
    expect(Number(state?.metrics.motionMatchingTrajectorySamples ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.motionMatchingQuerySpeed ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.motionMatchingFacingAlignment ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.motionMatchingBestCost ?? 999)).toBeLessThanOrEqual(Number(state?.metrics.motionMatchingSecondBestCost ?? 999));
    expect(Number(state?.metrics.motionMatchingCostMargin ?? -1)).toBeGreaterThanOrEqual(0);
    expect(String(state?.metrics.motionMatchingHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchFootIkSpringBonePort).toBe(true);
    expect(state?.metrics.secondaryAnimationSource).toBe("origin-master-foot-ik-spring-bone-adapted");
    expect(Number(state?.metrics.footIkGroundedFeet ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics.footIkHipOffset ?? 0)).toBeLessThan(0);
    expect(Number(state?.metrics.footIkAverageTargetError ?? 1)).toBeLessThanOrEqual(0.015);
    expect(Number(state?.metrics.footIkTerrainSlope ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.springBoneChain).toBe("ponytail");
    expect(Number(state?.metrics.springBoneCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics.springBoneMaxDisplacement ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.springBoneCollisionContacts ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.springBoneSubsteps ?? 0)).toBeGreaterThanOrEqual(1);
    expect(String(state?.metrics.secondaryAnimationHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(String(state?.metrics.secondaryAnimationBlockedClaims ?? "")).toContain("Unity Animation Rigging parity");
    expect(String(state?.metrics.secondaryAnimationBlockedClaims ?? "")).toContain("Unreal Control Rig parity");
    expect(state?.metrics.oldBranchWeightedNavigationPort).toBe(true);
    expect(state?.metrics.oldBranchSteeringPort).toBe(true);
    expect(state?.metrics.oldBranchBehaviorTreePort).toBe(true);
    expect(state?.metrics.navigationPathStatus).toBe("success");
    expect(state?.metrics.navigationPickupPathStatus).toBe("success");
    expect(state?.metrics.navigationExitPathStatus).toBe("success");
    expect(Number(state?.metrics.navigationGridCells ?? 0)).toBeGreaterThanOrEqual(40);
    expect(Number(state?.metrics.navigationBlockedCells ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.navigationWeightedCells ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.navigationDiagonalMovement).toBe(true);
    expect(Number(state?.metrics.navigationPathCells ?? 0)).toBeGreaterThan(3);
    expect(Number(state?.metrics.navigationPathWaypoints ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.navigationPathLength ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.navigationPathCost ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.navigationPickupPathCost ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.navigationExitPathCost ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.navigationVisitedCells ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.navigationAgentState ?? "")).toMatch(/moving|arrived/);
    expect(Number(state?.metrics.navigationAgentDistanceTraveled ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiSteeringDistanceTraveled ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiSteeringSpeed ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiSteeringDistanceToTarget ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchAdvancedSteeringPort).toBe(true);
    expect(Number(state?.metrics.aiFleeDistance ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiFleeForce ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiPursuitPredictionTime ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiEvadePredictionTime ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiWanderSeed ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(Number(state?.metrics.aiWanderTargetX ?? 0)) + Math.abs(Number(state?.metrics.aiWanderTargetY ?? 0))).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiWanderForce ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchFlockAvoidancePipelinePort).toBe(true);
    expect(Number(state?.metrics.aiFlockingNeighbors ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiFlockingForce ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.aiObstacleAvoidanceDetected).toBe(true);
    expect(Number(state?.metrics.aiObstacleAvoidanceDistance ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiObstacleAvoidanceForce ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.aiWallAvoidanceDetected).toBe(true);
    expect(Number(state?.metrics.aiWallAvoidanceDistance ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiWallAvoidanceForce ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiSteeringPipelineForce ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.aiSteeringPipelineSelected ?? "")).toMatch(/wall-avoidance|obstacle-avoidance|flocking|wander/);
    expect(state?.metrics.oldBranchCrowdFormationPort).toBe(true);
    expect(Number(state?.metrics.aiCrowdAgents ?? 0)).toBeGreaterThanOrEqual(4);
    expect(String(state?.metrics.aiCrowdFormation ?? "")).toMatch(/wedge|column/);
    expect(Number(state?.metrics.aiCrowdNeighborPairs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiCrowdAverageNeighbors ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.aiCrowdAverageSpeed ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.aiCrowdSlots ?? "")).toContain("support-alpha");
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
    expect(state?.metrics.oldBranchPlatformerControllerPort).toBe(true);
    expect(state?.metrics.platformerFixtureSource).toBe("origin-master-platformer-controller-adapted");
    expect(String(state?.metrics.platformerFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.platformerWalkSpeed ?? 0)).toBe(5);
    expect(Number(state?.metrics.platformerRunSpeed ?? 0)).toBe(8);
    expect(Number(state?.metrics.platformerJumpForce ?? 0)).toBe(12);
    expect(Number(state?.metrics.platformerDoubleJumpForce ?? 0)).toBe(10);
    expect(Number(state?.metrics.platformerWallJumpForce ?? 0)).toBe(14);
    expect(Number(state?.metrics.platformerCoyoteTimeSeconds ?? 0)).toBe(0.15);
    expect(Number(state?.metrics.platformerJumpBufferSeconds ?? 0)).toBe(0.1);
    expect(state?.metrics.platformerCoyoteJumpAccepted).toBe(true);
    expect(state?.metrics.platformerBufferedJumpAccepted).toBe(true);
    expect(state?.metrics.platformerDoubleJumpAccepted).toBe(true);
    expect(state?.metrics.platformerWallJumpAccepted).toBe(true);
    expect(String(state?.metrics.platformerStateSequence ?? "")).toContain("doubleJump");
    expect(String(state?.metrics.platformerStateSequence ?? "")).toContain("wallSlide");
    expect(state?.metrics.platformerFinalState).toBe("land");
    expect(state?.metrics.oldBranchPlatformerCameraPort).toBe(true);
    expect(Number(state?.metrics.platformerCameraCollisionAdjustedDistance ?? 0)).toBeLessThan(Number(state?.metrics.platformerCameraDistance ?? 0));
    expect(state?.metrics.platformerCameraLockOnSupported).toBe(true);
    expect(state?.metrics.oldBranchPlatformerLevelPort).toBe(true);
    expect(Number(state?.metrics.platformerTotalPlatforms ?? 0)).toBeGreaterThanOrEqual(14);
    expect(Number(state?.metrics.platformerTotalCollectibles ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics.platformerTotalScoreValue ?? 0)).toBeGreaterThanOrEqual(2500);
    expect(Number(state?.metrics.platformerCheckpointCount ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics.platformerHazardCount ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.platformerGoalDistance ?? 0)).toBeGreaterThan(56);
    expect(state?.metrics.oldBranchClothSimulationPort).toBe(true);
    expect(state?.metrics.clothFixtureSource).toBe("origin-master-cloth-pbd-material-adapted");
    expect(String(state?.metrics.clothFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.clothParticleCount ?? 0)).toBe(117);
    expect(Number(state?.metrics.clothTriangleCount ?? 0)).toBe(192);
    expect(Number(state?.metrics.clothIndexCount ?? 0)).toBe(576);
    expect(Number(state?.metrics.clothPinnedCount ?? 0)).toBe(13);
    expect(state?.metrics.clothPinnedPattern).toBe("top-edge");
    expect(Number(state?.metrics.clothStructuralConstraints ?? 0)).toBe(212);
    expect(Number(state?.metrics.clothShearConstraints ?? 0)).toBe(192);
    expect(Number(state?.metrics.clothBendingConstraints ?? 0)).toBe(190);
    expect(Number(state?.metrics.clothTotalConstraints ?? 0)).toBe(594);
    expect(Number(state?.metrics.clothMaxStrain ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.clothTearThreshold ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.clothTearCandidates ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothCutPlaneConstraintCandidates ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothWindMaxOffset ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothWindAffectedParticles ?? 0)).toBeGreaterThan(Number(state?.metrics.clothPinnedCount ?? 0));
    expect(state?.metrics.clothCollisionShape).toBe("sphere");
    expect(Number(state?.metrics.clothCollisionPenetrations ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothCollisionResolved ?? 0)).toBe(Number(state?.metrics.clothCollisionPenetrations ?? -1));
    expect(Number(state?.metrics.clothCollisionMaxPenetration ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.clothMaterialPreset).toBe("coarse-wool-flag");
    expect(Number(state?.metrics.clothMaterialSheenIntensity ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothMaterialSubsurfaceIntensity ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothMaterialAnisotropyStrength ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.clothMaterialFuzzIntensity ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.clothBlockedClaims ?? "")).toContain("Unity Cloth parity");
    expect(String(state?.metrics.clothBlockedClaims ?? "")).toContain("Unreal Chaos Cloth parity");
    expect(state?.metrics.oldBranchSoftBodyPort).toBe(true);
    expect(state?.metrics.softBodyFixtureSource).toBe("origin-master-softbody-tet-pbd-adapted");
    expect(String(state?.metrics.softBodyFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.softBodyMethod).toBe("bounded-pbd-telemetry");
    expect(state?.metrics.softBodyMaterialModel).toBe("bounded-corotated-reference");
    expect(Number(state?.metrics.softBodyVertexCount ?? 0)).toBe(27);
    expect(Number(state?.metrics.softBodyTetrahedronCount ?? 0)).toBe(40);
    expect(Number(state?.metrics.softBodySurfaceTriangleEstimate ?? 0)).toBe(48);
    expect(Number(state?.metrics.softBodyDistanceConstraints ?? 0)).toBeGreaterThan(40);
    expect(Number(state?.metrics.softBodyAttachmentCount ?? 0)).toBe(4);
    expect(Number(state?.metrics.softBodyMaxDisplacement ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyAverageDisplacement ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyVolumeRatio ?? 0)).toBeGreaterThan(0.65);
    expect(Number(state?.metrics.softBodyVolumeRatio ?? 0)).toBeLessThan(1.15);
    expect(Number(state?.metrics.softBodyRestVolume ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyCurrentVolume ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyShapeMatchingError ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyContactVertices ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyResolvedVertices ?? 0)).toBe(Number(state?.metrics.softBodyContactVertices ?? -1));
    expect(Number(state?.metrics.softBodyMaxPenetrationBeforeResolve ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.softBodyRigidAttachmentCount ?? 0)).toBe(4);
    expect(Number(state?.metrics.softBodyMaxAttachmentError ?? 1)).toBe(0);
    expect(String(state?.metrics.softBodyBlockedClaims ?? "")).toContain("production tetrahedral FEM solver parity");
    expect(String(state?.metrics.softBodyBlockedClaims ?? "")).toContain("Unity soft-body asset parity");
    expect(String(state?.metrics.softBodyBlockedClaims ?? "")).toContain("Unreal Chaos soft-body parity");
    expect(state?.metrics.oldBranchFracturePort).toBe(true);
    expect(state?.metrics.fractureFixtureSource).toBe("origin-master-voronoi-hierarchical-fracture-adapted");
    expect(String(state?.metrics.fractureFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.fractureRequestedFragments ?? 0)).toBe(18);
    expect(Number(state?.metrics.fractureDensity ?? 0)).toBe(2350);
    expect(Number(state?.metrics.fractureImpulseStrength ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.fractureInteriorFaces).toBe(true);
    expect(state?.metrics.fractureProgressiveDamage).toBe(true);
    expect(Number(state?.metrics.fractureSiteCount ?? 0)).toBe(18);
    expect(Number(state?.metrics.fractureAverageSiteDistance ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fractureMaxSiteDistance ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fractureAverageSiteDistance ?? 0));
    expect(Number(state?.metrics.fractureNeighborPairs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fractureCrackGraphEdges ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fractureNeighborPairs ?? 0));
    expect(Number(state?.metrics.fractureFragmentCount ?? 0)).toBe(18);
    expect(Number(state?.metrics.fractureTotalMass ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fractureMaxMass ?? 0)).toBeGreaterThan(Number(state?.metrics.fractureMinMass ?? 0));
    expect(Number(state?.metrics.fractureTotalVolume ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fractureInteriorFaceEstimate ?? 0)).toBeGreaterThan(Number(state?.metrics.fractureFragmentCount ?? 0));
    expect(Number(state?.metrics.fractureActiveAfterImpact ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fractureHierarchyDepth ?? 0)).toBe(3);
    expect(Number(state?.metrics.fractureHierarchyNodeCount ?? 0)).toBeGreaterThan(Number(state?.metrics.fractureFragmentCount ?? 0));
    expect(Number(state?.metrics.fractureRootDamage ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fractureActivatedChildren ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.fractureBlockedClaims ?? "")).toContain("runtime convex mesh clipping");
    expect(String(state?.metrics.fractureBlockedClaims ?? "")).toContain("Unity destruction workflow parity");
    expect(String(state?.metrics.fractureBlockedClaims ?? "")).toContain("Unreal Chaos destruction parity");
    expect(state?.metrics.oldBranchFluidPort).toBe(true);
    expect(state?.metrics.fluidFixtureSource).toBe("origin-master-sph-mpm-fluid-adapted");
    expect(String(state?.metrics.fluidFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.fluidSolver).toBe("bounded-sph-pcisph-dfsph-telemetry");
    expect(Number(state?.metrics.fluidRestDensity ?? 0)).toBe(1000);
    expect(Number(state?.metrics.fluidParticleMass ?? 0)).toBeCloseTo(0.02);
    expect(Number(state?.metrics.fluidSmoothingRadius ?? 0)).toBeCloseTo(0.24);
    expect(Number(state?.metrics.fluidPcisphIterations ?? 0)).toBe(3);
    expect(Number(state?.metrics.fluidDfsphIterations ?? 0)).toBe(5);
    expect(Number(state?.metrics.fluidParticleCount ?? 0)).toBe(36);
    expect(Number(state?.metrics.fluidCapacity ?? 0)).toBe(128);
    expect(Number(state?.metrics.fluidAverageDensity ?? 0)).toBeGreaterThanOrEqual(1000);
    expect(Number(state?.metrics.fluidMaxDensity ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fluidAverageDensity ?? 0));
    expect(Number(state?.metrics.fluidMaxPressure ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fluidAveragePressure ?? 0));
    expect(Number(state?.metrics.fluidNeighborPairs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fluidMaxNeighborCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fluidViscosityForceEstimate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fluidMpmActiveCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fluidParticleToGridTransfers ?? 0)).toBe(Number(state?.metrics.fluidParticleCount ?? 0) * 8);
    expect(Number(state?.metrics.fluidGridToParticleTransfers ?? 0)).toBe(Number(state?.metrics.fluidParticleCount ?? 0) * 8);
    expect(Number(state?.metrics.fluidFlipRatio ?? 0)).toBeCloseTo(0.96);
    expect(Number(state?.metrics.fluidDeformationGradientSamples ?? 0)).toBe(Number(state?.metrics.fluidParticleCount ?? 0));
    expect(Number(state?.metrics.fluidPlasticityEvents ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fluidDepthPixels ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fluidThicknessPixels ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fluidDepthPixels ?? 0));
    expect(Number(state?.metrics.fluidMaxThickness ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.fluidRenderingRefractionClaimed).toBe(false);
    expect(state?.metrics.fluidRenderingSubsurfaceClaimed).toBe(false);
    expect(String(state?.metrics.fluidBlockedClaims ?? "")).toContain("production SPH pressure solve parity");
    expect(String(state?.metrics.fluidBlockedClaims ?? "")).toContain("Unity fluid tooling parity");
    expect(String(state?.metrics.fluidBlockedClaims ?? "")).toContain("Unreal Niagara/fluid parity");
    expect(state?.metrics.oldBranchFireSmokePort).toBe(true);
    expect(state?.metrics.fireSmokeFixtureSource).toBe("origin-master-fire-smoke-volume-adapted");
    expect(String(state?.metrics.fireSmokeFixtureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.fireSmokeSolver).toBe("bounded-fire-smoke-telemetry");
    expect(Number(state?.metrics.fireSmokeGridCells ?? 0)).toBe(384);
    expect(Number(state?.metrics.fireSmokeSourceCount ?? 0)).toBe(3);
    expect(Number(state?.metrics.fireSmokeActiveFuelCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeBurningCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeAverageTemperature ?? 0)).toBeGreaterThan(293);
    expect(Number(state?.metrics.fireSmokeMaxTemperature ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fireSmokeAverageTemperature ?? 0));
    expect(Number(state?.metrics.fireSmokeFuelConsumed ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeGenerated ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeBuoyancyImpulse ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeTurbulenceEnergy ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeCoolingLoss ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeDiffusionEstimate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeParticleEmitted ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeParticleActive ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.fireSmokeParticleEmitted ?? 0));
    expect(Number(state?.metrics.fireSmokeParticleEmbers ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeParticleUploadBytes ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeDensityCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeTotalDensity ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeMaxDensity ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeAverageVelocityMagnitude ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeDivergenceAfterProjection ?? 999)).toBeLessThan(Number(state?.metrics.fireSmokeDivergenceBeforeProjection ?? 0));
    expect(Number(state?.metrics.fireSmokePressureIterations ?? 0)).toBe(40);
    expect(Number(state?.metrics.fireSmokeVorticityCells ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.fireSmokeRayMarchSteps ?? 0)).toBe(128);
    expect(Number(state?.metrics.fireSmokeTransmittance ?? 1)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.fireSmokeTransmittance ?? 0)).toBeLessThan(1);
    expect(Number(state?.metrics.fireSmokeAlpha ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.fireSmokeVolumetricRendererClaimed).toBe(false);
    expect(state?.metrics.fireSmokeProductionLightingClaimed).toBe(false);
    expect(String(state?.metrics.fireSmokeBlockedClaims ?? "")).toContain("production combustion solver parity");
    expect(String(state?.metrics.fireSmokeBlockedClaims ?? "")).toContain("Unity VFX Graph fire/smoke parity");
    expect(String(state?.metrics.fireSmokeBlockedClaims ?? "")).toContain("Unreal Niagara fire/smoke parity");
    expect(state?.metrics.oldBranchSpaceEnvironmentPort).toBe(true);
    expect(state?.metrics.spaceEnvironmentSource).toBe("origin-master-space-environment-adapted");
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
    expect(String(state?.metrics.spaceEnvironmentBlockedClaims ?? "")).toContain("3D volumetric nebula rendering");
    expect(String(state?.metrics.spaceEnvironmentBlockedClaims ?? "")).toContain("Unity VFX Graph background parity");
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
    expect(state?.metrics.oldBranchAdaptiveMusicPort).toBe(true);
    expect(state?.metrics.adaptiveMusicSource).toBe("origin-master-adaptive-music-adapted");
    expect(String(state?.metrics.adaptiveMusicState ?? "")).toMatch(/tension|action|victory|defeat/);
    expect(Number(state?.metrics.adaptiveMusicIntensity ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.adaptiveMusicCurve).toBe("equal-power");
    expect(Number(state?.metrics.adaptiveMusicActiveLayers ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics.adaptiveMusicPeakLayerVolume ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.adaptiveMusicLayerMix ?? "")).toContain("ambient-bed");
    expect(state?.metrics.adaptiveMusicEqualPowerCrossfade).toBe(true);
    expect(String(state?.metrics.adaptiveMusicHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchAdaptiveDifficultyPort).toBe(true);
    expect(state?.metrics.adaptiveDifficultySource).toBe("origin-master-ai-balancing-smart-difficulty-adapted");
    expect(String(state?.metrics.adaptiveDifficultyStrategy ?? "")).toMatch(/gradual|predictive/);
    expect(Number(state?.metrics.adaptiveDifficultyMetricCount ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics.adaptiveDifficultyTriggeredRules ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.adaptiveDifficultyAppliedChanges ?? 0)).toBe(Number(state?.metrics.adaptiveDifficultyTriggeredRules ?? -1));
    expect(String(state?.metrics.adaptiveDifficultyRuleIds ?? "")).toContain("death-rate-relief");
    expect(String(state?.metrics.adaptiveDifficultyRuleIds ?? "")).toContain("low-accuracy-resource-support");
    expect(Number(state?.metrics.adaptiveDifficultyEnemyDamage ?? 1)).toBeLessThan(1);
    expect(Number(state?.metrics.adaptiveDifficultyResourceDropRate ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.adaptiveDifficultyTimerMultiplier ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.adaptiveDifficultyCheckpointMultiplier ?? 0)).toBeGreaterThanOrEqual(1);
    expect(String(state?.metrics.adaptiveDifficultyBlockedClaims ?? "")).toContain("Unity/Unreal AI middleware parity");
    expect(String(state?.metrics.adaptiveDifficultyHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchNetworkReplicationPort).toBe(true);
    expect(state?.metrics.networkReplicationSource).toBe("origin-master-net-prediction-replication-adapted");
    expect(Number(state?.metrics.networkReplicationTickRate ?? 0)).toBeGreaterThanOrEqual(30);
    expect(Number(state?.metrics.networkReplicationLatencyMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.networkReplicationJitterMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.networkPredictionInputCount ?? 0)).toBeGreaterThanOrEqual(6);
    expect(Number(state?.metrics.networkPredictionPendingInputs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.networkPredictionError ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.networkPredictionCorrection ?? "")).toContain(",");
    expect(String(state?.metrics.networkPredictionReplayedPosition ?? "")).toContain(",");
    expect(String(state?.metrics.networkDeltaChangedFields ?? "")).toContain("health");
    expect(Number(state?.metrics.networkDeltaFullSnapshotBytes ?? 0)).toBeGreaterThan(Number(state?.metrics.networkDeltaBytes ?? 0));
    expect(Number(state?.metrics.networkDeltaCompressionRatio ?? 1)).toBeLessThan(1);
    expect(Number(state?.metrics.networkDeltaBytesSaved ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.networkInterestRelevant ?? "")).toContain("net-enemy-alpha");
    expect(String(state?.metrics.networkInterestCulled ?? "")).toContain("net-distant-prop");
    expect(String(state?.metrics.networkInterestAdded ?? "")).toContain("net-enemy-alpha");
    expect(String(state?.metrics.networkInterestRemoved ?? "")).toContain("net-distant-prop");
    expect(Number(state?.metrics.networkInterestGridCellCount ?? 0)).toBeGreaterThan(1);
    expect(Number(state?.metrics.networkInterpolationSampleMs ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.networkInterpolationPosition ?? "")).toContain(",");
    expect(String(state?.metrics.networkExtrapolationPosition ?? "")).toContain(",");
    expect(String(state?.metrics.networkReplicationBlockedClaims ?? "")).toContain("Unity Netcode parity");
    expect(String(state?.metrics.networkReplicationBlockedClaims ?? "")).toContain("Unreal replication parity");
    expect(String(state?.metrics.networkReplicationHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchCulturalBehaviorPort).toBe(true);
    expect(state?.metrics.culturalBehaviorSource).toBe("origin-master-cultural-ai-adapted");
    expect(String(state?.metrics.culturalRelationship ?? "")).toMatch(/friend|superior/);
    expect(Number(state?.metrics.culturalDistanceMeters ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.culturalAcceptableDistanceMeters ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.culturalProxemicZone ?? "")).toMatch(/intimate|personal|social|public/);
    expect(Number(state?.metrics.culturalComfort ?? -1)).toBeGreaterThanOrEqual(0);
    expect(String(state?.metrics.culturalCommunicationStyle ?? "")).toMatch(/direct|balanced|indirect/);
    expect(String(state?.metrics.culturalCommunicationFormality ?? "")).toMatch(/formal|neutral|informal/);
    expect(state?.metrics.culturalCommunicationAudienceAdapted).toBe(true);
    expect(String(state?.metrics.culturalGesture ?? "")).toMatch(/handshake|bow/);
    expect(String(state?.metrics.culturalDecisionAction ?? "")).toMatch(/approach|wait|request-distance|formal-greeting/);
    expect(Number(state?.metrics.culturalDecisionScore ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.culturalBlockedClaims ?? "")).toContain("Unity Behavior Designer");
    expect(String(state?.metrics.culturalBehaviorHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchLearningAgentPort).toBe(true);
    expect(state?.metrics.learningAgentSource).toBe("origin-master-ml-agent-adapted");
    expect(Number(state?.metrics.learningAgentFeatureSize ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.learningAgentTargetDistance ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.learningAgentHealth ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.learningAgentEnergy ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.learningAgentFeatureHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.learningBehaviorCloningDemos ?? 0)).toBeGreaterThan(20);
    expect(Number(state?.metrics.learningBehaviorCloningTrainLoss ?? 1)).toBeLessThan(1);
    expect(Number(state?.metrics.learningBehaviorCloningValidationAccuracy ?? 0)).toBeGreaterThanOrEqual(0.7);
    expect(String(state?.metrics.learningBehaviorCloningAction ?? "")).toMatch(/move-to-target|hold-position|recover/);
    expect(Number(state?.metrics.learningRlExplainedVariance ?? 0)).toBeGreaterThan(0.6);
    expect(Number(state?.metrics.learningRlAvgReturn ?? 0)).toBe(Number(state?.metrics.learningRewardTotal ?? Number.NaN));
    expect(String(state?.metrics.learningAgentBlockedClaims ?? "")).toContain("Unity ML-Agents parity");
    expect(String(state?.metrics.learningAgentHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchPlayerBehaviorTelemetryPort).toBe(true);
    expect(state?.metrics.playerBehaviorTelemetrySource).toBe("origin-master-player-profile-event-analysis-adapted");
    expect(String(state?.metrics.playerProfileSkillLevel ?? "")).toMatch(/beginner|novice|intermediate|advanced|expert/);
    expect(String(state?.metrics.playerProfilePlaystyle ?? "")).toMatch(/aggressive|defensive|balanced|stealth|exploration|speedrun|completionist/);
    expect(String(state?.metrics.playerProfileEngagement ?? "")).toMatch(/casual|regular|dedicated|hardcore/);
    expect(Number(state?.metrics.playerProfileSkillCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics.playerProfilePatternCount ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics.playerEventTotal ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.playerEventCombat ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.playerEventMovement ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.playerEventSuccessRate ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.playerEventsPerMinute ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.playerSessionInsightCount ?? 0)).toBeGreaterThanOrEqual(2);
    expect(String(state?.metrics.playerBehaviorBlockedClaims ?? "")).toContain("Unity Analytics");
    expect(String(state?.metrics.playerBehaviorTelemetryHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchContentGeneratorPort).toBe(true);
    expect(state?.metrics.proceduralContentSource).toBe("origin-master-content-generator-adaptive-ai-adapted");
    expect(Number(state?.metrics.proceduralContentCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(String(state?.metrics.proceduralContentTypes ?? "")).toContain("level");
    expect(String(state?.metrics.proceduralContentTypes ?? "")).toContain("enemy_encounter");
    expect(String(state?.metrics.proceduralContentTypes ?? "")).toContain("quest");
    expect(String(state?.metrics.proceduralContentDifficulty ?? "")).toMatch(/easy|moderate|challenging|extreme/);
    expect(Number(state?.metrics.proceduralContentEstimatedMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.proceduralContentLevelEnemyCount ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.proceduralContentRewardTier ?? "")).toMatch(/standard|uncommon|rare/);
    expect(String(state?.metrics.proceduralContentBlockedClaims ?? "")).toContain("production procedural content generation parity");
    expect(String(state?.metrics.proceduralContentBlockedClaims ?? "")).toContain("Unreal PCG Framework");
    expect(state?.metrics.oldBranchAdaptiveAiPort).toBe(true);
    expect(String(state?.metrics.adaptiveAiStrategy ?? "")).toMatch(/counter|challenge/);
    expect(state?.metrics.adaptiveAiBehaviorMode).toBe("adaptive");
    expect(Number(state?.metrics.adaptiveAiAggression ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.adaptiveAiDefensiveness ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.adaptiveAiTacticalAwareness ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.adaptiveAiReactionSpeed ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.adaptiveAiAccuracy ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.adaptiveAiAbilityUsage ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.adaptiveAiCoordination ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.proceduralContentAdaptationHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchCloudServicesPort).toBe(true);
    expect(state?.metrics.cloudServicesSource).toBe("origin-master-cloud-services-adapted");
    expect(state?.metrics.cloudAuthProvider).toBe("guest");
    expect(state?.metrics.cloudAuthTokenIssued).toBe(false);
    expect(String(state?.metrics.cloudOfflineUserId ?? "")).toMatch(/^guest-/);
    expect(state?.metrics.cloudSaveStatus).toBe("queued");
    expect(Number(state?.metrics.cloudSaveVersion ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.cloudSaveChecksum ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.cloudSaveQueuedUploads ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.cloudAchievementUnlockedCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudAchievementTotalPoints ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudLeaderboardScore ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudLeaderboardRank ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudLeaderboardCachedEntries ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.cloudRemoteConfigGroup ?? "")).toMatch(/control|variant-a|variant-b/);
    expect(Number(state?.metrics.cloudRemoteConfigDifficultyScale ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudRemoteConfigEventMultiplier ?? 0)).toBeGreaterThanOrEqual(1);
    expect(String(state?.metrics.cloudMatchmakingTicket ?? "")).toMatch(/^ticket-/);
    expect(Number(state?.metrics.cloudMatchmakingEstimatedWaitMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudMatchmakingMatchedPlayers ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics.cloudContentAssetCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.cloudContentCacheHits ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.cloudContentIntegrityHashes ?? "")).toMatch(/[0-9a-f]{8}/);
    expect(String(state?.metrics.cloudServicesBlockedClaims ?? "")).toContain("Unity Gaming Services parity");
    expect(String(state?.metrics.cloudServicesBlockedClaims ?? "")).toContain("Unreal Online Services parity");
    expect(String(state?.metrics.cloudServicesHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchAnalyticsPrivacyPort).toBe(true);
    expect(state?.metrics.analyticsPrivacySource).toBe("origin-master-analytics-privacy-adapted");
    expect(Number(state?.metrics.analyticsConsentGrantedCount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.analyticsConsentDeniedCount ?? -1)).toBeGreaterThanOrEqual(0);
    expect(state?.metrics.analyticsConsentAnalyticsGranted).toBe(true);
    expect(state?.metrics.analyticsConsentMarketingGranted).toBe(false);
    expect(String(state?.metrics.analyticsUserHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(String(state?.metrics.analyticsSessionHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(String(state?.metrics.analyticsIpAnonymized ?? "")).toMatch(/\d+\.\d+\.\d+\.0/);
    expect(Number(state?.metrics.analyticsPiiPatternHits ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.analyticsProviderMode).toBe("batched-local");
    expect(Number(state?.metrics.analyticsQueuedEvents ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.analyticsFlushedBatches ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.analyticsBlockedWithoutConsent ?? -1)).toBe(0);
    expect(Number(state?.metrics.analyticsFrameMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.analyticsFps ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.analyticsErrorCount ?? -1)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.analyticsLoadEvents ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.analyticsCustomMetricCount ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.analyticsBlockedClaims ?? "")).toContain("Unity Analytics parity");
    expect(String(state?.metrics.analyticsBlockedClaims ?? "")).toContain("Unreal Insights/Analytics parity");
    expect(String(state?.metrics.analyticsPrivacyHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchAudioEnvironmentPort).toBe(true);
    expect(state?.metrics.audioEnvironmentSource).toBe("origin-master-spatial-audio-environment-adapted");
    expect(String(state?.metrics.audioOcclusionLevel ?? "")).toMatch(/light|medium|heavy|complete/);
    expect(Number(state?.metrics.audioOcclusionObstacleCount ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.audioOcclusionLowpassHz ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioOcclusionVolume ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDopplerPitchFactor ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDopplerFrequencyShiftHz ?? 0)).not.toBeNaN();
    expect(Number(state?.metrics.audioReverbBlend ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.oldBranchInputReplayPort).toBe(true);
    expect(state?.metrics.inputReplaySource).toBe("origin-master-input-recorder-playback-adapted");
    expect(Number(state?.metrics.inputReplayEvents ?? 0)).toBeGreaterThanOrEqual(6);
    expect(Number(state?.metrics.inputReplayFrames ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.inputReplayEmittedEvents ?? 0)).toBeGreaterThanOrEqual(Number(state?.metrics.inputReplayEvents ?? 0));
    expect(Number(state?.metrics.inputReplayLoopCount ?? 0)).toBeGreaterThanOrEqual(1);
    expect(String(state?.metrics.inputReplayFirstEventTypes ?? "")).toContain("key");
    expect(state?.metrics.oldBranchInputActionBindingPort).toBe(true);
    expect(state?.metrics.inputActionBindingSource).toBe("origin-master-input-action-binding-adapted");
    expect(Number(state?.metrics.inputActionCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics.inputBindingCount ?? 0)).toBeGreaterThanOrEqual(8);
    expect(Number(state?.metrics.inputProcessorCount ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.inputProcessedAxis ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.inputDeadzoneFilteredAxis ?? -1)).toBe(0);
    expect(Number(state?.metrics.inputCompositeMagnitude ?? 0)).toBeGreaterThan(1);
    expect(state?.metrics.inputHoldTriggered).toBe(true);
    expect(state?.metrics.inputTapTriggered).toBe(true);
    expect(state?.metrics.inputDoubleTapTriggered).toBe(true);
    expect(state?.metrics.inputModifierChordPressed).toBe(true);
    expect(state?.metrics.oldBranchGestureHapticsPort).toBe(true);
    expect(state?.metrics.inputGestureHapticsSource).toBe("origin-master-input-gesture-rumble-adapted");
    expect(String(state?.metrics.inputGestureHapticsHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(state?.metrics.inputGestureCount ?? 0)).toBeGreaterThanOrEqual(5);
    expect(String(state?.metrics.inputGestureTypes ?? "")).toContain("swipe");
    expect(String(state?.metrics.inputGestureTypes ?? "")).toContain("rotate");
    expect(Number(state?.metrics.inputGesturePanDistance ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.inputGesturePinchScale ?? 0)).toBeGreaterThan(1);
    expect(String(state?.metrics.inputGestureSwipeDirection ?? "")).toMatch(/left|right|up|down/);
    expect(Number(state?.metrics.inputGestureRotateDegrees ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.inputHapticsGamepadConnected).toBe(true);
    expect(state?.metrics.inputHapticsClaimed).toBe(false);
    expect(Number(state?.metrics.inputHapticPatternCount ?? 0)).toBeGreaterThanOrEqual(5);
    expect(Number(state?.metrics.inputHapticQueuedPatterns ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.inputHapticTotalDurationMs ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.inputHapticIntensityMultiplier ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.inputGestureHapticsBlockedClaims ?? "")).toContain("Unity Input System haptics parity");
    expect(String(state?.metrics.inputGestureHapticsBlockedClaims ?? "")).toContain("Unreal Enhanced Input haptics parity");
    expect(state?.metrics.oldBranchVirtualTouchJoystickPort).toBe(true);
    expect(state?.metrics.virtualTouchJoystickSource).toBe("origin-master-touch-joystick-virtual-input-adapted");
    expect(Number(state?.metrics.virtualTouchJoystickActiveMagnitude ?? 0)).toBeGreaterThan(0.8);
    expect(Number(state?.metrics.virtualTouchJoystickReleasedMagnitude ?? -1)).toBe(0);
    expect(Number(state?.metrics.virtualTouchJoystickConsumedTouches ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.virtualTouchJoystickDeadZone ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.virtualTouchJoystickFloatingCenter).toBe(true);
    expect(state?.metrics.virtualTouchJoystickReturnToCenter).toBe(true);
    expect(state?.metrics.oldBranchXrRuntimePort).toBe(true);
    expect(state?.metrics.xrRuntimeSource).toBe("origin-master-xr-session-input-foveated-adapted");
    expect(String(state?.metrics.xrRuntimeHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.xrRequestedMode).toBe("immersive-vr");
    expect(state?.metrics.xrFallbackMode).toBe("inline");
    expect(state?.metrics.xrSessionSupported).toBe(false);
    expect(state?.metrics.xrFallbackUsed).toBe(true);
    expect(state?.metrics.xrWebXRSessionClaimed).toBe(false);
    expect(state?.metrics.xrDeviceRuntimeClaimed).toBe(false);
    expect(Number(state?.metrics.xrControllerCount ?? 0)).toBeGreaterThanOrEqual(2);
    expect(state?.metrics.xrTriggerPressed).toBe(true);
    expect(Number(state?.metrics.xrThumbstickMagnitude ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.xrPinchDetected).toBe(true);
    expect(Number(state?.metrics.xrPinchStrength ?? 0)).toBeGreaterThan(0);
    expect(state?.metrics.xrPointDetected).toBe(true);
    expect(Number(state?.metrics.xrPointConfidence ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.xrGazeLodHigh ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.xrGazeLodUpdatedObjects ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.xrGazeLodSelectedLevels ?? "")).toContain("high");
    expect(String(state?.metrics.xrBlockedClaims ?? "")).toContain("Unity XR Interaction Toolkit parity");
    expect(Number(state?.metrics.audioReverbWetLevel ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioReverbDryLevel ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.audioEnvironmentHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
    expect(state?.metrics.oldBranchAudioEffectsAnalysisPort).toBe(true);
    expect(state?.metrics.audioEffectsAnalysisSource).toBe("origin-master-audio-effects-analysis-adapted");
    expect(String(state?.metrics.audioEffectsChain ?? "")).toBe("parametric-eq>dynamic-compressor>delay>chorus>distortion>filter>spectrum-analyzer");
    expect(String(state?.metrics.audioCompressorPreset ?? "")).toMatch(/master|vocal/);
    expect(Number(state?.metrics.audioCompressorGainReductionDb ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioCompressorOutputPeakDb ?? 0)).toBeLessThan(Number(state?.metrics.audioCompressorInputPeakDb ?? 0));
    expect(Number(state?.metrics.audioEqActiveBands ?? 0)).toBeGreaterThanOrEqual(3);
    expect(Number(state?.metrics.audioEqPresenceGainDb ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.audioDelayPreset ?? "")).toMatch(/short_echo|medium_echo|tape_echo/);
    expect(Number(state?.metrics.audioDelayTimeSeconds ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDelayFeedback ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDelayWetDryMix ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDelayRepeatsAboveNoiseFloor ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.audioChorusPreset ?? "")).toMatch(/subtle|classic|ensemble/);
    expect(Number(state?.metrics.audioChorusRateHz ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioChorusDepthSeconds ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioChorusVoices ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.audioChorusStereoWidth ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.audioDistortionCurve ?? "")).toMatch(/sigmoid|softclip|saturation/);
    expect(Number(state?.metrics.audioDistortionAmount ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDistortionHarmonicBoost ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioDistortionOutputCeiling ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.audioFilterType ?? "")).toMatch(/lowpass|bandpass/);
    expect(Number(state?.metrics.audioFilterFrequencyHz ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioFilterQ ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioFilterResonanceDb ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioSpectrumBarCount ?? 0)).toBeGreaterThanOrEqual(16);
    expect(Number(state?.metrics.audioSpectrumPeakFrequencyHz ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.audioSpectrumPeakMagnitude ?? 0)).toBeGreaterThan(0);
    expect(String(state?.metrics.audioEffectsBlockedClaims ?? "")).toContain("Unity Audio Mixer parity");
    expect(String(state?.metrics.audioEffectsBlockedClaims ?? "")).toContain("Unreal Audio Mixer parity");
    expect(String(state?.metrics.audioEffectsAnalysisHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
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
    await page.waitForFunction(() => window.__GALILEO3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 30_000 });
    await dispatchTouchDrag(page, "[data-testid='asset-viewer-canvas']", false);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_ASSET_VIEWER__?.cameraControls?.lastInput)).toBe("touch");
    const assetViewer = await page.evaluate(() => ({
      status: window.__GALILEO3D_ASSET_VIEWER__?.status,
      lastInput: window.__GALILEO3D_ASSET_VIEWER__?.cameraControls?.lastInput,
      touchControls: window.__GALILEO3D_ASSET_VIEWER__?.cameraControls?.touchControls,
      pointerControls: window.__GALILEO3D_ASSET_VIEWER__?.cameraControls?.pointerControls
    }));

    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 20_000 });
    await dispatchTouchDrag(page, ".editor-viewport", false);
    await expect.poll(() => page.evaluate(() => window.__GALILEO3D_EDITOR_APP__?.getState().viewportCamera.lastInput)).toBe("touch");
    const editor = await page.evaluate(() => ({
      status: window.__GALILEO3D_EDITOR_APP__?.getState().status,
      lastInput: window.__GALILEO3D_EDITOR_APP__?.getState().viewportCamera.lastInput,
      touchControls: window.__GALILEO3D_EDITOR_APP__?.getState().viewportCamera.touchControls,
      pointerControls: window.__GALILEO3D_EDITOR_APP__?.getState().viewportCamera.pointerControls
    }));

    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("touchstart");
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerdown", { clientX: 160, clientY: 120, button: 0, pointerId: 44, pointerType: "touch" });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerup", { clientX: 160, clientY: 120, button: 0, pointerId: 44, pointerType: "touch" });
    await expect.poll(() => page.evaluate(() => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.mobileUnlockAttempts ?? 0))).toBeGreaterThanOrEqual(1);
    const game = await page.evaluate(() => ({
      status: window.__GALILEO3D_GAME_DEMO__?.status,
      mobileUnlockAttempts: window.__GALILEO3D_GAME_DEMO__?.metrics.mobileUnlockAttempts,
      mobileUnlockHandling: window.__GALILEO3D_GAME_DEMO__?.metrics.mobileUnlockHandling,
      pointerTouches: window.__GALILEO3D_GAME_DEMO__?.metrics.pointerTouches
    }));

    report.mobileTouch = { assetViewer, editor, game };
    expect(assetViewer).toMatchObject({ status: "ready", lastInput: "touch", touchControls: true, pointerControls: true });
    expect(editor).toMatchObject({ status: "ready", lastInput: "touch", touchControls: true, pointerControls: true });
    expect(game).toMatchObject({ status: "ready", mobileUnlockHandling: true });
  });
});

async function setTestGamepad(page: Page, axisX: number, jump: boolean): Promise<void> {
  await page.evaluate(({ axisX, jump }) => {
    window.__GALILEO3D_TEST_GAMEPADS__ = [{
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
    __GALILEO3D_GAME_DEMO__?: {
      readonly status: "ready" | "error";
      readonly renderer?: string;
      readonly visualClaim?: string;
      readonly metrics: Record<string, number | string | boolean>;
      readonly featureEvidence?: Record<string, number | string | boolean>;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly error?: string;
    };
    __GALILEO3D_ASSET_VIEWER__?: {
      readonly status: "ready" | "error";
      readonly cameraControls?: {
        readonly lastInput?: string;
        readonly touchControls?: boolean;
        readonly pointerControls?: boolean;
      };
    };
    __GALILEO3D_EDITOR_APP__?: {
      getState(): {
        readonly status: "ready" | "error" | "booting";
        readonly viewportCamera: {
          readonly lastInput?: string;
          readonly touchControls?: boolean;
          readonly pointerControls?: boolean;
        };
      };
    };
    __GALILEO3D_TEST_GAMEPADS__?: readonly {
      readonly id: string;
      readonly index: number;
      readonly connected: boolean;
      readonly axes: readonly number[];
      readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
    }[];
  }
}
