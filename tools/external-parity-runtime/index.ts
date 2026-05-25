import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseReport, blockedV4Claims, isRecord, readJson, sourceFilesFromReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();
const reportPath = "tests/reports/external-parity-runtime.json";
const existing = readJson(root, reportPath);
const state = isRecord(existing?.gameSlice) && isRecord(existing.gameSlice.state) ? existing.gameSlice.state : null;
const metrics = isRecord(state?.metrics) ? state.metrics : {};
const featureEvidence = isRecord(state?.featureEvidence) ? state.featureEvidence : {};
const pixels = isRecord(existing?.gameSlice) && isRecord(existing.gameSlice.pixels) ? existing.gameSlice.pixels : {};
const mobileTouch = isRecord(existing?.mobileTouch) ? existing.mobileTouch : {};
const assetViewerTouch = isRecord(mobileTouch.assetViewer) ? mobileTouch.assetViewer : {};
const editorTouch = isRecord(mobileTouch.editor) ? mobileTouch.editor : {};
const gameTouch = isRecord(mobileTouch.game) ? mobileTouch.game : {};
const screenshot = Array.isArray(existing?.screenshots) && typeof existing.screenshots[0] === "string"
  ? existing.screenshots[0]
  : "tests/reports/external-parity-example-screenshots/game-slice-runtime.png";

const checks = [
  check("external-parity-runtime-report-produced-by-runtime-agent", existing?.ok === true, [reportPath], "V4 runtime systems report is not yet passing."),
  check("game-slice-ready", state?.status === "ready", [reportPath], "Game slice did not publish a ready runtime state."),
  check("game-slice-screenshot", hasFreshScreenshot(screenshot), [screenshot], "Game slice runtime screenshot is missing or too small."),
  check("nonblank-runtime-screenshot-pixels", numberAt(pixels, "nonBlankPixels") > 300 && numberAt(pixels, "colorBuckets") >= 1, [reportPath, screenshot], "Runtime screenshot pixel evidence is missing or blank."),
  check("character-controller-camera-input", metrics.characterController === true && metrics.cameraMode === "third-person-follow" && numberAt(metrics, "scriptHookInput") >= 3, [reportPath, "packages/physics/src/CharacterController.ts", "examples/game-slice/main.ts"], "Character controller, camera, and input evidence is incomplete."),
  check("animation-two-bone-ik-port", featureEvidence.oldBranchTwoBoneIkPort === true && metrics.oldBranchTwoBoneIkPort === true && metrics.twoBoneIkReached === true && numberAt(metrics, "twoBoneIkEndDistance") < 0.01 && numberAt(metrics, "twoBoneIkUpperLength") > 0 && numberAt(metrics, "twoBoneIkLowerLength") > 0 && numberAt(metrics, "twoBoneIkPoleInfluence") > 0, [reportPath, "packages/animation/src/IK.ts", "examples/game-slice/main.ts"], "Old-branch two-bone IK port evidence is incomplete."),
  check("ai-navigation-pathfinding-agent", featureEvidence.oldBranchAiNavigationPort === true && featureEvidence.aiNavigationPathfinding === true && featureEvidence.aiNavigationAgent === true && metrics.navigationPathStatus === "success" && metrics.navigationPickupPathStatus === "success" && metrics.navigationExitPathStatus === "success" && numberAt(metrics, "navigationPathWaypoints") >= 3 && numberAt(metrics, "navigationVisitedCells") > 0 && numberAt(metrics, "navigationAgentDistanceTraveled") > 0, [reportPath, "packages/physics/src/Navigation.ts", "examples/game-slice/main.ts"], "AI navigation pathfinding and agent-steering evidence is incomplete."),
  check("ai-weighted-diagonal-navigation", featureEvidence.oldBranchWeightedNavigationPort === true && metrics.oldBranchWeightedNavigationPort === true && metrics.navigationDiagonalMovement === true && numberAt(metrics, "navigationWeightedCells") >= 1 && numberAt(metrics, "navigationPathCost") > 1 && numberAt(metrics, "navigationPickupPathCost") > 0 && numberAt(metrics, "navigationExitPathCost") > 0, [reportPath, "packages/physics/src/Navigation.ts", "examples/game-slice/main.ts"], "Weighted traversal costs and diagonal navigation evidence is incomplete."),
  check("ai-steering-arrive-agent", featureEvidence.oldBranchSteeringPort === true && featureEvidence.aiSteeringArrive === true && metrics.oldBranchSteeringPort === true && numberAt(metrics, "aiSteeringDistanceTraveled") > 0 && numberAt(metrics, "aiSteeringSpeed") > 0 && numberAt(metrics, "aiSteeringDistanceToTarget") > 0, [reportPath, "packages/physics/src/Steering.ts", "examples/game-slice/main.ts"], "AI steering/arrive evidence is incomplete."),
  check("ai-advanced-steering-predictive-wander", featureEvidence.oldBranchAdvancedSteeringPort === true && featureEvidence.aiSteeringFleeForce === true && featureEvidence.aiSteeringPursuitPrediction === true && featureEvidence.aiSteeringEvadePrediction === true && featureEvidence.aiSteeringWanderTarget === true && metrics.oldBranchAdvancedSteeringPort === true && numberAt(metrics, "aiFleeDistance") > 0 && numberAt(metrics, "aiFleeForce") > 0 && numberAt(metrics, "aiPursuitPredictionTime") > 0 && numberAt(metrics, "aiEvadePredictionTime") > 0 && numberAt(metrics, "aiWanderSeed") > 0 && numberAt(metrics, "aiWanderForce") > 0 && Math.abs(numberAt(metrics, "aiWanderTargetX")) + Math.abs(numberAt(metrics, "aiWanderTargetY")) > 0, [reportPath, "packages/physics/src/Steering.ts", "examples/game-slice/main.ts"], "AI advanced flee/pursuit/evade/wander steering evidence is incomplete."),
  check("ai-flocking-obstacle-wall-pipeline", featureEvidence.oldBranchFlockAvoidancePipelinePort === true && metrics.oldBranchFlockAvoidancePipelinePort === true && numberAt(metrics, "aiFlockingNeighbors") > 0 && numberAt(metrics, "aiFlockingForce") > 0 && metrics.aiObstacleAvoidanceDetected === true && numberAt(metrics, "aiObstacleAvoidanceDistance") > 0 && numberAt(metrics, "aiObstacleAvoidanceForce") > 0 && metrics.aiWallAvoidanceDetected === true && numberAt(metrics, "aiWallAvoidanceDistance") > 0 && numberAt(metrics, "aiWallAvoidanceForce") > 0 && numberAt(metrics, "aiSteeringPipelineForce") > 0 && typeof metrics.aiSteeringPipelineSelected === "string" && /wall-avoidance|obstacle-avoidance|flocking|wander/.test(metrics.aiSteeringPipelineSelected), [reportPath, "packages/physics/src/Steering.ts", "examples/game-slice/main.ts"], "AI flocking, obstacle/wall avoidance, or steering-pipeline evidence is incomplete."),
  check("ai-crowd-formation-neighbors", featureEvidence.oldBranchCrowdFormationPort === true && metrics.oldBranchCrowdFormationPort === true && numberAt(metrics, "aiCrowdAgents") >= 4 && typeof metrics.aiCrowdFormation === "string" && /wedge|column/.test(metrics.aiCrowdFormation) && numberAt(metrics, "aiCrowdNeighborPairs") > 0 && numberAt(metrics, "aiCrowdAverageNeighbors") > 0 && numberAt(metrics, "aiCrowdAverageSpeed") > 0 && typeof metrics.aiCrowdSlots === "string" && metrics.aiCrowdSlots.includes("support-alpha"), [reportPath, "packages/physics/src/Crowd.ts", "examples/game-slice/main.ts"], "AI crowd formation/neighbor evidence is incomplete."),
  check("ai-perception-memory", featureEvidence.oldBranchPerceptionPort === true && metrics.oldBranchPerceptionPort === true && numberAt(metrics, "aiPerceptionMemoryCount") > 0 && typeof metrics.aiPerceptionStrongestMemory === "string" && /pickup|exit|hazard/.test(metrics.aiPerceptionStrongestMemory) && numberAt(metrics, "aiPerceptionTopConfidence") >= 0, [reportPath, "packages/scripting/src/Perception.ts", "examples/game-slice/main.ts"], "AI perception/memory evidence is incomplete."),
  check("ai-behavior-tree-blackboard", featureEvidence.oldBranchBehaviorTreePort === true && metrics.oldBranchBehaviorTreePort === true && numberAt(metrics, "aiBehaviorTreeTicks") > 0 && numberAt(metrics, "aiBlackboardVersion") > 0 && numberAt(metrics, "aiBlackboardChanges") > 0 && typeof metrics.aiBehaviorTreeIntent === "string" && /collect-pickup|reach-exit|celebrate/.test(metrics.aiBehaviorTreeIntent) && typeof metrics.aiBehaviorTreeTrace === "string" && metrics.aiBehaviorTreeTrace.includes("intent="), [reportPath, "packages/scripting/src/BehaviorTree.ts", "examples/game-slice/main.ts"], "AI behavior-tree blackboard evidence is incomplete."),
  check("ai-decision-tree-branch-action", featureEvidence.oldBranchDecisionTreePort === true && metrics.oldBranchDecisionTreePort === true && typeof metrics.aiDecisionTreeAction === "string" && /collect-pickup|reach-exit|evade-hazard|celebrate-objective/.test(metrics.aiDecisionTreeAction) && metrics.aiDecisionTreeExecuted === true && typeof metrics.aiDecisionTreePath === "string" && metrics.aiDecisionTreePath.includes("objective-won") && numberAt(metrics, "aiDecisionTreeNodes") >= 7 && numberAt(metrics, "aiDecisionTreeDepth") >= 2, [reportPath, "packages/scripting/src/DecisionTree.ts", "examples/game-slice/main.ts"], "AI decision-tree branch/action evidence is incomplete."),
  check("ai-utility-decision-scoring", featureEvidence.oldBranchUtilityAiPort === true && metrics.oldBranchUtilityAiPort === true && typeof metrics.aiUtilityAction === "string" && /collect-pickup|reach-exit|avoid-hazard/.test(metrics.aiUtilityAction) && numberAt(metrics, "aiUtilityScore") > 0 && numberAt(metrics, "aiUtilityScoreCount") >= 3 && typeof metrics.aiUtilityScores === "string" && metrics.aiUtilityScores.includes("collect-pickup") && typeof metrics.aiUtilityConsiderations === "string" && metrics.aiUtilityConsiderations.length > 0, [reportPath, "packages/scripting/src/UtilityAI.ts", "examples/game-slice/main.ts"], "AI utility-decision scoring evidence is incomplete."),
  check("ai-state-machine-lifecycle", featureEvidence.oldBranchStateMachinePort === true && metrics.oldBranchStateMachinePort === true && typeof metrics.aiStateMachineState === "string" && /seeking-pickup|seeking-exit|avoiding-hazard|celebrating/.test(metrics.aiStateMachineState) && numberAt(metrics, "aiStateMachineTicks") > 0 && numberAt(metrics, "aiStateMachineTransitions") >= 1 && typeof metrics.aiStateMachineHistory === "string" && metrics.aiStateMachineHistory.includes("seeking") && typeof metrics.aiStateMachineTrace === "string" && metrics.aiStateMachineTrace.length > 0, [reportPath, "packages/scripting/src/StateMachine.ts", "examples/game-slice/main.ts"], "AI finite-state-machine lifecycle evidence is incomplete."),
  check("ai-goap-objective-plan", featureEvidence.oldBranchGoapPlannerPort === true && metrics.oldBranchGoapPlannerPort === true && metrics.aiGoapPlanValid === true && numberAt(metrics, "aiGoapPlanLength") >= 3 && numberAt(metrics, "aiGoapPlanCost") > 0 && numberAt(metrics, "aiGoapNodesExplored") > 0 && typeof metrics.aiGoapPlan === "string" && metrics.aiGoapPlan.includes("collect-pickup") && metrics.aiGoapPlan.includes("finish-objective"), [reportPath, "packages/scripting/src/GOAP.ts", "examples/game-slice/main.ts"], "AI GOAP objective planning evidence is incomplete."),
  check("ai-htn-objective-decomposition", featureEvidence.oldBranchHtnPlannerPort === true && metrics.oldBranchHtnPlannerPort === true && metrics.aiHtnPlanValid === true && metrics.aiHtnRootTask === "complete-objective" && numberAt(metrics, "aiHtnPlanLength") >= 2 && typeof metrics.aiHtnPlan === "string" && metrics.aiHtnPlan.includes("finish-objective") && typeof metrics.aiHtnMethodTrace === "string" && metrics.aiHtnMethodTrace.includes("complete-objective:") && numberAt(metrics, "aiHtnDecompositions") >= 1 && numberAt(metrics, "aiHtnIterations") > 0, [reportPath, "packages/scripting/src/HTN.ts", "examples/game-slice/main.ts"], "AI HTN objective decomposition evidence is incomplete."),
  check("old-branch-weapon-system-burst-port", featureEvidence.oldBranchWeaponSystemPort === true && metrics.oldBranchWeaponSystemPort === true && metrics.weaponSystemSource === "origin-master-space-shooter-weapons-adapted" && numberAt(metrics, "weaponLaserProjectiles") >= 3 && numberAt(metrics, "weaponMissileProjectiles") >= 1 && numberAt(metrics, "weaponPlasmaProjectiles") >= 16 && numberAt(metrics, "weaponTotalDamage") > 0 && numberAt(metrics, "weaponMaxSpreadRadians") > 0, [reportPath, "packages/scripting/src/WeaponSystem.ts", "examples/game-slice/main.ts"], "Old-branch space-shooter weapon burst evidence is incomplete."),
  check("old-branch-space-wave-powerup-port", featureEvidence.oldBranchSpaceWavePowerUpPort === true && metrics.oldBranchSpaceWavePowerUpPort === true && metrics.spaceWaveSource === "origin-master-space-shooter-wave-powerup-adapted" && numberAt(metrics, "spaceWaveNumber") > 0 && typeof metrics.spaceWaveEnemyType === "string" && /fighter|bomber|turret|carrier|boss/.test(metrics.spaceWaveEnemyType) && typeof metrics.spaceWaveFormation === "string" && /line|v-formation|surround|random|sides/.test(metrics.spaceWaveFormation) && numberAt(metrics, "spaceWaveCount") > 0 && numberAt(metrics, "spaceWaveTotalScoreValue") > 0 && numberAt(metrics, "spaceWavePowerUpWeight") > 0, [reportPath, "packages/scripting/src/WeaponSystem.ts", "examples/game-slice/main.ts"], "Old-branch space-shooter wave or power-up evidence is incomplete."),
  check("old-branch-powerup-effect-port", featureEvidence.oldBranchPowerUpEffectPort === true && metrics.oldBranchPowerUpEffectPort === true && metrics.powerUpEffectSource === "origin-master-space-shooter-powerup-effects-adapted" && typeof metrics.powerUpEffectType === "string" && /health|shield|weapon|speed|life|multiplier/.test(metrics.powerUpEffectType) && typeof metrics.powerUpChangedFields === "string" && metrics.powerUpChangedFields.length > 0, [reportPath, "packages/scripting/src/WeaponSystem.ts", "examples/game-slice/main.ts"], "Old-branch power-up effect evidence is incomplete."),
  check("runtime-script-hooks", numberAt(metrics, "scriptHookInit") >= 1 && numberAt(metrics, "scriptHookUpdate") > 0 && numberAt(metrics, "scriptHookFixedUpdate") > 0 && numberAt(metrics, "scriptHookTrigger") >= 1 && numberAt(metrics, "scriptHookCollision") >= 1 && numberAt(metrics, "scriptHookTeardown") >= 1, [reportPath, "examples/game-slice/main.ts"], "Runtime script hook evidence is incomplete."),
  check("particles-audio-errors", numberAt(metrics, "liveParticles") > 0 && metrics.particleBlending === true && metrics.spatialAudio === true && metrics.audioUnlocked === true && numberAt(metrics, "runtimeErrorCount") >= 6 && numberAt(metrics, "animationErrors") >= 1 && numberAt(metrics, "audioErrors") >= 1, [reportPath, "packages/audio/src/SceneAudioBridge.ts", "examples/game-slice/main.ts"], "Particles, spatial audio, or full runtime error overlay evidence is incomplete."),
  check("objective-restart-loop", numberAt(metrics, "objectiveWinCount") >= 1 && numberAt(metrics, "objectiveRestartCount") >= 1 && metrics.objectivePhase === "playing", [reportPath, "examples/game-slice/main.ts"], "Objective win and restart loop evidence is incomplete."),
  check("viewer-editor-game-touch-controls", assetViewerTouch.status === "ready" && assetViewerTouch.lastInput === "touch" && assetViewerTouch.touchControls === true && editorTouch.status === "ready" && editorTouch.lastInput === "touch" && editorTouch.touchControls === true && gameTouch.status === "ready" && gameTouch.mobileUnlockHandling === true && numberAt(gameTouch, "mobileUnlockAttempts") >= 1, [reportPath, "examples/asset-viewer/main.ts", "apps/editor/src/viewport/EditorViewport.ts", "examples/game-slice/main.ts"], "Viewer, editor, and game touch-control evidence is incomplete."),
  check("old-branch-input-replay-port", featureEvidence.oldBranchInputReplayPort === true && featureEvidence.inputReplayRecording === true && featureEvidence.inputReplayPlayback === true && featureEvidence.inputReplaySeekLoop === true && metrics.oldBranchInputReplayPort === true && metrics.inputReplaySource === "origin-master-input-recorder-playback-adapted" && numberAt(metrics, "inputReplayEvents") >= 6 && numberAt(metrics, "inputReplayFrames") >= 1 && numberAt(metrics, "inputReplayEmittedEvents") >= numberAt(metrics, "inputReplayEvents") && numberAt(metrics, "inputReplayLoopCount") >= 1 && typeof metrics.inputReplayFirstEventTypes === "string" && metrics.inputReplayFirstEventTypes.includes("key"), [reportPath, "packages/input/src/InputReplay.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts"], "Old-branch input recording/playback replay evidence is incomplete."),
  check("old-branch-input-action-binding-port", featureEvidence.oldBranchInputActionBindingPort === true && featureEvidence.inputActionProcessors === true && featureEvidence.inputActionHoldTapDoubleTap === true && featureEvidence.inputActionCompositeAxis === true && featureEvidence.inputActionModifierChord === true && metrics.oldBranchInputActionBindingPort === true && metrics.inputActionBindingSource === "origin-master-input-action-binding-adapted" && numberAt(metrics, "inputActionCount") >= 4 && numberAt(metrics, "inputBindingCount") >= 8 && numberAt(metrics, "inputProcessorCount") >= 3 && numberAt(metrics, "inputProcessedAxis") > 0 && numberAt(metrics, "inputDeadzoneFilteredAxis") === 0 && numberAt(metrics, "inputCompositeMagnitude") > 1 && metrics.inputHoldTriggered === true && metrics.inputTapTriggered === true && metrics.inputDoubleTapTriggered === true && metrics.inputModifierChordPressed === true, [reportPath, "packages/input/src/InputActionBindingFixtures.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts"], "Old-branch input action binding processor/interaction evidence is incomplete."),
  check("old-branch-virtual-touch-joystick-port", featureEvidence.oldBranchVirtualTouchJoystickPort === true && featureEvidence.virtualTouchJoystickDeadZone === true && featureEvidence.virtualTouchJoystickClamped === true && featureEvidence.virtualTouchJoystickRecentered === true && metrics.oldBranchVirtualTouchJoystickPort === true && metrics.virtualTouchJoystickSource === "origin-master-touch-joystick-virtual-input-adapted" && numberAt(metrics, "virtualTouchJoystickActiveMagnitude") > 0.8 && numberAt(metrics, "virtualTouchJoystickReleasedMagnitude") === 0 && numberAt(metrics, "virtualTouchJoystickConsumedTouches") >= 1 && numberAt(metrics, "virtualTouchJoystickDeadZone") > 0 && metrics.virtualTouchJoystickFloatingCenter === true && metrics.virtualTouchJoystickReturnToCenter === true, [reportPath, "packages/input/src/VirtualTouchControls.ts", "examples/game-slice/main.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts"], "Old-branch virtual touch joystick evidence is incomplete."),
  check("completed-task-evidence", Array.isArray(existing?.completedTasks) && existing.completedTasks.length >= 6 && existing.completedTasks.every((entry) => isRecord(entry) && Array.isArray(entry.evidence) && entry.evidence.length >= 3), [reportPath], "Runtime report completed task evidence is incomplete.")
] as const;

const violations = checks.filter((entry) => !entry.passed).map((entry) => entry.blocker);
const audit = {
  ...baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:external-parity-runtime",
    runIdPrefix: "external-parity-runtime",
    sourceFiles: [
      "tools/external-parity-runtime/index.ts",
      "tests/browser/runtime-external-parity.spec.ts",
      "tests/reports/external-parity-runtime.json",
      "tests/reports/external-parity-example-screenshots/game-slice-runtime.png",
      "examples/game-slice/main.ts",
      "packages/animation/src/IK.ts",
      "packages/physics/src/CharacterController.ts",
      "packages/physics/src/Navigation.ts",
      "packages/physics/src/Steering.ts",
      "packages/physics/src/Crowd.ts",
      "packages/input/src/InputReplay.ts",
      "packages/input/src/InputActionBindingFixtures.ts",
      "packages/input/src/VirtualTouchControls.ts",
      "packages/scripting/src/BehaviorTree.ts",
      "packages/scripting/src/DecisionTree.ts",
      "packages/scripting/src/Perception.ts",
      "packages/scripting/src/UtilityAI.ts",
      "packages/scripting/src/StateMachine.ts",
      "packages/scripting/src/GOAP.ts",
      "packages/scripting/src/HTN.ts",
      "packages/scripting/src/WeaponSystem.ts",
      "packages/audio/src/SceneAudioBridge.ts"
    ],
    blockedClaims: blockedV4Claims,
    screenshotPaths: [screenshot],
    violations,
  }),
  subsystem: "runtime-systems",
  checks,
  blockedRuntimeClaims: [
    "The V4 game slice uses generated local glTF validation assets, not externally licensed production art.",
    "Lit skinning and animation state-machine completion remain blocked by runtime evidence."
  ]
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  if (existing?.ok === true) {
    writeJson(root, reportPath, {
      ...existing,
      ...baseReport(root, {
        ok: true,
        command: "pnpm verify:external-parity-runtime",
        runIdPrefix: "external-parity-runtime",
        sourceFiles: sourceFilesFromReport(existing, [
          "tools/external-parity-runtime/index.ts",
          "tests/browser/runtime-external-parity.spec.ts",
          "examples/game-slice/main.ts",
          "packages/animation/src/IK.ts",
          "packages/physics/src/CharacterController.ts",
          "packages/physics/src/Navigation.ts",
          "packages/physics/src/Steering.ts",
          "packages/physics/src/Crowd.ts",
          "packages/input/src/InputReplay.ts",
          "packages/input/src/InputActionBindingFixtures.ts",
          "packages/input/src/VirtualTouchControls.ts",
          "packages/scripting/src/BehaviorTree.ts",
          "packages/scripting/src/DecisionTree.ts",
          "packages/scripting/src/Perception.ts",
          "packages/scripting/src/UtilityAI.ts",
          "packages/scripting/src/StateMachine.ts",
          "packages/scripting/src/GOAP.ts",
          "packages/scripting/src/HTN.ts",
          "packages/audio/src/SceneAudioBridge.ts",
          screenshot,
        ], reportPath),
        screenshotPaths: [screenshot],
      }),
      normalizedBy: "tools/external-parity-runtime/index.ts",
    });
  }
  writeJson(root, "tests/reports/external-parity-runtime-audit.json", audit);
  console.log(JSON.stringify({ ok: audit.ok, report: "tests/reports/external-parity-runtime-audit.json", checks: checks.length }, null, 2));
  if (!audit.ok) process.exitCode = 1;
}

function check(id: string, passed: boolean, evidencePaths: readonly string[], blocker: string) {
  return { id, passed, evidencePaths, blocker };
}

function numberAt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function hasFreshScreenshot(path: string): boolean {
  const absolute = join(root, path);
  return existsSync(absolute) && statSync(absolute).isFile() && statSync(absolute).size > 10_000;
}
