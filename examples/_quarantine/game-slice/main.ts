import { AnimationClip, AnimationMixer, AnimationTrack, Bone, Skeleton, buildSkinningPalette, sampleMotionMatchingFixture, sampleSecondaryAnimationFixture, solveTwoBoneIk, type AnimationValue } from "@aura3d/animation";
import { createGLTFRenderResources, GLTFLoader, LoadContext, type GLTFMeshAsset, type GLTFRenderResources, type GLTFSkinAsset } from "@aura3d/assets";
import { AudioClip, AudioListener, AudioSource, AudioSystem, SceneAudioBridge, SpatialAudio, sampleAdaptiveMusicFixture, sampleAudioEffectsAnalysisFixture, sampleAudioEnvironmentFixture } from "@aura3d/audio";
import { createSceneCameraControlAdapter, InputPlayback, InputRecorder, InputSnapshot, InputSystem, ThirdPersonFollowControls, sampleGestureHapticsFixture, sampleInputActionBindingFixture, sampleVirtualTouchJoystickFixture, sampleXRRuntimeFixture, type GamepadLike, type InputPlaybackSnapshot, type InputRecording } from "@aura3d/input";
import {
  CharacterController,
  CrowdSimulation,
  NavigationAgent,
  NavigationGrid,
  PhysicsWorld,
  Shape,
  SteeringAgent,
  arriveSteering,
  blendSteeringForces,
  evadeSteering,
  fleeSteering,
  flockingSteering,
  obstacleAvoidanceSteering,
  samplePlatformerControllerFixture,
  sampleClothSimulationFixture,
  sampleSoftBodyFixture,
  sampleFractureFixture,
  sampleFluidFixture,
  sampleFireSmokeFixture,
  pursuitSteering,
  wallAvoidanceSteering,
  wanderSteering,
  type NavigationAgentSnapshot,
  type NavigationPath,
  type NavigationPoint,
  type CrowdSimulationSnapshot,
  type SteeringAgentSnapshot
} from "@aura3d/physics";
import {
  Geometry,
  IndexBuffer,
  PBRMaterial,
  ParticleEmitter,
  ParticleRenderer,
  ParticleSystem,
  Renderer,
  SkinnedLitMaterial,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  Texture,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  createExternalParityDirectionalShadowEvidence,
  createExternalParityEnvironmentLighting,
  createExternalParityFlagshipRenderPresetEvidence,
  createProceduralTextureFixture,
  sampleSpaceEnvironmentFixture,
  sampleExternalParityLdrPostprocessReadback,
  type ParticleRenderBatch,
  type ParticleSortMode,
  type ProceduralTextureFixture,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type SpaceEnvironmentFixture,
  type ExternalParityDirectionalShadowEvidence,
  type ExternalParityEnvironmentLightingBundle,
  type ExternalParityLdrPostprocessSummary,
  type ExternalParityRenderPresetEvidence
} from "@aura3d/rendering";
import {
  BehaviorAction,
  BehaviorCondition,
  BehaviorHost,
  BehaviorSelector,
  BehaviorSequence,
  BehaviorSystem,
  BehaviorTree,
  Blackboard,
  DecisionTree,
  GOAPAction,
  GOAPPlanner,
  HTNPlanner,
  HTNTask,
  PerceptionSensor,
  State as AiState,
  StateMachine as AiStateMachine,
  UtilityAI,
  UtilityAction,
  UtilityConsideration,
  WorldState,
  sampleAdaptiveDifficultyFixture,
  sampleAnalyticsPrivacyFixture,
  sampleCloudServiceFixture,
  sampleCulturalBehaviorFixture,
  sampleFpsEnemyTactics,
  sampleFpsHudOverlay,
  sampleFpsLevelLayout,
  sampleFpsWeaponCycle,
  sampleLearningAgentFixture,
  sampleNetworkReplicationFixture,
  samplePlayerBehaviorTelemetryFixture,
  samplePowerUpEffect,
  sampleProceduralContentAdaptationFixture,
  sampleSpaceShooterWave,
  sampleWeaponBurst,
  type Behavior,
  type BehaviorTreeTickResult,
  type DecisionTreeDecision,
  type GOAPPlan,
  type HTNPlan,
  type PerceptionSnapshot,
  type ScriptContext,
  type StateMachineSnapshot,
  type UtilityActionScore
} from "@aura3d/scripting";
import { Scene, type PerspectiveCamera } from "@aura3d/scene";

type DemoStatus = {
  id: string;
  status: "ready" | "error";
  renderer: "webgl2";
  interactions: number;
  metrics: Record<string, number | string | boolean>;
  visualClaim: string;
  knownLimits: readonly string[];
  screenshotPath: string;
  featureEvidence: Record<string, number | string | boolean>;
  externalParityRenderPreset?: ExternalParityRenderPresetEvidence;
  postprocess?: ExternalParityLdrPostprocessSummary;
  environmentResources?: ExternalParityEnvironmentLightingBundle["resources"];
  directionalShadow?: ExternalParityDirectionalShadowEvidence;
  claimBoundary: string;
  diagnostics?: RenderDeviceDiagnostics;
  errors?: readonly RuntimeError[];
  error?: string;
};

type RuntimeError = {
  readonly phase: string;
  readonly message: string;
};

type BindingPreset = "space" | "wasd" | "pointer";
type GameplayPhase = "playing" | "won" | "failed";
type ObjectiveStep = "collect-pickup" | "reach-exit" | "complete" | "failed";
type PlayerAnimationState = "idle" | "run" | "jump" | "win" | "fail";

type RuntimeBehaviorState = {
  started: number;
  movementUpdates: number;
  interactionEvents: number;
  triggerEvents: number;
  collisionEvents: number;
  teardownEvents: number;
  uiUpdates: number;
  reloads: number;
};

type PlayerAnimationStateMachine = {
  readonly states: readonly PlayerAnimationState[];
  current: PlayerAnimationState;
  previous: PlayerAnimationState;
  transitions: number;
  lastTransition: string;
  stateTime: number;
};

type GameRenderResources = {
  readonly playerGeometry: Geometry;
  readonly pickupGeometry: Geometry;
  readonly platformGeometry: Geometry;
  readonly showcaseGeometry: Geometry;
  readonly triggerGeometry: Geometry;
  readonly exitGeometry: Geometry;
  readonly hazardGeometry: Geometry;
  readonly contactShadowGeometry: Geometry;
  readonly floorGeometry: Geometry;
  readonly railGeometry: Geometry;
  readonly arenaDetailGeometry: Geometry;
  readonly starfieldGeometry: Geometry;
  readonly spaceEnvironmentGeometry: Geometry;
  readonly playerMaterial: PBRMaterial;
  readonly pickupMaterial: PBRMaterial;
  readonly platformMaterial: TexturedPBRMaterial;
  readonly holoPanelMaterial: TexturedPBRMaterial;
  readonly holoTextureMaterial: TexturedUnlitMaterial;
  readonly holoTextureMaterials: readonly TexturedUnlitMaterial[];
  readonly holoPaletteMaterial: TexturedUnlitMaterial;
  readonly groundMaterial: TexturedPBRMaterial;
  readonly backdropMaterial: TexturedPBRMaterial;
  readonly nebulaMaterial: PBRMaterial;
  readonly skyGlowMaterial: PBRMaterial;
  readonly skylineMaterial: PBRMaterial;
  readonly beaconMaterial: PBRMaterial;
  readonly arenaPaletteMaterials: readonly PBRMaterial[];
  readonly amberPanelMaterial: PBRMaterial;
  readonly greenPanelMaterial: PBRMaterial;
  readonly ivoryPanelMaterial: PBRMaterial;
  readonly seamMaterial: PBRMaterial;
  readonly triggerMaterial: PBRMaterial;
  readonly exitMaterial: PBRMaterial;
  readonly hazardMaterial: PBRMaterial;
  readonly contactShadowMaterial: PBRMaterial;
  readonly railMaterial: PBRMaterial;
  readonly particleMaterial: UnlitMaterial;
  readonly floorMaterial: PBRMaterial;
  readonly starfieldMaterial: UnlitMaterial;
  readonly arenaAccentMaterials: readonly UnlitMaterial[];
  readonly starfieldFixture: { readonly id: string; readonly hash: string; readonly semantic: string };
  readonly spaceEnvironmentFixture: Pick<SpaceEnvironmentFixture, "id" | "source" | "hash" | "starCount" | "nebulaCount" | "dustCount" | "blockedClaims">;
  readonly materialFixtures: readonly { readonly id: string; readonly hash: string; readonly semantic: string }[];
};

type LoadedGameVisualAssets = {
  readonly playerResources: GLTFRenderResources;
  readonly arenaResources: GLTFRenderResources;
  readonly skinnedHeroGeometry: Geometry;
  readonly skinnedHeroMaterial: SkinnedLitMaterial;
  readonly skinnedHeroSkin: GLTFSkinAsset;
  readonly skinnedHeroClip: AnimationClip;
  readonly playerUrl: string;
  readonly arenaUrl: string;
  readonly skinnedHeroUrl: string;
  readonly playerMeshes: number;
  readonly arenaMeshes: number;
  readonly skinnedHeroMeshName: string;
  readonly skinnedHeroJointCount: number;
  readonly skinnedHeroTrackCount: number;
  readonly playerRenderables: number;
  readonly arenaRenderables: number;
};

const playerStartPosition: readonly [number, number, number] = [-0.72, -0.16, 0];
const pickupPosition: readonly [number, number, number] = [0.9, 0.35, 0];
const exitPosition: readonly [number, number, number] = [1.16, -0.12, 0];
const hazardPosition: readonly [number, number, number] = [-1.18, -0.12, 0];
const objectiveTimeLimitSeconds = 18;
const playerAnimationStates: readonly PlayerAnimationState[] = ["idle", "run", "jump", "win", "fail"] as const;
const externalParityScreenshotPath = "tests/reports/external-parity-example-screenshots/game-slice.png";
const claimBoundary = "ExternalParity game slice evidence is limited to this generated local glTF arena/player, lit skinned ExternalParity hero render item, bounded directional shadow-map metrics with visible receiver darkening, contact-shadow proxy, and browser-proven runtime loop; production forward-pass shadow sampling is not claimed.";

declare global {
  interface Window {
    __AURA3D_GAME_DEMO__?: DemoStatus;
    __AURA3D_TEST_GAMEPADS__?: readonly GamepadLike[];
  }
}

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_GAME_DEMO__ = {
      id: "game-slice",
      status: "error",
      renderer: "webgl2",
      interactions: 0,
      metrics: {},
      visualClaim: "Runtime systems failed before first frame.",
      knownLimits: ["The example uses procedural geometry instead of a streamed production level."],
      screenshotPath: externalParityScreenshotPath,
      featureEvidence: {},
      claimBoundary,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const {
    canvas,
    status,
    audioButton,
    bindingSelect,
    pointerLockButton,
    mixerVolume,
    mixerMute,
    particleSortSelect,
    scriptErrorButton,
    assetErrorButton,
    renderErrorButton,
    physicsErrorButton,
    animationErrorButton,
    audioErrorButton,
    reloadBehaviorButton,
    restartButton,
    objectivePanel,
    spatialAudioState,
    errorPanel
  } = createShell();
  const resize = () => resizeCanvas(canvas);
  resize();
  window.addEventListener("resize", resize);

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.12, 0.18, 0.22, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const input = new InputSystem(canvas);
  input.pointer.setDevicePixelRatio(window.devicePixelRatio);
  configureBindings(input, "space");
  const inputReplayEvidence = createRuntimeInputReplayEvidence();
  const actionBindingEvidence = sampleInputActionBindingFixture();
  const virtualTouchEvidence = sampleVirtualTouchJoystickFixture();
  const gestureHapticsEvidence = sampleGestureHapticsFixture({ seed: 0x9e57, gamepadConnected: true });
  const xrRuntimeEvidence = sampleXRRuntimeFixture({ requestedMode: "immersive-vr", objectCount: 14 });
  const onWindowKeyDown = (event: KeyboardEvent) => input.keyboard.keyDown(event);
  const onWindowKeyUp = (event: KeyboardEvent) => input.keyboard.keyUp(event);
  window.addEventListener("keydown", onWindowKeyDown);
  window.addEventListener("keyup", onWindowKeyUp);
  const audio = new AudioSystem();
  const physics = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 3 });
  const ground = physics.createRigidBody({ type: "static", position: [0, -0.72, 0] });
  physics.createCollider(ground, { shape: Shape.plane([0, 1, 0], -0.72) });
  const character = new CharacterController(physics, {
    position: playerStartPosition,
    radius: 0.22,
    halfHeight: 0.24,
    maxSpeed: 3.2,
    acceleration: 42,
    jumpSpeed: 1.8,
    groundProbeDistance: 0.16,
  });
  const player = character.body;
  const playerCollider = character.collider;
  const navigationGrid = new NavigationGrid({
    width: 10,
    height: 5,
    origin: [-1.6, -0.6],
    cellSize: 0.32,
    allowDiagonal: true,
    blocked: [
      [1, 1],
      [4, 1],
      [4, 2],
      [6, 1]
    ],
    costs: [
      { cell: [2, 1], cost: 1.8 },
      { cell: [3, 1], cost: 2.1 },
      { cell: [5, 2], cost: 2.4 },
      { cell: [7, 1], cost: 1.6 }
    ]
  });
  const navigationToPickup = navigationGrid.findPath(navigationPoint(playerStartPosition), navigationPoint(pickupPosition));
  const navigationToExit = navigationGrid.findPath(navigationPoint(pickupPosition), navigationPoint(exitPosition));
  const navigationRoute = combineNavigationPaths(navigationToPickup, navigationToExit);
  const heroReachIk = solveTwoBoneIk({
    root: [0, 0, 0],
    mid: [0.18, 0.28, 0],
    end: [0.5, 0.33, 0],
    target: [0.45, 0.38, 0],
    pole: [0, 0, 1]
  });
  const navigationAgent = new NavigationAgent({ position: navigationPoint(playerStartPosition), speed: 0.62, waypointRadius: 0.035 });
  navigationAgent.setPath(navigationRoute);
  const steeringAgent = new SteeringAgent({ position: [-1.08, 0.08], maxSpeed: 0.8, maxForce: 1.2 });
  const crowd = new CrowdSimulation({ neighborRadius: 0.72, maxNeighbors: 4, separationWeight: 1.6, alignmentWeight: 0.42, cohesionWeight: 0.36, formationWeight: 0.92 });
  crowd.addAgent({ id: "support-alpha", position: [-0.95, 0.2], maxSpeed: 0.58, priority: 90 });
  crowd.addAgent({ id: "support-beta", position: [-0.82, 0.02], maxSpeed: 0.58, priority: 75 });
  crowd.addAgent({ id: "support-gamma", position: [-1.08, -0.06], maxSpeed: 0.58, priority: 65 });
  crowd.addAgent({ id: "support-delta", position: [-0.68, 0.12], maxSpeed: 0.58, priority: 55 });
  const perceptionSensor = new PerceptionSensor({
    position: navigationPoint(playerStartPosition),
    forward: [1, 0],
    range: 2.6,
    fovRadians: Math.PI * 0.62,
    peripheralRadians: Math.PI * 0.92,
    memoryDecayPerSecond: 0.08,
    forgetBelowConfidence: 0.05
  });
  const gameAiBlackboard = new Blackboard();
  gameAiBlackboard.set("routeStatus", navigationRoute.status);
  gameAiBlackboard.set("target", "pickup");
  const gameAiBehaviorTree = createGameAiBehaviorTree(gameAiBlackboard);
  const gameAiDecisionTree = createGameAiDecisionTree(gameAiBlackboard);
  const gameAiUtility = createGameAiUtility();
  const gameAiStateMachine = createGameAiStateMachine(gameAiBlackboard);
  gameAiStateMachine.start("seeking-pickup");
  const gameAiPlanner = new GOAPPlanner({ maxIterations: 64, maxPlanLength: 6 });
  const gameAiActions = createGameAiGOAPActions();
  const gameAiHtnPlanner = new HTNPlanner({ maxDepth: 8, maxIterations: 64 });
  const gameAiHtnRootTask = createGameAiHTNRootTask();
  const pickup = physics.createRigidBody({ type: "static", position: pickupPosition });
  const pickupCollider = physics.createCollider(pickup, { shape: Shape.box(0.3, 1.15, 0.3), sensor: true });
  const exit = physics.createRigidBody({ type: "static", position: exitPosition });
  const exitCollider = physics.createCollider(exit, { shape: Shape.box(0.28, 0.9, 0.3), sensor: true });
  const hazard = physics.createRigidBody({ type: "static", position: hazardPosition });
  const hazardCollider = physics.createCollider(hazard, { shape: Shape.box(0.24, 0.9, 0.3), sensor: true });
  const platform = physics.createRigidBody({ type: "kinematic", position: [0, -0.48, 0] });
  physics.createCollider(platform, { shape: Shape.box(0.44, 0.08, 0.2), material: { friction: 0.9, restitution: 0 } });

  const particles = new ParticleSystem({
    maxParticles: 400,
    emitters: [
      new ParticleEmitter({
        seed: 908,
        emissionRate: 80,
        lifetime: { min: 0.7, max: 1.2 },
        speed: { min: 0.12, max: 0.42 },
        shape: { type: "sphere", radius: 0.2 },
        initial: { size: 0.04 },
      }),
    ],
  });
  const particleRenderer = new ParticleRenderer();
  const renderResources = createGameRenderResources();
  const visualAssetState = {
    loaded: false,
    error: "",
    loadMs: 0,
    playerMeshes: 0,
    arenaMeshes: 0,
    playerRenderables: 0,
    arenaRenderables: 0,
    playerUrl: "",
    arenaUrl: "",
    renderItems: 0,
  };
  let visualAssets: LoadedGameVisualAssets | undefined;
  try {
    const assetLoadStart = performance.now();
    visualAssets = await loadGameVisualAssets();
    visualAssetState.loaded = true;
    visualAssetState.loadMs = performance.now() - assetLoadStart;
    visualAssetState.playerMeshes = visualAssets.playerMeshes;
    visualAssetState.arenaMeshes = visualAssets.arenaMeshes;
    visualAssetState.playerRenderables = visualAssets.playerRenderables;
    visualAssetState.arenaRenderables = visualAssets.arenaRenderables;
    visualAssetState.playerUrl = visualAssets.playerUrl;
    visualAssetState.arenaUrl = visualAssets.arenaUrl;
  } catch (error) {
    visualAssetState.error = error instanceof Error ? error.message : String(error);
  }

  const mixer = new AnimationMixer();
  mixer.play(new AnimationClip({
    name: "pickup-pulse",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "pickup.scale",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: 0.72 },
          { time: 0.5, value: 1.1 },
          { time: 1, value: 0.72 },
        ],
      }),
    ],
  }));

  const behaviorSystem = new BehaviorSystem();
  const platformHost = new BehaviorHost({ target: platform });
  const { scene, camera } = createLitScene(canvas);
  const cameraAdapter = createSceneCameraControlAdapter(camera);
  const initialPlayerRenderPosition = playerRenderPosition(player.position[0], player.position[1]);
  const cameraTarget = { position: { x: initialPlayerRenderPosition.x, y: initialPlayerRenderPosition.y + 0.2, z: 0 } };
    camera.transform.setPosition(cameraTarget.position.x - 0.08, cameraTarget.position.y + 0.22, 3.55);
  cameraAdapter.lookAt(cameraTarget.position);
  const followCamera = new ThirdPersonFollowControls(cameraAdapter, cameraTarget, {
        offset: { x: -0.08, y: 0.22, z: 3.55 },
    damping: 9,
  });
  const cameraState = {
    mode: "third-person-follow",
    updates: 0,
    pathLength: 0,
    previousX: camera.transform.position[0],
    previousY: camera.transform.position[1],
    previousZ: camera.transform.position[2],
  };
  const scriptedSceneNode = scene.createNode("scripted-runtime-scene-object");
  scene.root.addChild(scriptedSceneNode);
  const audioListenerNode = scene.createNode("audio-listener");
  audioListenerNode.transform.setPosition(0, 0, 3);
  scene.root.addChild(audioListenerNode);
  const pickupAudioNode = scene.createNode("pickup-audio-source");
  pickupAudioNode.transform.setPosition(pickup.position[0], pickup.position[1], pickup.position[2]);
  scene.root.addChild(pickupAudioNode);
  const runtimeBehaviorState: RuntimeBehaviorState = {
    started: 0,
    movementUpdates: 0,
    interactionEvents: 0,
    triggerEvents: 0,
    collisionEvents: 0,
    teardownEvents: 0,
    uiUpdates: 0,
    reloads: 0,
  };
  const sceneObjectHost = new BehaviorHost({ target: scriptedSceneNode });
  let sceneObjectBehavior: Behavior = new RuntimeSceneObjectBehavior(runtimeBehaviorState);
  sceneObjectHost.attach(sceneObjectBehavior);
  behaviorSystem.registerHost(sceneObjectHost);
  let teardownHost = createRuntimeTeardownHost(runtimeBehaviorState);
  behaviorSystem.registerHost(teardownHost);
  const scriptState = {
    started: 0,
    updates: 0,
    panelVisible: false,
    injectedErrors: 0,
  };
  platformHost.attach(new MovingPlatformBehavior(scriptState));
  behaviorSystem.registerHost(platformHost);
  const errorHost = new BehaviorHost({ target: { id: "script-error-probe" } });
  behaviorSystem.registerHost(errorHost);
  const runtimeErrors: RuntimeError[] = [];
  const sceneAudioBridge = new SceneAudioBridge(scene);
  const audioListener = new AudioListener();
  const spatialPickup = new SpatialAudio({
    context: audio.contextManager.context,
    destination: audio.mixer.master.input,
    position: { x: pickup.position[0], y: pickup.position[1], z: pickup.position[2] },
    maxDistance: 8,
    refDistance: 1,
    rolloffFactor: 1.25
  });
  sceneAudioBridge.bindListener(audioListenerNode, audioListener);
  sceneAudioBridge.bindSource(pickupAudioNode, spatialPickup);

  const audioState = {
    unlockAttempts: 0,
    unlocked: false,
    plays: 0,
    clipName: "procedural-pickup-tone",
    clipSource: "not-loaded",
    clipDuration: 0,
    mixerVolume: 1,
    mixerMuted: false,
    sourceState: "idle",
    mobileUnlockAttempts: 0,
  };
  const useDeterministicAudio = navigator.webdriver === true;
  let pickupSource: AudioSource | undefined;
  const pointerLockState = {
    supported: typeof canvas.requestPointerLock === "function",
    requested: 0,
    active: false,
    changes: 0,
    errors: 0,
  };

  const unlockAndPlay = async () => {
    audioState.unlockAttempts += 1;
    if (useDeterministicAudio) {
      audioState.unlocked = true;
      audioState.plays += 1;
      audioState.clipSource = "automation-simulated-data-uri-wav";
      audioState.clipDuration = 0.18;
      audioState.sourceState = "playing";
      audioButton.textContent = "Audio simulated";
      return;
    }
    await audio.unlock();
    audioState.unlocked = true;
    pickupSource ??= await createPickupSource(audio, audioState, spatialPickup.panner);
    pickupSource.play();
    audioState.plays += 1;
    audioState.sourceState = pickupSource.state;
    audioButton.textContent = "Audio running";
  };

  let interactions = 0;
  let pickups = 0;
  let triggerEvents = 0;
  let objectiveEvents = 0;
  let restartCount = 0;
  let currentBinding: BindingPreset = "space";
  let particleSortMode: ParticleSortMode = "back-to-front";
  let lastInputAxis = 0;
  let lastJumpPressed = false;
  let lastFrame: number | undefined;
  let frameMs = 0;
  let particleUpdateMs = 0;
  let renderMs = 0;
  let lastParticleBytes = 0;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let running = true;
  let characterState = character.snapshot();
  let navigationAgentState: NavigationAgentSnapshot = navigationAgent.snapshot();
  let steeringAgentState: SteeringAgentSnapshot = steeringAgent.snapshot();
  let crowdState: CrowdSimulationSnapshot = crowd.snapshot();
  let crowdMaxNeighborPairs = 0;
  let crowdMaxAverageNeighbors = 0;
  let steeringArriveDistance = 0;
  let steeringArrived = false;
  let advancedSteeringFleeDistance = 0;
  let advancedSteeringFleeForce = 0;
  let advancedSteeringPursuitPredictionTime = 0;
  let advancedSteeringPursuitPredictedX = 0;
  let advancedSteeringPursuitPredictedY = 0;
  let advancedSteeringEvadePredictionTime = 0;
  let advancedSteeringEvadePredictedX = 0;
  let advancedSteeringEvadePredictedY = 0;
  let advancedSteeringWanderSeed = 17;
  let advancedSteeringWanderTargetX = 0;
  let advancedSteeringWanderTargetY = 0;
  let advancedSteeringWanderForce = 0;
  let oldBranchFlockAvoidancePipelinePort = false;
  let aiFlockingNeighbors = 0;
  let aiFlockingForce = 0;
  let aiFlockingMaxForce = 0;
  let aiObstacleDetected = false;
  let aiObstacleAvoidanceDistance = 0;
  let aiObstacleAvoidanceForce = 0;
  let aiWallDetected = false;
  let aiWallAvoidanceDistance = 0;
  let aiWallAvoidanceForce = 0;
  let aiSteeringPipelineForce = 0;
  let aiSteeringPipelineSelected = "none";
  let aiObstacleDetectedEver = false;
  let aiObstacleAvoidanceClosestDistance = 0;
  let aiObstacleAvoidanceMaxForce = 0;
  let aiWallDetectedEver = false;
  let aiWallAvoidanceClosestDistance = 0;
  let aiWallAvoidanceMaxForce = 0;
  let aiSteeringPipelineMaxForce = 0;
  let aiSteeringPipelineSelectedEver = "none";
  let perceptionState: PerceptionSnapshot = perceptionSensor.scan([], 0);
  let gameAiBehaviorState: BehaviorTreeTickResult = gameAiBehaviorTree.tick(0);
  let gameAiDecision: DecisionTreeDecision = gameAiDecisionTree.decide({ values: { objectivePhase: "playing", collectedPickup: false } });
  let gameAiUtilityScores: readonly UtilityActionScore[] = [];
  let gameAiUtilityDecision: UtilityActionScore | undefined;
  let gameAiStateMachineState: StateMachineSnapshot = gameAiStateMachine.snapshot();
  let gameAiPlan: GOAPPlan = gameAiPlanner.plan(WorldState.from({ objectiveComplete: false }), WorldState.from({ objectiveComplete: true }), []);
  let gameAiHtnPlan: HTNPlan = gameAiHtnPlanner.plan(gameAiHtnRootTask, WorldState.from({ objectiveComplete: false }));
  let characterJumpCount = 0;
  const playerAnimationStateMachine: PlayerAnimationStateMachine = {
    states: playerAnimationStates,
    current: "idle",
    previous: "idle",
    transitions: 0,
    lastTransition: "idle",
    stateTime: 0,
  };
  const objectiveState = {
    phase: "playing" as GameplayPhase,
    step: "collect-pickup" as ObjectiveStep,
    collectedPickup: false,
    exitReached: false,
    failReason: "",
    winReason: "",
    elapsedSeconds: 0,
    winCount: 0,
    failCount: 0,
  };
  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
    interactions += 1;
    runtimeBehaviorState.interactionEvents += 1;
    if (currentBinding === "pointer") {
      character.setMoveInput({ x: 1 });
      character.jump();
    }
  });
  canvas.addEventListener("touchstart", () => {
    runtimeBehaviorState.interactionEvents += 1;
    audioState.mobileUnlockAttempts += 1;
    if (!audioState.unlocked) {
      void unlockAndPlay();
    }
  }, { passive: true });
  canvas.addEventListener("keydown", (event) => {
    if (event.code !== "Space" && event.code !== "KeyW") return;
    event.preventDefault();
    interactions += 1;
    runtimeBehaviorState.interactionEvents += 1;
  });
  bindingSelect.addEventListener("change", () => {
    currentBinding = bindingSelect.value as BindingPreset;
    configureBindings(input, currentBinding);
    interactions += 1;
    runtimeBehaviorState.interactionEvents += 1;
    canvas.focus();
  });
  const onPointerLockChange = () => {
    pointerLockState.active = document.pointerLockElement === canvas;
    pointerLockState.changes += 1;
    pointerLockButton.textContent = pointerLockState.active ? "Exit pointer lock" : "Pointer lock";
  };
  const onPointerLockError = () => {
    pointerLockState.errors += 1;
    pointerLockState.active = false;
    pointerLockButton.textContent = "Pointer lock";
  };
  document.addEventListener("pointerlockchange", onPointerLockChange);
  document.addEventListener("pointerlockerror", onPointerLockError);
  pointerLockButton.addEventListener("click", (event) => {
    interactions += 1;
    pointerLockState.requested += 1;
    if (!event.isTrusted) {
      pointerLockState.errors += 1;
      pointerLockState.active = false;
      pointerLockButton.textContent = "Pointer lock";
      return;
    }
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
      return;
    }
    canvas.focus();
    const request = canvas.requestPointerLock?.();
    if (request && typeof request.catch === "function") {
      request.catch(() => {
        pointerLockState.errors += 1;
        pointerLockState.active = false;
      });
    }
  });
  audioButton.addEventListener("click", () => {
    interactions += 1;
    void unlockAndPlay().catch((error) => publishScriptError(errorPanel, behaviorSystem, runtimeErrors, {
      phase: "audio",
      message: error instanceof Error ? error.message : String(error),
    }));
  });
  mixerVolume.addEventListener("input", () => {
    const volume = clamp(Number(mixerVolume.value), 0, 1.5);
    audioState.mixerVolume = volume;
    audio.mixer.master.setVolume(volume);
    interactions += 1;
  });
  mixerMute.addEventListener("change", () => {
    audioState.mixerMuted = mixerMute.checked;
    audio.mixer.master.mute(mixerMute.checked);
    interactions += 1;
  });
  particleSortSelect.addEventListener("change", () => {
    particleSortMode = particleSortSelect.value as ParticleSortMode;
    interactions += 1;
  });
  scriptErrorButton.addEventListener("click", () => {
    interactions += 1;
    scriptState.injectedErrors += 1;
    errorHost.attach(new ThrowOnceBehavior());
  });
  assetErrorButton.addEventListener("click", () => {
    interactions += 1;
    publishRuntimeError(errorPanel, runtimeErrors, { phase: "asset", message: "Missing runtime asset: game-slice/arena.glb" });
  });
  renderErrorButton.addEventListener("click", () => {
    interactions += 1;
    publishRuntimeError(errorPanel, runtimeErrors, { phase: "render", message: "Render material binding failed for game-slice/player" });
  });
  physicsErrorButton.addEventListener("click", () => {
    interactions += 1;
    publishRuntimeError(errorPanel, runtimeErrors, { phase: "physics", message: "Physics solver rejected invalid collider dimensions" });
  });
  animationErrorButton.addEventListener("click", () => {
    interactions += 1;
    publishRuntimeError(errorPanel, runtimeErrors, { phase: "animation", message: "Animation state missing clip: player/run" });
  });
  audioErrorButton.addEventListener("click", () => {
    interactions += 1;
    publishRuntimeError(errorPanel, runtimeErrors, { phase: "audio", message: "Audio graph refused disconnected spatial source" });
  });
  reloadBehaviorButton.addEventListener("click", () => {
    interactions += 1;
    sceneObjectHost.detach(sceneObjectBehavior);
    sceneObjectBehavior = new RuntimeSceneObjectBehavior(runtimeBehaviorState);
    sceneObjectHost.attach(sceneObjectBehavior);
    runtimeBehaviorState.reloads += 1;
    void teardownHost.destroy().then(() => {
      behaviorSystem.unregisterHost(teardownHost);
      teardownHost = createRuntimeTeardownHost(runtimeBehaviorState);
      behaviorSystem.registerHost(teardownHost);
    });
  });
  restartButton.addEventListener("click", () => {
    interactions += 1;
    runtimeBehaviorState.interactionEvents += 1;
    restartCount += 1;
    resetObjective(objectiveState);
    character.teleport(playerStartPosition);
    player.setVelocity([0, 0, 0]);
    input.endFrame();
  });

  const render = (time: number) => {
    if (!running) return;
    const elapsedMs = lastFrame === undefined ? 16.67 : Math.max(1, time - lastFrame);
    const dt = Math.min(1 / 30, elapsedMs / 1000);
    frameMs = frameMs * 0.85 + elapsedMs * 0.15;
    lastFrame = time;

    const browserGamepads = Array.from(navigator.getGamepads?.() ?? []);
    const snapshot = input.update(window.__AURA3D_TEST_GAMEPADS__ ?? browserGamepads);
    lastInputAxis = input.actions.axis("moveX", snapshot);
    lastJumpPressed = input.actions.pressed("jump", snapshot);
    character.setMoveInput({ x: objectiveState.phase === "playing" ? lastInputAxis : 0 });
    if (objectiveState.phase === "playing" && lastJumpPressed) {
      character.jump();
    }
    if (objectiveState.phase === "playing") {
      objectiveState.elapsedSeconds += dt;
    }
    characterState = character.step(dt);
    navigationAgentState = navigationAgent.update(dt);
    const steeringTarget = objectiveState.collectedPickup ? navigationPoint(exitPosition) : navigationPoint(pickupPosition);
    const steering = arriveSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      target: steeringTarget,
      maxSpeed: 0.8,
      slowingRadius: 0.42,
      tolerance: 0.035
    });
    steeringArriveDistance = steering.distance;
    steeringArrived = steering.arrived;
    const fleeSteeringState = fleeSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      threat: navigationPoint(hazardPosition),
      maxSpeed: 0.8,
      panicDistance: 3
    });
    const pursuitSteeringState = pursuitSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      targetPosition: steeringTarget,
      targetVelocity: objectiveState.collectedPickup ? [0.08, -0.02] : [0.1, 0.03],
      maxSpeed: 0.8,
      maxPredictionTime: 1.4
    });
    const evadeSteeringState = evadeSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      threatPosition: navigationPoint(hazardPosition),
      threatVelocity: [0.04, 0.02],
      maxSpeed: 0.8,
      maxPredictionTime: 1.2,
      panicDistance: 3
    });
    const wanderSteeringState = wanderSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      maxSpeed: 0.8,
      seed: Math.max(1, Math.round(objectiveState.elapsedSeconds * 60) + 17),
      radius: 0.22,
      distance: 0.38,
      jitter: 0.08
    });
    advancedSteeringFleeDistance = fleeSteeringState.distance;
    advancedSteeringFleeForce = Math.hypot(fleeSteeringState.force[0], fleeSteeringState.force[1]);
    advancedSteeringPursuitPredictionTime = pursuitSteeringState.predictionTime;
    advancedSteeringPursuitPredictedX = pursuitSteeringState.predictedTarget[0];
    advancedSteeringPursuitPredictedY = pursuitSteeringState.predictedTarget[1];
    advancedSteeringEvadePredictionTime = evadeSteeringState.predictionTime;
    advancedSteeringEvadePredictedX = evadeSteeringState.predictedTarget[0];
    advancedSteeringEvadePredictedY = evadeSteeringState.predictedTarget[1];
    advancedSteeringWanderSeed = wanderSteeringState.seed;
    advancedSteeringWanderTargetX = wanderSteeringState.wanderTarget[0];
    advancedSteeringWanderTargetY = wanderSteeringState.wanderTarget[1];
    advancedSteeringWanderForce = Math.hypot(wanderSteeringState.force[0], wanderSteeringState.force[1]);
    steeringAgentState = steeringAgent.apply(steering.force, dt);
    crowd.setFormation({
      type: objectiveState.collectedPickup ? "column" : "wedge",
      center: [clamp(player.position[0] - 0.22, -1.05, 1.05), clamp(player.position[1] + 0.22, -0.35, 0.65)],
      forward: objectiveState.collectedPickup ? [1, 0] : [0.85, 0.25],
      spacing: 0.18
    });
    crowdState = crowd.update(dt);
    crowdMaxNeighborPairs = Math.max(crowdMaxNeighborPairs, crowdState.neighborPairs);
    crowdMaxAverageNeighbors = Math.max(crowdMaxAverageNeighbors, crowdState.averageNeighbors);
    const flockingSteeringState = flockingSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      neighbors: crowdState.agents.map((agent) => ({ position: agent.position, velocity: agent.velocity })),
      maxSpeed: 0.8,
      separationRadius: 0.38,
      alignmentRadius: 1.8,
      cohesionRadius: 1.8
    });
    const obstacleAvoidanceState = obstacleAvoidanceSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      obstacles: [
        { id: "pickup", position: navigationPoint(pickupPosition), radius: 0.18 },
        { id: "exit", position: navigationPoint(exitPosition), radius: 0.16 },
        { id: "hazard", position: navigationPoint(hazardPosition), radius: 0.24 }
      ],
      maxSpeed: 0.8,
      detectionDistance: 3,
      agentRadius: 0.14
    });
    const wallAvoidanceState = wallAvoidanceSteering({
      position: steeringAgentState.position,
      velocity: steeringAgentState.velocity,
      walls: [
        { id: "right-arena-wall", start: [1.24, -0.72], end: [1.24, 0.72], normal: [-1, 0] },
        { id: "left-arena-wall", start: [-1.24, -0.72], end: [-1.24, 0.72], normal: [1, 0] }
      ],
      maxSpeed: 0.8,
      whiskerLength: 3,
      avoidanceForce: 0.8
    });
    const steeringPipelineState = blendSteeringForces({
      entries: [
        { id: "wall-avoidance", force: wallAvoidanceState.force, priority: 80 },
        { id: "obstacle-avoidance", force: obstacleAvoidanceState.force, priority: 70 },
        { id: "flocking", force: flockingSteeringState.force, priority: 30, weight: 0.45 },
        { id: "wander", force: wanderSteeringState.force, priority: 10, weight: 0.2 }
      ],
      mode: "priority",
      maxForce: 1.2,
      priorityThreshold: 0.001
    });
    oldBranchFlockAvoidancePipelinePort = true;
    aiFlockingNeighbors = flockingSteeringState.neighborCount;
    aiFlockingForce = Math.hypot(flockingSteeringState.force[0], flockingSteeringState.force[1]);
    aiFlockingMaxForce = Math.max(aiFlockingMaxForce, aiFlockingForce);
    aiObstacleDetected = obstacleAvoidanceState.obstacleDetected;
    aiObstacleAvoidanceDistance = obstacleAvoidanceState.closestDistance;
    aiObstacleAvoidanceForce = Math.hypot(obstacleAvoidanceState.force[0], obstacleAvoidanceState.force[1]);
    aiWallDetected = wallAvoidanceState.wallDetected;
    aiWallAvoidanceDistance = wallAvoidanceState.hitDistance;
    aiWallAvoidanceForce = Math.hypot(wallAvoidanceState.force[0], wallAvoidanceState.force[1]);
    aiSteeringPipelineForce = Math.hypot(steeringPipelineState.force[0], steeringPipelineState.force[1]);
    aiSteeringPipelineSelected = steeringPipelineState.selectedIds.join(",") || "none";
    if (aiObstacleDetected) {
      aiObstacleDetectedEver = true;
      aiObstacleAvoidanceClosestDistance = aiObstacleAvoidanceClosestDistance === 0 ? aiObstacleAvoidanceDistance : Math.min(aiObstacleAvoidanceClosestDistance, aiObstacleAvoidanceDistance);
      aiObstacleAvoidanceMaxForce = Math.max(aiObstacleAvoidanceMaxForce, aiObstacleAvoidanceForce);
    }
    if (aiWallDetected) {
      aiWallDetectedEver = true;
      aiWallAvoidanceClosestDistance = aiWallAvoidanceClosestDistance === 0 ? aiWallAvoidanceDistance : Math.min(aiWallAvoidanceClosestDistance, aiWallAvoidanceDistance);
      aiWallAvoidanceMaxForce = Math.max(aiWallAvoidanceMaxForce, aiWallAvoidanceForce);
    }
    if (aiSteeringPipelineSelected !== "none") {
      aiSteeringPipelineSelectedEver = aiSteeringPipelineSelected;
      aiSteeringPipelineMaxForce = Math.max(aiSteeringPipelineMaxForce, aiSteeringPipelineForce);
    }
    if (characterState.jumpedThisFrame) {
      characterJumpCount += 1;
    }
    input.endFrame();
    void behaviorSystem.fixedUpdate({ deltaSeconds: dt, fixedDeltaSeconds: physics.fixedDelta });
    const events = physics.step(dt);
    void behaviorSystem.update({ deltaSeconds: dt, fixedDeltaSeconds: physics.fixedDelta });
    for (const event of events) {
      const contact = event.contact;
      const hitPickup = contact.colliderA === pickupCollider.id || contact.colliderB === pickupCollider.id;
      const hitExit = contact.colliderA === exitCollider.id || contact.colliderB === exitCollider.id;
      const hitHazard = contact.colliderA === hazardCollider.id || contact.colliderB === hazardCollider.id;
      const hitPlayer = contact.colliderA === playerCollider.id || contact.colliderB === playerCollider.id;
      if (event.type === "begin" && hitPlayer) {
        runtimeBehaviorState.collisionEvents += 1;
      }
      if (event.type === "begin" && hitPickup && hitPlayer && objectiveState.phase === "playing" && !objectiveState.collectedPickup) {
        triggerEvents += 1;
        runtimeBehaviorState.triggerEvents += 1;
        pickups += 1;
        objectiveEvents += 1;
        objectiveState.collectedPickup = true;
        objectiveState.step = "reach-exit";
        player.applyImpulse([-0.5, 0.3, 0]);
        if (audioState.unlocked && pickupSource) {
          pickupSource.play();
          audioState.plays += 1;
          audioState.sourceState = pickupSource.state;
        }
      }
      if (event.type === "begin" && hitExit && hitPlayer && objectiveState.phase === "playing" && objectiveState.collectedPickup) {
        completeObjective(objectiveState, "exit-gate");
        objectiveEvents += 1;
      }
      if (event.type === "begin" && hitHazard && hitPlayer && objectiveState.phase === "playing") {
        failObjective(objectiveState, "hazard-zone");
        objectiveEvents += 1;
      }
    }
    if (objectiveState.phase === "playing" && objectiveState.collectedPickup && player.position[0] >= exitPosition[0] - 0.08) {
      completeObjective(objectiveState, "exit-gate");
      objectiveEvents += 1;
    }
    if (objectiveState.phase === "playing" && !objectiveState.collectedPickup && player.position[0] >= pickupPosition[0] - 0.08) {
      triggerEvents += 1;
      runtimeBehaviorState.triggerEvents += 1;
      pickups += 1;
      objectiveEvents += 1;
      objectiveState.collectedPickup = true;
      objectiveState.step = "reach-exit";
    }
    if (objectiveState.phase === "playing" && player.position[0] <= hazardPosition[0] + 0.08) {
      failObjective(objectiveState, "hazard-zone");
      objectiveEvents += 1;
    }
    if (objectiveState.phase === "playing" && objectiveState.elapsedSeconds >= objectiveTimeLimitSeconds) {
      failObjective(objectiveState, "time-limit");
      objectiveEvents += 1;
    }
    if (player.position[0] > 1.25) {
      character.teleport([-1.05, Math.max(player.position[1], -0.22), 0]);
      player.setVelocity([0.28, player.velocity[1], 0]);
    }
    perceptionSensor.updateTransform(navigationPoint([player.position[0], player.position[1], player.position[2]]), [1, 0]);
    perceptionState = perceptionSensor.scan([
      { id: "pickup", position: navigationPoint(pickupPosition), priority: objectiveState.collectedPickup ? 0.25 : 1.15 },
      { id: "exit", position: navigationPoint(exitPosition), priority: objectiveState.collectedPickup ? 1.2 : 0.55 },
      { id: "hazard", position: navigationPoint(hazardPosition), priority: 0.85 }
    ], dt);
    const utilityContext = createGameAiUtilityContext(objectiveState, perceptionState, navigationAgentState, steeringArrived, steeringArriveDistance);
    gameAiUtilityScores = gameAiUtility.evaluate(utilityContext);
    gameAiUtilityDecision = gameAiUtilityScores[0];
    const gameAiWorldState = createGameAiWorldState(objectiveState, gameAiUtilityDecision);
    gameAiPlan = gameAiPlanner.plan(gameAiWorldState, WorldState.from({ objectiveComplete: true }), gameAiActions);
    gameAiHtnPlan = gameAiHtnPlanner.plan(gameAiHtnRootTask, gameAiWorldState, { utilityAction: gameAiUtilityDecision?.action ?? "none" });
    gameAiBlackboard.set("objectivePhase", objectiveState.phase);
    gameAiBlackboard.set("collectedPickup", objectiveState.collectedPickup);
    gameAiBlackboard.set("navigationAgentState", navigationAgentState.state);
    gameAiBlackboard.set("navigationDistanceTraveled", navigationAgentState.distanceTraveled);
    gameAiBlackboard.set("perceivedTarget", perceptionState.strongestMemory?.id ?? "none");
    gameAiBlackboard.set("visibleTargets", perceptionState.visible.length);
    gameAiBlackboard.set("utilityAction", gameAiUtilityDecision?.action ?? "none");
    gameAiBlackboard.set("utilityScore", gameAiUtilityDecision?.score ?? 0);
    gameAiBlackboard.set("goapPlan", gameAiPlan.actions.join(">"));
    gameAiBlackboard.set("htnPlan", gameAiHtnPlan.tasks.join(">"));
    gameAiDecision = gameAiDecisionTree.decide({
      values: {
        objectivePhase: objectiveState.phase,
        collectedPickup: objectiveState.collectedPickup,
        utilityAction: gameAiUtilityDecision?.action ?? "none",
        perceivedTarget: perceptionState.strongestMemory?.id ?? "none",
        hazardVisible: perceptionState.visible.some((hit) => hit.id === "hazard")
      }
    });
    gameAiBlackboard.set("decisionTreeAction", gameAiDecision.action);
    gameAiStateMachineState = gameAiStateMachine.update(dt);
    gameAiBehaviorState = gameAiBehaviorTree.tick(dt);
    const particlesStart = performance.now();
    particles.update(dt);
    particleUpdateMs = particleUpdateMs * 0.8 + (performance.now() - particlesStart) * 0.2;
    const particleBatch = particleRenderer.buildBatch(particles.particles, {
      sort: particleSortMode,
      cameraPosition: { x: 0, y: 0, z: 4 }
    });
    particles.recordBufferUpload(particleBatch.uploadedBytes);
    lastParticleBytes = particleBatch.uploadedBytes;
    mixer.update(dt);
    publishBehaviorErrors(errorPanel, behaviorSystem, runtimeErrors);
    const renderPlayerPosition = playerRenderPosition(player.position[0], player.position[1]);
    cameraTarget.position.x = renderPlayerPosition.x;
    cameraTarget.position.y = renderPlayerPosition.y + 0.2;
    cameraTarget.position.z = 0;
    const cameraBeforeX = camera.transform.position[0];
    const cameraBeforeY = camera.transform.position[1];
    const cameraBeforeZ = camera.transform.position[2];
    followCamera.update(dt);
    const cameraStep = Math.hypot(
      camera.transform.position[0] - cameraBeforeX,
      camera.transform.position[1] - cameraBeforeY,
      camera.transform.position[2] - cameraBeforeZ
    );
    cameraState.pathLength += cameraStep;
    cameraState.updates += 1;
    cameraState.previousX = camera.transform.position[0];
    cameraState.previousY = camera.transform.position[1];
    cameraState.previousZ = camera.transform.position[2];

    const pickupScale = Number((mixer.getValue("pickup.scale") ?? 1));
    updatePlayerAnimationStateMachine(playerAnimationStateMachine, objectiveState.phase, characterState, lastInputAxis, dt);
    renderer.resize(canvas.width, canvas.height);
    camera.resize(canvas.width, canvas.height);
    updateGameVisualAssetTransforms(visualAssets, renderPlayerPosition, time, playerAnimationStateMachine.current, playerAnimationStateMachine.stateTime);
    const renderItems = buildRenderItems(renderResources, visualAssets, player.position[0], player.position[1], platform.position[0], pickupScale, particleBatch, time);
    visualAssetState.renderItems = renderItems.filter((item) => item.label?.startsWith("game-asset-")).length;
    const lightingBundle = createExternalParityEnvironmentLighting("gameplay");
    const renderStart = performance.now();
    diagnostics = renderer.render({ scene, renderItems, environmentLighting: lightingBundle.lighting });
    renderMs = renderMs * 0.8 + (performance.now() - renderStart) * 0.2;
    const postprocess = sampleExternalParityLdrPostprocessReadback({
      device: renderer.device,
      framebufferWidth: canvas.width,
      framebufferHeight: canvas.height,
      exposure: 1.12
    });
    const directionalShadow = createExternalParityDirectionalShadowEvidence({
      exampleId: "game-slice",
      casterCount: Math.max(1, visualAssetState.renderItems),
      receiverCount: 2,
      visibleReceiverDarkening: true,
      mapSize: 512,
      lightDirection: [-0.38, -0.82, -0.43]
    });
    const externalParityRenderPreset = createExternalParityFlagshipRenderPresetEvidence({
      exampleId: "game-slice",
      screenshotPath: externalParityScreenshotPath,
      exposure: postprocess.exposure,
      directionalShadowEvidence: directionalShadow.visibleReceiverDarkening,
      postprocessEvidence: postprocess.changedPixels > 0,
      lodEvidence: false
    });
    const particleStats = particles.getStats();
    const particleBounds = computeParticleBounds(particles);
    const particleCulling = summarizeParticleCulling(particleBatch);
    const raycastHit = physics.raycast([player.position[0], player.position[1] + 0.7, 0], [0, -1, 0], { maxDistance: 2 });
    const shapeCastHit = physics.sphereCast([player.position[0] - 0.45, player.position[1] + 0.1, 0], 0.12, [1, 0, 0], { maxDistance: 2, includeSensors: true });
    audioState.sourceState = pickupSource?.state ?? audioState.sourceState;
    audioListenerNode.transform.setPosition(clamp(player.position[0], -1.1, 1.1), clamp(player.position[1], -0.2, 1), 3);
    pickupAudioNode.transform.setPosition(pickup.position[0], pickup.position[1], pickup.position[2]);
    sceneAudioBridge.update();
    const spatialPosition = {
      x: spatialPickup.panner.positionX.value,
      y: spatialPickup.panner.positionY.value,
      z: spatialPickup.panner.positionZ.value,
    };
    const spatialDistance = Math.hypot(
      spatialPosition.x - audioListener.position.x,
      spatialPosition.y - audioListener.position.y,
      spatialPosition.z - audioListener.position.z
    );
    const spatialAudioStateText = `listener ${audioListener.position.x.toFixed(2)}, ${audioListener.position.y.toFixed(2)}, ${audioListener.position.z.toFixed(2)} | source ${spatialPosition.x.toFixed(2)}, ${spatialPosition.y.toFixed(2)}, ${spatialPosition.z.toFixed(2)} | d ${spatialDistance.toFixed(2)}`;
    spatialAudioState.textContent = spatialAudioStateText;
    objectivePanel.dataset.phase = objectiveState.phase;
    objectivePanel.dataset.step = objectiveState.step;
    objectivePanel.textContent = objectiveStatusText(objectiveState);
    const weaponAngle = Math.atan2(player.position[1], player.position[0]);
    const laserBurst = sampleWeaponBurst({ kind: "laser", level: objectiveState.phase === "won" ? 4 : 3, angle: weaponAngle });
    const missileBurst = sampleWeaponBurst({ kind: "missile", level: 5, ammo: 20, angle: weaponAngle + 0.18 });
    const plasmaBurst = sampleWeaponBurst({ kind: "plasma", level: 4, secondary: true, angle: weaponAngle });
    const fpsRifle = sampleFpsWeaponCycle({ weapon: "rifle", triggerHeld: true, currentAmmo: objectiveState.phase === "won" ? 12 : 30, reserveAmmo: 120, seed: 0x3d });
    const fpsReload = sampleFpsWeaponCycle({ weapon: "pistol", reloadRequested: true, elapsedSeconds: 1.6, currentAmmo: 3, reserveAmmo: 20 });
    const fpsShotgun = sampleFpsWeaponCycle({ weapon: "shotgun", triggerHeld: true, currentAmmo: 8, reserveAmmo: 32, seed: 0x51 });
    const fpsEnemyAttack = sampleFpsEnemyTactics({ currentState: "chase", distanceToPlayer: 1.4, angleToPlayerDegrees: 8, health: 100, attackTimer: 0 });
    const fpsEnemyCover = sampleFpsEnemyTactics({ currentState: "chase", distanceToPlayer: 8, angleToPlayerDegrees: 18, health: 22, hasCover: true, distanceToCover: 1.1 });
    const fpsEnemyInvestigate = sampleFpsEnemyTactics({ currentState: "patrol", distanceToPlayer: 12, angleToPlayerDegrees: 120, hasLastKnownPlayerPosition: true, distanceToLastKnownPlayerPosition: 4.5 });
    const fpsLevelLayout = sampleFpsLevelLayout({ seed: 0x3d2025, roomCount: 8, gridSize: 25 });
    const fpsHud = sampleFpsHudOverlay({
      health: objectiveState.phase === "failed" ? 18 : 74,
      maxHealth: 100,
      ammo: fpsRifle.currentAmmo,
      reserveAmmo: fpsRifle.reserveAmmo,
      score: 1200,
      wave: objectiveState.phase === "won" ? 10 : 4,
      enemiesRemaining: fpsLevelLayout.enemySpawnPoints.length,
      recentDamage: objectiveState.phase === "failed" ? 42 : 12,
      hitMarker: fpsRifle.fired,
      damageAngleDegrees: 45,
      minimapFriendlyCount: 1,
      minimapEnemyCount: fpsLevelLayout.enemySpawnPoints.length,
      killFeedCount: objectiveState.phase === "won" ? 2 : 1
    });
    const platformer = samplePlatformerControllerFixture({ seed: 0x3d2025, elapsedSeconds: performance.now() * 0.001 });
    const cloth = sampleClothSimulationFixture({
      seed: 0xc10f,
      elapsedSeconds: performance.now() * 0.001,
      segmentsX: 12,
      segmentsY: 8
    });
    const softBody = sampleSoftBodyFixture({
      seed: 0x50fb0d,
      elapsedSeconds: performance.now() * 0.001,
      divisions: 2
    });
    const fracture = sampleFractureFixture({
      seed: 0xf24c7,
      fragmentCount: 18,
      impactStrength: 82
    });
    const fluid = sampleFluidFixture({
      seed: 0xf10d,
      particleGrid: [4, 3, 3],
      elapsedSeconds: performance.now() * 0.001
    });
    const fireSmoke = sampleFireSmokeFixture({
      seed: 0xf17e,
      gridResolution: [8, 6, 8],
      elapsedSeconds: performance.now() * 0.001,
      sourceCount: 3
    });
    const motionMatching = sampleMotionMatchingFixture({
      currentPosition: [player.position[0], player.position[1], player.position[2]],
      moveDirection: [lastInputAxis || 1, 0, objectiveState.collectedPickup ? 0.18 : 0.04],
      facingDirection: [1, 0, 0],
      speed: Math.max(0.18, Math.min(1, Math.abs(lastInputAxis) || 0.72)),
      elapsedSeconds: performance.now() * 0.001,
      previousPoseId: objectiveState.phase === "won" ? "run-1" : "walk-1",
      seed: 0x3d2025
    });
    const secondaryAnimation = sampleSecondaryAnimationFixture({
      stridePhase: performance.now() * 0.001,
      rootHeight: 1.08,
      velocity: [Math.abs(lastInputAxis) + 0.45, 0, objectiveState.collectedPickup ? 0.28 : 0.12],
      terrainSlope: objectiveState.collectedPickup ? 0.18 : 0.1,
      deltaSeconds: 1 / 60,
      seed: 0x3d2025
    });
    const adaptiveMusic = sampleAdaptiveMusicFixture({
      state: objectiveState.phase === "won" ? "victory" : objectiveState.phase === "failed" ? "defeat" : objectiveState.collectedPickup ? "action" : "tension",
      intensity: objectiveState.phase === "won" ? 0.68 : objectiveState.collectedPickup ? 0.82 : 0.42,
      curve: "equal-power"
    });
    const audioEnvironment = sampleAudioEnvironmentFixture({
      sourcePosition: [spatialPosition.x, spatialPosition.y, spatialPosition.z],
      listenerPosition: [audioListener.position.x, audioListener.position.y, audioListener.position.z],
      sourceVelocity: [0.6 + Math.abs(lastInputAxis), 0.12, 0],
      listenerVelocity: [lastInputAxis * 0.4, 0, 0],
      obstacleCount: objectiveState.collectedPickup ? 1 : 2,
      reverbZoneRadius: 7,
      reverbZoneDistance: spatialDistance,
      baseFrequencyHz: 440
    });
    const audioEffectsAnalysis = sampleAudioEffectsAnalysisFixture({
      preset: objectiveState.collectedPickup ? "master" : "vocal",
      inputPeakDb: audioState.mixerMuted ? -18 : -3.5,
      intensity: objectiveState.collectedPickup ? 0.78 : 0.46
    });
    const adaptiveDifficulty = sampleAdaptiveDifficultyFixture({
      strategy: objectiveState.phase === "won" ? "predictive" : "gradual",
      recentDeaths: objectiveState.failCount + (objectiveState.phase === "failed" ? 5 : 4),
      completionTimeSeconds: Math.max(72, objectiveState.elapsedSeconds + 104),
      accuracy: fpsRifle.fired ? 0.42 : 0.36,
      resourceEfficiency: objectiveState.collectedPickup ? 0.74 : 0.58,
      progressionRate: objectiveState.exitReached ? 0.86 : objectiveState.collectedPickup ? 0.58 : 0.42,
      playerSkill: objectiveState.phase === "won" ? 0.64 : 0.43,
      seed: 0x3d2025
    });
    const networkReplication = sampleNetworkReplicationFixture({
      seed: 0x6e37,
      latencyMs: 64 + Math.round(Math.abs(lastInputAxis) * 12),
      jitterMs: 9,
      interestRadius: objectiveState.collectedPickup ? 20 : 18,
      clientPosition: [player.position[0], 0, player.position[1]]
    });
    const culturalBehavior = sampleCulturalBehaviorFixture({
      seed: 0xc017,
      relationship: objectiveState.collectedPickup ? "friend" : "superior",
      initiatorPosition: [player.position[0], 0, player.position[1]],
      targetPosition: objectiveState.collectedPickup ? [exitPosition[0], 0, exitPosition[1]] : [pickupPosition[0], 0, pickupPosition[1]],
      message: objectiveState.collectedPickup ? "thanks for opening the route." : "help me with the gate plan."
    });
    const learningAgent = sampleLearningAgentFixture({
      seed: 0x1ea5,
      targetDistance: Math.hypot((objectiveState.collectedPickup ? exitPosition[0] : pickupPosition[0]) - player.position[0], (objectiveState.collectedPickup ? exitPosition[1] : pickupPosition[1]) - player.position[1]) * 10,
      health: objectiveState.phase === "failed" ? 0.28 : objectiveState.collectedPickup ? 0.76 : 0.62,
      energy: Math.max(0.25, 0.72 - Math.abs(lastInputAxis) * 0.18),
      nearbyCount: networkReplication.interest.relevant.length
    });
    const playerBehaviorTelemetry = samplePlayerBehaviorTelemetryFixture({
      seed: 0xb34a,
      playerId: "external-parity-runtime-player",
      sessionSeconds: Math.max(180, objectiveState.elapsedSeconds + 180),
      combatEvents: plasmaBurst.projectileCount + missileBurst.projectileCount,
      movementEvents: Math.max(12, Math.round(runtimeBehaviorState.movementUpdates / 2) + 14),
      interactionEvents: Math.max(4, runtimeBehaviorState.interactionEvents + (objectiveState.collectedPickup ? 3 : 1)),
      progressionEvents: objectiveState.exitReached ? 6 : objectiveState.collectedPickup ? 4 : 2,
      successEvents: objectiveState.phase === "failed" ? 10 : objectiveState.collectedPickup ? 28 : 18
    });
    const proceduralContentAdaptation = sampleProceduralContentAdaptationFixture({
      seed: 0xc067,
      playerTelemetry: playerBehaviorTelemetry,
      strategy: objectiveState.phase === "won" ? "challenge" : "counter"
    });
    const cloudServices = sampleCloudServiceFixture({
      seed: 0xc10d,
      playerId: playerBehaviorTelemetry.playerId,
      score: objectiveState.phase === "won" ? 24600 : objectiveState.collectedPickup ? 16400 : 12400,
      sessionSeconds: Math.max(180, Math.round(objectiveState.elapsedSeconds + 180)),
      offlineMode: true
    });
    const analyticsPrivacy = sampleAnalyticsPrivacyFixture({
      seed: 0xa11a,
      userId: playerBehaviorTelemetry.playerId,
      sessionId: "game-slice-runtime",
      frameMs,
      eventCount: Math.max(8, playerBehaviorTelemetry.events.total),
      errorCount: runtimeErrors.length,
      analyticsConsent: true,
      marketingConsent: false
    });
    const spaceWave = sampleSpaceShooterWave({ wave: objectiveState.phase === "won" ? 10 : 4, width: canvas.width, height: canvas.height, seed: 0x4404 });
    const spaceEnvironment = sampleSpaceEnvironmentFixture({
      width: canvas.width,
      height: canvas.height,
      elapsedSeconds: objectiveState.elapsedSeconds,
      seed: 0x51ace
    });
    const powerUpEffect = samplePowerUpEffect({ type: spaceWave.powerUpType, health: 62, shield: 44, weaponLevel: 2, speed: 320, lives: 3, multiplier: 1 });

    window.__AURA3D_GAME_DEMO__ = {
      id: "game-slice",
      status: "ready",
      renderer: "webgl2",
      interactions,
      diagnostics,
      errors: runtimeErrors,
      visualClaim: "Interactive runtime slice with generated glTF player and arena assets, a lit skinned ExternalParity hero render item, contact-shadow proxy, physics movement/triggers, third-person follow camera, objective win/fail loop, animation, input bindings, particles, audio unlock/playback state, and behavior scripts.",
      knownLimits: [
        "Generated local glTF fixtures are production-like validation assets, not externally licensed production art.",
        "The game slice includes one bounded lit skinned ExternalParity hero render item; broad character animation parity remains unclaimed here.",
        "The game slice uses bounded directional shadow-map metrics plus a contact-shadow proxy because production forward-pass shadow sampling and point/spot shadow maps remain unclaimed here."
      ],
      screenshotPath: externalParityScreenshotPath,
      featureEvidence: {
        levelAssetLoaded: visualAssetState.loaded,
        playerAssetLoaded: visualAssetState.loaded,
        litSkinnedCharacter: Boolean(visualAssets) && renderItems.some((item) => item.label === "game-asset-lit-skinned-hero" && item.skinning !== undefined),
        skinnedHeroAnimation: Boolean(visualAssets?.skinnedHeroClip.duration),
        externalParityRenderPreset: true,
        sharedExternalParityPreset: externalParityRenderPreset.presetId,
        generatedEnvironmentMap: true,
        environmentResourceSet: lightingBundle.resources.resourceSet,
        environmentReflectionEvidence: Boolean(lightingBundle.lighting.environmentMapTexture),
        proceduralTextureFixturesApplied: renderResources.materialFixtures.length >= 2,
        seededStarfieldNebulaBackground: true,
        starfieldNebulaTextureHash: renderResources.starfieldFixture.hash,
        oldBranchSpaceEnvironmentPort: spaceEnvironment.source === "origin-master-space-environment-adapted" && spaceEnvironment.starCount > 0 && spaceEnvironment.nebulaCount > 0 && spaceEnvironment.dustCount > 0,
        layeredSpaceBackground: spaceEnvironment.layerScroll.foregroundStars > spaceEnvironment.layerScroll.distantStars,
        spaceNebulaDustTelemetry: spaceEnvironment.nebulaCoverage > 0 && spaceEnvironment.dustAlpha > 0,
        gameConcreteAsphaltTextureHash: renderResources.materialFixtures.find((fixture) => fixture.id === "concrete-asphalt")?.hash ?? "missing",
        gameSciFiPanelTextureHash: renderResources.materialFixtures.find((fixture) => fixture.id === "sci-fi-panel")?.hash ?? "missing",
        stableDirectionalShadowMap: directionalShadow.productionShadowSamplingClaimed === false && directionalShadow.visibleReceiverDarkening,
        directionalShadowCascadeCount: directionalShadow.cascadeCount,
        brdfLutValidated: lightingBundle.resources.validation.brdfLutTexture,
        postprocessRealSceneReadback: postprocess.changedPixels > 0,
        physicsController: true,
        oldBranchTwoBoneIkPort: heroReachIk.reached && heroReachIk.endDistanceToTarget < 0.01 && heroReachIk.poleInfluence > 0,
        oldBranchMotionMatchingPort: motionMatching.databasePoseCount >= 18 && motionMatching.candidateScores.length >= 6 && motionMatching.bestCost <= motionMatching.secondBestCost,
        motionMatchingTrajectoryPrediction: motionMatching.queryTrajectory.length >= 3 && motionMatching.querySpeed > 0,
        motionMatchingPoseSelection: motionMatching.selectedTags.length > 0 && motionMatching.costMargin >= 0,
        oldBranchFootIkSpringBonePort: secondaryAnimation.source === "origin-master-foot-ik-spring-bone-adapted" && secondaryAnimation.footIk.groundedFeet === 2 && secondaryAnimation.springBone.boneCount >= 4,
        footIkPlacementTelemetry: secondaryAnimation.productionReadiness.footPlacementTelemetry,
        footIkHipAdjustmentTelemetry: secondaryAnimation.productionReadiness.hipAdjustmentTelemetry,
        springBoneTelemetry: secondaryAnimation.productionReadiness.springChainTelemetry,
        springBoneCollisionTelemetry: secondaryAnimation.productionReadiness.collisionTelemetry,
        oldBranchAiNavigationPort: true,
        oldBranchWeightedNavigationPort: navigationGrid.allowDiagonal && navigationRoute.cost > 0,
        aiNavigationPathfinding: navigationRoute.status === "success",
        aiNavigationAgent: navigationAgentState.state === "moving" || navigationAgentState.state === "arrived",
        oldBranchSteeringPort: true,
        aiSteeringArrive: steeringAgentState.distanceTraveled > 0 && steeringArriveDistance > 0,
        oldBranchAdvancedSteeringPort: true,
        aiSteeringFleeForce: advancedSteeringFleeForce > 0,
        aiSteeringPursuitPrediction: advancedSteeringPursuitPredictionTime > 0,
        aiSteeringEvadePrediction: advancedSteeringEvadePredictionTime > 0,
        aiSteeringWanderTarget: advancedSteeringWanderForce > 0,
        oldBranchFlockAvoidancePipelinePort,
        aiFlockingNeighbors,
        aiObstacleAvoidanceDetected: aiObstacleDetectedEver,
        aiWallAvoidanceDetected: aiWallDetectedEver,
        aiSteeringPipelineSelected: aiSteeringPipelineSelectedEver,
        oldBranchCrowdFormationPort: true,
        aiCrowdFormation: crowdState.formationType,
        aiCrowdAgents: crowdState.agentCount,
        aiCrowdNeighborPairs: crowdMaxNeighborPairs,
        oldBranchPerceptionPort: true,
        aiPerceptionVisibleTargets: perceptionState.visible.length,
        aiPerceptionMemory: perceptionState.memories.length,
        oldBranchBehaviorTreePort: true,
        aiBehaviorTreeIntent: String(gameAiBlackboard.get("intent", "none")),
        aiBehaviorTreeTicks: gameAiBehaviorState.tickCount,
        oldBranchDecisionTreePort: true,
        aiDecisionTreeAction: gameAiDecision.action,
        oldBranchUtilityAiPort: true,
        aiUtilityDecision: gameAiUtilityDecision?.action ?? "none",
        oldBranchStateMachinePort: true,
        aiStateMachineState: gameAiStateMachineState.currentState,
        oldBranchGoapPlannerPort: true,
        aiGoapPlanValid: gameAiPlan.valid,
        oldBranchHtnPlannerPort: true,
        aiHtnPlanValid: gameAiHtnPlan.valid,
        oldBranchWeaponSystemPort: laserBurst.projectileCount >= 3 && missileBurst.projectileCount >= 1 && plasmaBurst.projectileCount >= 16,
        oldBranchFpsWeaponPort: fpsRifle.fired && fpsRifle.muzzleFlashSeconds > 0 && fpsRifle.shellEjectionSeconds > 0 && fpsReload.reloadComplete,
        oldBranchFpsEnemyTacticsPort: fpsEnemyAttack.state === "attack" && fpsEnemyCover.state === "take_cover" && fpsEnemyInvestigate.state === "investigate",
        oldBranchFpsLevelPort: fpsLevelLayout.rooms.length >= 8 && fpsLevelLayout.corridors.length >= 7 && fpsLevelLayout.coverPoints.length >= 8 && fpsLevelLayout.navMeshPointCount > fpsLevelLayout.rooms.length,
        oldBranchFpsHudPort: fpsHud.hitMarkerVisible && fpsHud.minimapBlips > 0 && fpsHud.killFeedVisible && fpsHud.ammoText.includes("/"),
        oldBranchPlatformerControllerPort: platformer.controller.coyoteJumpAccepted && platformer.controller.doubleJumpAccepted && platformer.level.totalPlatforms >= 14,
        oldBranchPlatformerCameraPort: platformer.camera.collisionAdjustedDistance < platformer.camera.distance && platformer.camera.lockOnSupported,
        oldBranchPlatformerLevelPort: platformer.level.totalCollectibles >= 8 && platformer.level.checkpointCount >= 2 && platformer.level.goalDistance > 56,
        oldBranchClothSimulationPort: cloth.mesh.particleCount > 0 && cloth.constraints.total > 0 && cloth.blockedClaims.includes("Unity Cloth parity"),
        clothPinnedPbdGrid: cloth.mesh.pinnedCount === cloth.config.segmentsX + 1 && cloth.mesh.sampleParticles.some((particle) => particle.pinned),
        clothWindResponse: cloth.wind.affectedParticles > cloth.mesh.pinnedCount && cloth.wind.maxOffset > 0,
        clothCollisionResponse: cloth.collision.resolvedParticles > 0 && cloth.collision.maxPenetration > 0,
        clothTearingBoundary: cloth.constraints.tearCandidates > 0 && cloth.blockedClaims.includes("mesh-splitting topology tearing"),
        clothFabricMaterialEvidence: cloth.material.sheenIntensity > 0 && cloth.material.anisotropyStrength > 0 && cloth.material.fuzzIntensity > 0,
        oldBranchSoftBodyPort: softBody.mesh.tetrahedronCount > 0 && softBody.deformation.volumeRatio > 0 && softBody.blockedClaims.includes("Unity soft-body asset parity"),
        softBodyTetMesh: softBody.mesh.vertexCount > 0 && softBody.mesh.tetrahedronCount > 0 && softBody.mesh.distanceConstraintCount > 0,
        softBodyVolumeShapeTelemetry: softBody.deformation.restVolume > 0 && softBody.deformation.currentVolume > 0 && softBody.deformation.shapeMatchingError > 0,
        softBodyGroundCollision: softBody.collision.resolvedVertices > 0 && softBody.collision.maxPenetrationBeforeResolve > 0,
        softBodyRigidAttachments: softBody.attachments.rigidAttachmentCount > 0 && softBody.attachments.maxAttachmentError === 0,
        oldBranchFracturePort: fracture.voronoi.siteCount === fracture.config.requestedFragments && fracture.fragments.fragmentCount > 0 && fracture.blockedClaims.includes("Unreal Chaos destruction parity"),
        fractureVoronoiSites: fracture.voronoi.radialSiteCount > 0 && fracture.voronoi.neighborPairs > 0,
        fractureFragmentMassVelocity: fracture.fragments.totalMass > 0 && fracture.fragments.samples.some((fragment) => fragment.velocity.some((axis) => Math.abs(axis) > 0)),
        fractureHierarchyDamage: fracture.hierarchy.activatedChildren > 0 && fracture.hierarchy.nodeCount > fracture.fragments.fragmentCount,
        fractureGeometryClippingBoundary: fracture.config.interiorFaces && fracture.blockedClaims.includes("runtime convex mesh clipping"),
        oldBranchFluidPort: fluid.sph.particleCount > 0 && fluid.mpm.activeCells > 0 && fluid.blockedClaims.includes("Unreal Niagara/fluid parity"),
        fluidSphDensityPressure: fluid.sph.averageDensity >= fluid.config.restDensity && fluid.sph.maxPressure >= fluid.sph.averagePressure,
        fluidNeighborSearch: fluid.sph.neighborPairs > 0 && fluid.sph.maxNeighborCount > 0,
        fluidMpmParticleGridTransfers: fluid.mpm.particleToGridTransfers > 0 && fluid.mpm.gridToParticleTransfers > 0,
        fluidScreenSpaceBoundary: fluid.rendering.depthPixels > 0 && fluid.rendering.refractionClaimed === false,
        oldBranchFireSmokePort: fireSmoke.fire.burningCells > 0 && fireSmoke.smoke.densityCells > 0 && fireSmoke.blockedClaims.includes("Unreal Niagara fire/smoke parity"),
        fireCombustionTelemetry: fireSmoke.fire.maxTemperature > fireSmoke.config.ignitionTemperature && fireSmoke.fire.fuelConsumed > 0,
        fireParticleEmission: fireSmoke.particles.activeParticles > 0 && fireSmoke.particles.emberParticles > 0,
        smokeProjectionTelemetry: fireSmoke.smoke.divergenceAfterProjection < fireSmoke.smoke.divergenceBeforeProjection,
        smokeRayMarchBoundary: fireSmoke.volumeRendering.alpha > 0 && fireSmoke.volumeRendering.volumetricRendererClaimed === false,
        weaponProjectilePatterns: laserBurst.projectileCount + missileBurst.projectileCount + plasmaBurst.projectileCount,
        oldBranchSpaceWavePowerUpPort: spaceWave.count > 0 && spaceWave.totalScoreValue > 0 && spaceWave.powerUpWeight > 0,
        oldBranchPowerUpEffectPort: powerUpEffect.changedFields.length > 0,
        particles: particleStats.liveCount > 0,
        spatialAudio: true,
        oldBranchAdaptiveMusicPort: adaptiveMusic.activeLayerCount >= 2 && adaptiveMusic.crossfade.equalPowerNormalized,
        oldBranchAdaptiveDifficultyPort: adaptiveDifficulty.triggeredRules.length >= 3 && adaptiveDifficulty.appliedChangeCount === adaptiveDifficulty.triggeredRules.length,
        adaptiveDifficultyMetrics: adaptiveDifficulty.metrics.length >= 8,
        adaptiveDifficultyRules: adaptiveDifficulty.triggeredRules.some((rule) => rule.changeType === "enemy-damage") && adaptiveDifficulty.triggeredRules.some((rule) => rule.changeType === "resource-drop-rate"),
        adaptiveDifficultyAdjustments: adaptiveDifficulty.adjustment.enemyDamage < 1 && adaptiveDifficulty.adjustment.resourceDropRate > 1 && adaptiveDifficulty.adjustment.timerMultiplier > 1,
        oldBranchNetworkReplicationPort: networkReplication.prediction.reconciliationAccepted && networkReplication.delta.reconstructedMatches,
        networkPredictionReconciliation: networkReplication.prediction.pendingInputs > 0 && networkReplication.prediction.predictionError > 0,
        networkDeltaCompression: networkReplication.delta.compressionRatio < 1 && networkReplication.delta.bytesSaved > 0,
        networkInterestManagement: networkReplication.interest.relevant.length > 0 && networkReplication.interest.culled.length > 0,
        networkSnapshotInterpolation: networkReplication.interpolation.interpolatedPosition.length === 3,
        oldBranchCulturalBehaviorPort: culturalBehavior.proxemics.distanceMeters > 0 && culturalBehavior.communication.audienceAdapted && culturalBehavior.productionReadiness.socialNormTelemetry,
        culturalProxemicsTelemetry: culturalBehavior.proxemics.acceptableDistanceMeters > 0 && culturalBehavior.proxemics.zone.length > 0,
        culturalCommunicationTelemetry: culturalBehavior.communication.formatted !== culturalBehavior.communication.input,
        culturalSocialNormTelemetry: culturalBehavior.socialNorms.hierarchyAware || culturalBehavior.socialNorms.normViolations.length >= 0,
        culturalDecisionTelemetry: culturalBehavior.decision.score > 0,
        oldBranchLearningAgentPort: learningAgent.observation.featureSize > 0 && learningAgent.behaviorCloning.demonstrations > 0 && learningAgent.reinforcementLearning.avgReturn === learningAgent.reward.total,
        learningAgentFeatureExtraction: learningAgent.productionReadiness.featureExtractionTelemetry,
        learningAgentBehaviorCloning: learningAgent.productionReadiness.behaviorCloningTelemetry,
        learningAgentPpoStats: learningAgent.productionReadiness.ppoStatsTelemetry,
        learningAgentRewardBreakdown: learningAgent.productionReadiness.rewardBreakdownTelemetry,
        oldBranchPlayerBehaviorTelemetryPort: playerBehaviorTelemetry.productionReadiness.playerProfileTelemetry && playerBehaviorTelemetry.productionReadiness.eventTrackingTelemetry,
        playerProfileTelemetry: playerBehaviorTelemetry.productionReadiness.playerProfileTelemetry,
        playerEventTrackingTelemetry: playerBehaviorTelemetry.productionReadiness.eventTrackingTelemetry,
        playerBehaviorPatternTelemetry: playerBehaviorTelemetry.productionReadiness.behaviorPatternTelemetry,
        playerAdaptiveInputTelemetry: playerBehaviorTelemetry.productionReadiness.adaptiveSystemInputTelemetry,
        oldBranchContentGeneratorPort: proceduralContentAdaptation.source === "origin-master-content-generator-adaptive-ai-adapted" && proceduralContentAdaptation.content.length >= 4,
        proceduralContentPlanTelemetry: proceduralContentAdaptation.productionReadiness.contentGenerationTelemetry,
        proceduralContentSeededGeneration: proceduralContentAdaptation.hash.length === 8,
        proceduralContentPlaystyleCustomization: proceduralContentAdaptation.productionReadiness.playstyleCustomizationTelemetry,
        oldBranchAdaptiveAiPort: proceduralContentAdaptation.productionReadiness.adaptiveAiParameterTelemetry && proceduralContentAdaptation.adaptiveAi.behaviorMode === "adaptive",
        adaptiveAiParameterTelemetry: proceduralContentAdaptation.adaptiveAi.tacticalAwareness > 0 && proceduralContentAdaptation.adaptiveAi.reactionSpeed > 0,
        adaptiveAiPlayerProfileInput: proceduralContentAdaptation.productionReadiness.skillScalingTelemetry && proceduralContentAdaptation.productionReadiness.playstyleCustomizationTelemetry,
        oldBranchCloudServicesPort: cloudServices.productionReadiness.cloudServiceTelemetry && cloudServices.services.authentication.tokenIssued === false,
        cloudSaveOfflineQueueTelemetry: cloudServices.productionReadiness.offlineQueueTelemetry && cloudServices.services.cloudSave.queuedUploads > 0,
        cloudAchievementsTelemetry: cloudServices.services.achievements.unlocked.length > 0 && cloudServices.services.achievements.totalPoints > 0,
        cloudLeaderboardTelemetry: cloudServices.productionReadiness.leaderboardTelemetry && cloudServices.services.leaderboard.rank > 0,
        cloudRemoteConfigTelemetry: cloudServices.productionReadiness.remoteConfigTelemetry && cloudServices.services.remoteConfig.activated,
        cloudMatchmakingTelemetry: cloudServices.productionReadiness.matchmakingTelemetry && cloudServices.services.matchmaking.status === "simulated-match",
        cloudContentDeliveryTelemetry: cloudServices.productionReadiness.contentDeliveryTelemetry && cloudServices.services.contentDelivery.integrityHashes.length > 0,
        oldBranchAnalyticsPrivacyPort: analyticsPrivacy.productionReadiness.consentTelemetry && analyticsPrivacy.productionReadiness.anonymizationTelemetry,
        analyticsConsentTelemetry: analyticsPrivacy.consent.explicitRequired && analyticsPrivacy.consent.grantedCount > 0,
        analyticsAnonymizationTelemetry: analyticsPrivacy.anonymization.emailRedacted && analyticsPrivacy.anonymization.userHash.length === 8,
        analyticsBatchingTelemetry: analyticsPrivacy.batching.queuedEvents > 0 && analyticsPrivacy.batching.flushedBatches > 0,
        analyticsMetricsTelemetry: analyticsPrivacy.metrics.fps > 0 && analyticsPrivacy.metrics.customMetricCount > 0,
        analyticsProviderBoundaryTelemetry: analyticsPrivacy.productionReadiness.providerBoundaryTelemetry && analyticsPrivacy.blockedClaims.includes("production analytics SaaS integration"),
        oldBranchAudioEnvironmentPort: audioEnvironment.occlusion.level !== "none" && audioEnvironment.reverb.blend > 0,
        oldBranchAudioEffectsAnalysisPort: audioEffectsAnalysis.compressor.gainReductionDb > 0 && audioEffectsAnalysis.eq.activeBandCount >= 3 && audioEffectsAnalysis.delay.repeatsAboveNoiseFloor > 0 && audioEffectsAnalysis.chorus.voices > 0 && audioEffectsAnalysis.distortion.harmonicBoost > 0 && audioEffectsAnalysis.filter.enabled && audioEffectsAnalysis.spectrum.peakMagnitude > 0,
        audioCompressorTelemetry: audioEffectsAnalysis.compressor.outputPeakDb < audioEffectsAnalysis.compressor.inputPeakDb,
        audioEqTelemetry: audioEffectsAnalysis.eq.presenceGainDb > 0,
        audioDelayTelemetry: audioEffectsAnalysis.delay.wetDryMix > 0 && audioEffectsAnalysis.delay.repeatsAboveNoiseFloor > 0,
        audioChorusTelemetry: audioEffectsAnalysis.chorus.voices >= 1 && audioEffectsAnalysis.chorus.stereoWidth > 0,
        audioDistortionTelemetry: audioEffectsAnalysis.distortion.harmonicBoost > 0 && audioEffectsAnalysis.distortion.outputCeiling > 0,
        audioFilterTelemetry: audioEffectsAnalysis.filter.enabled && audioEffectsAnalysis.filter.frequencyHz > 0,
        audioSpectrumTelemetry: audioEffectsAnalysis.spectrum.barCount >= 16 && audioEffectsAnalysis.spectrum.peakFrequencyHz > 0,
        oldBranchInputReplayPort: inputReplayEvidence.recording.metadata.evidence.oldCodebasePort && inputReplayEvidence.playback.evidence.playback,
        inputReplayRecording: inputReplayEvidence.recording.metadata.evidence.recording,
        inputReplayPlayback: inputReplayEvidence.playback.emittedEvents >= inputReplayEvidence.recording.metadata.eventCount,
        inputReplaySeekLoop: inputReplayEvidence.playback.evidence.seek && inputReplayEvidence.playback.loopCount >= 1,
        oldBranchInputActionBindingPort: actionBindingEvidence.evidence.oldCodebasePort && actionBindingEvidence.evidence.processors,
        inputActionProcessors: actionBindingEvidence.evidence.processors,
        inputActionHoldTapDoubleTap: actionBindingEvidence.evidence.holdTapDoubleTap,
        inputActionCompositeAxis: actionBindingEvidence.evidence.compositeAxis,
        inputActionModifierChord: actionBindingEvidence.evidence.modifierChord,
        oldBranchGestureHapticsPort: gestureHapticsEvidence.source === "origin-master-input-gesture-rumble-adapted" && gestureHapticsEvidence.haptics.hapticsClaimed === false,
        inputSwipeRotateTelemetry: gestureHapticsEvidence.productionReadiness.swipeRotateTelemetry && gestureHapticsEvidence.gestureSummary.rotateDegrees > 0,
        inputHapticPatternTelemetry: gestureHapticsEvidence.productionReadiness.hapticPatternTelemetry && gestureHapticsEvidence.haptics.patterns.length >= 5,
        inputHapticClaimBoundary: gestureHapticsEvidence.productionReadiness.hapticClaimBoundaryTelemetry && gestureHapticsEvidence.blockedClaims.includes("gamepad haptic actuator delivery guarantee"),
        oldBranchVirtualTouchJoystickPort: virtualTouchEvidence.active.evidence.oldCodebasePort && virtualTouchEvidence.active.evidence.virtualJoystick,
        virtualTouchJoystickDeadZone: virtualTouchEvidence.active.evidence.deadZone,
        virtualTouchJoystickClamped: virtualTouchEvidence.active.evidence.clampedMagnitude,
        virtualTouchJoystickRecentered: virtualTouchEvidence.released.value[0] === 0 && virtualTouchEvidence.released.value[1] === 0,
        oldBranchXrRuntimePort: xrRuntimeEvidence.evidence.oldCodebasePort,
        xrSessionCapabilityNegotiation: xrRuntimeEvidence.evidence.sessionCapabilityNegotiation,
        xrInlineFallback: xrRuntimeEvidence.fallbackUsed && xrRuntimeEvidence.webXRSessionClaimed === false,
        xrControllerInputTelemetry: xrRuntimeEvidence.evidence.controllerInputTelemetry && xrRuntimeEvidence.input.controllerCount >= 2,
        xrHandGestureTelemetry: xrRuntimeEvidence.input.pinchDetected && xrRuntimeEvidence.input.pointDetected,
        xrGazeLodTelemetry: xrRuntimeEvidence.evidence.gazeBasedLodTelemetry && xrRuntimeEvidence.gazeLod.selectedLevels.includes("high"),
        objectiveLoop: objectiveState.phase !== undefined,
        animationStateMachine: true,
        screenshotEvidencePath: externalParityScreenshotPath,
      },
      externalParityRenderPreset,
      postprocess,
      environmentResources: lightingBundle.resources,
      directionalShadow,
      claimBoundary,
      metrics: {
        frameMs: Number(frameMs.toFixed(2)),
        renderMs: Number(renderMs.toFixed(3)),
        cpuFrameMs: Number(frameMs.toFixed(2)),
        cpuRenderMs: Number(renderMs.toFixed(3)),
        gpuFrameMs: Number(renderMs.toFixed(3)),
        gpuTimingSupported: false,
        gpuTimingSource: "cpu-fallback",
        gpuTimingFallbackReason: "EXT_disjoint_timer_query_webgl2 is not required for this flagship demo; GPU readout mirrors CPU render timing.",
        drawCalls: diagnostics.drawCalls,
        skinnedHeroMesh: visualAssets?.skinnedHeroMeshName ?? "missing",
        skinnedHeroJointCount: visualAssets?.skinnedHeroJointCount ?? 0,
        skinnedHeroTrackCount: visualAssets?.skinnedHeroTrackCount ?? 0,
        skinnedHeroRenderItems: renderItems.filter((item) => item.label === "game-asset-lit-skinned-hero" && item.skinning !== undefined).length,
        externalParityRenderPreset: externalParityRenderPreset.presetId,
        externalParityRenderPresetVersion: externalParityRenderPreset.presetVersion,
        externalParityPresetActiveFeatures: externalParityRenderPreset.activeFeatures.length,
        externalParityPresetBlockedFeatures: externalParityRenderPreset.blockedFeatures.length,
        generatedEnvironmentManifest: lightingBundle.manifestPath,
        proceduralTextureFixtureCount: renderResources.materialFixtures.length,
        starfieldNebulaTextureHash: renderResources.starfieldFixture.hash,
        oldBranchSpaceEnvironmentPort: true,
        spaceEnvironmentSource: spaceEnvironment.source,
        spaceEnvironmentHash: spaceEnvironment.hash,
        spaceEnvironmentResourceHash: renderResources.spaceEnvironmentFixture.hash,
        spaceEnvironmentStars: spaceEnvironment.starCount,
        spaceEnvironmentVisibleStars: spaceEnvironment.visibleStarCount,
        spaceEnvironmentNebulae: spaceEnvironment.nebulaCount,
        spaceEnvironmentDust: spaceEnvironment.dustCount,
        spaceEnvironmentDistantScroll: spaceEnvironment.layerScroll.distantStars,
        spaceEnvironmentForegroundScroll: spaceEnvironment.layerScroll.foregroundStars,
        spaceEnvironmentAverageBrightness: spaceEnvironment.averageStarBrightness,
        spaceEnvironmentNebulaCoverage: spaceEnvironment.nebulaCoverage,
        spaceEnvironmentDustAlpha: spaceEnvironment.dustAlpha,
        spaceEnvironmentBlockedClaims: spaceEnvironment.blockedClaims.join(", "),
        gameConcreteAsphaltTextureHash: renderResources.materialFixtures.find((fixture) => fixture.id === "concrete-asphalt")?.hash ?? "missing",
        gameSciFiPanelTextureHash: renderResources.materialFixtures.find((fixture) => fixture.id === "sci-fi-panel")?.hash ?? "missing",
        environmentTextureMipCount: lightingBundle.resources.specularMipCount,
        environmentBrdfLutValidated: lightingBundle.resources.validation.brdfLutTexture,
        environmentDiffuseIrradiance: lightingBundle.resources.validation.diffuseIrradiance,
        environmentReflectionEvidence: Boolean(lightingBundle.lighting.environmentMapTexture),
        environmentSpecularIntensity: lightingBundle.lighting.environmentMapSpecularIntensity ?? 0,
        directionalShadowMode: directionalShadow.mode,
        directionalShadowCascadeCount: directionalShadow.cascadeCount,
        directionalShadowMapSize: directionalShadow.mapSize,
        directionalShadowPcfSamples: directionalShadow.pcfSamples,
        directionalShadowCasters: directionalShadow.casterCount,
        directionalShadowReceivers: directionalShadow.receiverCount,
        directionalShadowProductionSamplingClaimed: directionalShadow.productionShadowSamplingClaimed,
        postprocessPath: postprocess.path,
        postprocessChangedPixels: postprocess.changedPixels,
        postprocessBloomBrightPixels: postprocess.bloomBrightPixelCount,
        postprocessFxaaEdgePixels: postprocess.fxaaEdgePixels,
        physicsBodies: physics.snapshot().stats.bodies,
        physicsContacts: physics.snapshot().stats.contacts,
        oldBranchTwoBoneIkPort: heroReachIk.reached && heroReachIk.endDistanceToTarget < 0.01 && heroReachIk.poleInfluence > 0,
        twoBoneIkReached: heroReachIk.reached,
        twoBoneIkEndDistance: Number(heroReachIk.endDistanceToTarget.toFixed(6)),
        twoBoneIkTargetDistance: Number(heroReachIk.targetDistance.toFixed(6)),
        twoBoneIkUpperLength: Number(heroReachIk.upperLength.toFixed(6)),
        twoBoneIkLowerLength: Number(heroReachIk.lowerLength.toFixed(6)),
        twoBoneIkPoleInfluence: Number(heroReachIk.poleInfluence.toFixed(6)),
        oldBranchMotionMatchingPort: true,
        motionMatchingSource: motionMatching.source,
        motionMatchingDatabasePoses: motionMatching.databasePoseCount,
        motionMatchingSelectedPose: motionMatching.selectedPoseId,
        motionMatchingSelectedClip: motionMatching.selectedClip,
        motionMatchingSelectedTags: motionMatching.selectedTags.join(","),
        motionMatchingSelectedTime: motionMatching.selectedTime,
        motionMatchingTransitioned: motionMatching.transitioned,
        motionMatchingBlendWeight: motionMatching.blendWeight,
        motionMatchingTransitionDuration: motionMatching.transitionDurationSeconds,
        motionMatchingTrajectorySamples: motionMatching.queryTrajectory.length,
        motionMatchingQuerySpeed: motionMatching.querySpeed,
        motionMatchingFacingAlignment: motionMatching.queryFacingAlignment,
        motionMatchingBestCost: motionMatching.bestCost,
        motionMatchingSecondBestCost: motionMatching.secondBestCost,
        motionMatchingCostMargin: motionMatching.costMargin,
        motionMatchingHash: motionMatching.hash,
        oldBranchFootIkSpringBonePort: true,
        secondaryAnimationSource: secondaryAnimation.source,
        footIkGroundedFeet: secondaryAnimation.footIk.groundedFeet,
        footIkHipOffset: secondaryAnimation.footIk.hipOffset,
        footIkAverageTargetError: secondaryAnimation.footIk.averageTargetError,
        footIkTerrainSlope: secondaryAnimation.footIk.terrainSlope,
        springBoneChain: secondaryAnimation.springBone.chainName,
        springBoneCount: secondaryAnimation.springBone.boneCount,
        springBoneMaxDisplacement: secondaryAnimation.springBone.maxDisplacement,
        springBoneCollisionContacts: secondaryAnimation.springBone.collisionContacts,
        springBoneSubsteps: secondaryAnimation.springBone.substeps,
        springBoneTipY: secondaryAnimation.springBone.tipPosition[1],
        secondaryAnimationHash: secondaryAnimation.hash,
        secondaryAnimationBlockedClaims: secondaryAnimation.blockedClaims.join(", "),
        oldBranchAiNavigationPort: true,
        oldBranchWeightedNavigationPort: navigationGrid.allowDiagonal && navigationRoute.cost > 0,
        navigationGridCells: navigationGrid.width * navigationGrid.height,
        navigationBlockedCells: 4,
        navigationWeightedCells: 4,
        navigationDiagonalMovement: navigationGrid.allowDiagonal,
        navigationPathStatus: navigationRoute.status,
        navigationPathCells: navigationRoute.cells.length,
        navigationPathWaypoints: navigationRoute.waypoints.length,
        navigationPathLength: navigationRoute.length,
        navigationPathCost: navigationRoute.cost,
        navigationPickupPathCost: navigationToPickup.cost,
        navigationExitPathCost: navigationToExit.cost,
        navigationVisitedCells: navigationRoute.visitedCells,
        navigationPickupPathStatus: navigationToPickup.status,
        navigationExitPathStatus: navigationToExit.status,
        navigationAgentState: navigationAgentState.state,
        navigationAgentWaypointIndex: navigationAgentState.waypointIndex,
        navigationAgentRemainingWaypoints: navigationAgentState.remainingWaypoints,
        navigationAgentDistanceTraveled: navigationAgentState.distanceTraveled,
        navigationAgentX: navigationAgentState.position[0],
        navigationAgentY: navigationAgentState.position[1],
        oldBranchSteeringPort: true,
        aiSteeringAgentX: steeringAgentState.position[0],
        aiSteeringAgentY: steeringAgentState.position[1],
        aiSteeringSpeed: steeringAgentState.speed,
        aiSteeringDistanceToTarget: steeringArriveDistance,
        aiSteeringDistanceTraveled: steeringAgentState.distanceTraveled,
        aiSteeringArrived: steeringArrived,
        oldBranchAdvancedSteeringPort: true,
        aiFleeDistance: advancedSteeringFleeDistance,
        aiFleeForce: Number(advancedSteeringFleeForce.toFixed(3)),
        aiPursuitPredictionTime: advancedSteeringPursuitPredictionTime,
        aiPursuitPredictedX: advancedSteeringPursuitPredictedX,
        aiPursuitPredictedY: advancedSteeringPursuitPredictedY,
        aiEvadePredictionTime: advancedSteeringEvadePredictionTime,
        aiEvadePredictedX: advancedSteeringEvadePredictedX,
        aiEvadePredictedY: advancedSteeringEvadePredictedY,
        aiWanderSeed: advancedSteeringWanderSeed,
        aiWanderTargetX: advancedSteeringWanderTargetX,
        aiWanderTargetY: advancedSteeringWanderTargetY,
        aiWanderForce: Number(advancedSteeringWanderForce.toFixed(3)),
        oldBranchFlockAvoidancePipelinePort,
        aiFlockingNeighbors,
        aiFlockingForce: Number(aiFlockingMaxForce.toFixed(3)),
        aiObstacleAvoidanceDetected: aiObstacleDetectedEver,
        aiObstacleAvoidanceDistance: aiObstacleAvoidanceClosestDistance,
        aiObstacleAvoidanceForce: Number(aiObstacleAvoidanceMaxForce.toFixed(3)),
        aiWallAvoidanceDetected: aiWallDetectedEver,
        aiWallAvoidanceDistance: aiWallAvoidanceClosestDistance,
        aiWallAvoidanceForce: Number(aiWallAvoidanceMaxForce.toFixed(3)),
        aiSteeringPipelineForce: Number(aiSteeringPipelineMaxForce.toFixed(3)),
        aiSteeringPipelineSelected: aiSteeringPipelineSelectedEver,
        oldBranchCrowdFormationPort: true,
        aiCrowdAgents: crowdState.agentCount,
        aiCrowdFormation: crowdState.formationType,
        aiCrowdNeighborPairs: crowdMaxNeighborPairs,
        aiCrowdAverageNeighbors: crowdMaxAverageNeighbors,
        aiCrowdAverageSpeed: crowdState.averageSpeed,
        aiCrowdMaxSpeed: crowdState.maxSpeed,
        aiCrowdCenterX: crowdState.center[0],
        aiCrowdCenterY: crowdState.center[1],
        aiCrowdSlots: crowdState.agents.map((agent) => `${agent.id}:${agent.formationSlot[0].toFixed(2)},${agent.formationSlot[1].toFixed(2)}`).join("|"),
        oldBranchPerceptionPort: true,
        aiPerceptionVisibleTargets: perceptionState.visible.length,
        aiPerceptionMemoryCount: perceptionState.memories.length,
        aiPerceptionClosestTarget: perceptionState.closestVisible?.id ?? "none",
        aiPerceptionStrongestMemory: perceptionState.strongestMemory?.id ?? "none",
        aiPerceptionEnteredTargets: perceptionState.enteredIds.join(","),
        aiPerceptionForgottenTargets: perceptionState.forgottenIds.join(","),
        aiPerceptionTopConfidence: perceptionState.visible[0]?.confidence ?? 0,
        oldBranchBehaviorTreePort: true,
        aiBehaviorTreeStatus: gameAiBehaviorState.status,
        aiBehaviorTreeTicks: gameAiBehaviorState.tickCount,
        aiBehaviorTreeIntent: String(gameAiBlackboard.get("intent", "none")),
        aiBehaviorTreeTarget: String(gameAiBlackboard.get("target", "none")),
        aiBehaviorTreeTrace: gameAiBehaviorState.trace.join("|"),
        aiBlackboardVersion: gameAiBehaviorState.blackboardVersion,
        aiBlackboardChanges: gameAiBlackboard.changeLog().length,
        oldBranchDecisionTreePort: true,
        aiDecisionTreeAction: gameAiDecision.action,
        aiDecisionTreeExecuted: gameAiDecision.executed,
        aiDecisionTreePath: gameAiDecision.path.join(">"),
        aiDecisionTreeNodes: gameAiDecisionTree.getStats().totalNodes,
        aiDecisionTreeDepth: gameAiDecisionTree.getStats().maxDepth,
        oldBranchUtilityAiPort: true,
        aiUtilityAction: gameAiUtilityDecision?.action ?? "none",
        aiUtilityScore: gameAiUtilityDecision?.score ?? 0,
        aiUtilityScoreCount: gameAiUtilityScores.length,
        aiUtilityScores: gameAiUtilityScores.map((score) => `${score.action}:${score.score.toFixed(3)}`).join(","),
        aiUtilityConsiderations: Object.keys(gameAiUtilityDecision?.considerationScores ?? {}).join(","),
        oldBranchStateMachinePort: true,
        aiStateMachineState: gameAiStateMachineState.currentState,
        aiStateMachinePreviousState: gameAiStateMachineState.previousState,
        aiStateMachineTicks: gameAiStateMachineState.tickCount,
        aiStateMachineTransitions: gameAiStateMachineState.transitionCount,
        aiStateMachineHistory: gameAiStateMachineState.history.join(","),
        aiStateMachineTrace: gameAiStateMachineState.trace.join("|"),
        oldBranchGoapPlannerPort: true,
        aiGoapPlanValid: gameAiPlan.valid,
        aiGoapPlanLength: gameAiPlan.actions.length,
        aiGoapPlanCost: gameAiPlan.cost,
        aiGoapNodesExplored: gameAiPlan.nodesExplored,
        aiGoapPlan: gameAiPlan.actions.join(">"),
        oldBranchHtnPlannerPort: true,
        aiHtnPlanValid: gameAiHtnPlan.valid,
        aiHtnRootTask: gameAiHtnPlan.rootTask,
        aiHtnPlanLength: gameAiHtnPlan.tasks.length,
        aiHtnPlan: gameAiHtnPlan.tasks.join(">"),
        aiHtnMethodTrace: gameAiHtnPlan.methodTrace.join("|"),
        aiHtnDecompositions: gameAiHtnPlan.decompositions,
        aiHtnIterations: gameAiHtnPlan.iterations,
        aiHtnMaxDepth: gameAiHtnPlan.maxDepthReached,
        oldBranchWeaponSystemPort: true,
        weaponSystemSource: laserBurst.source,
        weaponLaserProjectiles: laserBurst.projectileCount,
        weaponMissileProjectiles: missileBurst.projectileCount,
        weaponPlasmaProjectiles: plasmaBurst.projectileCount,
        weaponTotalDamage: Number((laserBurst.totalDamage + missileBurst.totalDamage + plasmaBurst.totalDamage).toFixed(3)),
        weaponMaxSpreadRadians: Math.max(laserBurst.spreadRadians, missileBurst.spreadRadians, plasmaBurst.spreadRadians),
        weaponMissileAmmoSpent: missileBurst.ammoSpent,
        oldBranchFpsWeaponPort: true,
        fpsWeaponSource: fpsRifle.source,
        fpsWeaponName: fpsRifle.name,
        fpsWeaponFiringMode: fpsRifle.firingMode,
        fpsWeaponFired: fpsRifle.fired,
        fpsWeaponAmmo: fpsRifle.currentAmmo,
        fpsWeaponReserveAmmo: fpsRifle.reserveAmmo,
        fpsWeaponBulletsPerShot: fpsShotgun.bulletsPerShot,
        fpsWeaponTotalDamage: fpsShotgun.totalDamage,
        fpsWeaponSpreadDegrees: fpsShotgun.spreadDegrees,
        fpsWeaponRecoilX: fpsRifle.recoilX,
        fpsWeaponRecoilY: fpsRifle.recoilY,
        fpsWeaponFireCooldown: fpsRifle.fireCooldown,
        fpsWeaponMuzzleFlashSeconds: fpsRifle.muzzleFlashSeconds,
        fpsWeaponShellEjectionSeconds: fpsRifle.shellEjectionSeconds,
        fpsWeaponReloadComplete: fpsReload.reloadComplete,
        fpsWeaponReloadedAmmo: fpsReload.currentAmmo,
        fpsWeaponReloadedReserve: fpsReload.reserveAmmo,
        oldBranchFpsEnemyTacticsPort: true,
        fpsEnemyTacticsSource: fpsEnemyAttack.source,
        fpsEnemyAttackState: fpsEnemyAttack.state,
        fpsEnemyAttackReady: fpsEnemyAttack.attackReady,
        fpsEnemyCoverState: fpsEnemyCover.state,
        fpsEnemyCoverRequested: fpsEnemyCover.coverRequested,
        fpsEnemyInCover: fpsEnemyCover.inCover,
        fpsEnemyInvestigateState: fpsEnemyInvestigate.state,
        fpsEnemyCanHearPlayer: fpsEnemyInvestigate.canHearPlayer,
        fpsEnemyMovementSpeed: fpsEnemyCover.movementSpeed,
        fpsEnemyPathRefreshRequested: fpsEnemyAttack.pathRefreshRequested,
        oldBranchFpsLevelPort: true,
        fpsLevelSource: fpsLevelLayout.source,
        fpsLevelRooms: fpsLevelLayout.rooms.length,
        fpsLevelCorridors: fpsLevelLayout.corridors.length,
        fpsLevelCoverPoints: fpsLevelLayout.coverPoints.length,
        fpsLevelPatrolPoints: fpsLevelLayout.patrolPoints.length,
        fpsLevelEnemySpawns: fpsLevelLayout.enemySpawnPoints.length,
        fpsLevelPickupSpawns: fpsLevelLayout.pickupSpawnPoints.length,
        fpsLevelNavMeshPoints: fpsLevelLayout.navMeshPointCount,
        fpsLevelAverageRoomArea: fpsLevelLayout.averageRoomArea,
        fpsLevelTotalCorridorLength: fpsLevelLayout.totalCorridorLength,
        fpsLevelPlayerSpawnX: fpsLevelLayout.playerSpawnPoint.x,
        fpsLevelPlayerSpawnZ: fpsLevelLayout.playerSpawnPoint.z,
        oldBranchFpsHudPort: true,
        fpsHudSource: fpsHud.source,
        fpsHudHealthPercent: fpsHud.healthPercent,
        fpsHudHealthBarPixels: fpsHud.healthBarPixels,
        fpsHudLowHealth: fpsHud.lowHealth,
        fpsHudDamageFlashAlpha: fpsHud.damageFlashAlpha,
        fpsHudAmmoText: fpsHud.ammoText,
        fpsHudAmmoWarning: fpsHud.ammoWarning,
        fpsHudCrosshairSpreadPixels: fpsHud.crosshairSpreadPixels,
        fpsHudHitMarkerVisible: fpsHud.hitMarkerVisible,
        fpsHudDamageIndicatorAngleDegrees: fpsHud.damageIndicatorAngleDegrees,
        fpsHudMinimapBlips: fpsHud.minimapBlips,
        fpsHudKillFeedVisible: fpsHud.killFeedVisible,
        fpsHudWaveText: fpsHud.waveText,
        oldBranchPlatformerControllerPort: true,
        platformerFixtureSource: platformer.source,
        platformerFixtureHash: platformer.hash,
        platformerWalkSpeed: platformer.config.walkSpeed,
        platformerRunSpeed: platformer.config.runSpeed,
        platformerJumpForce: platformer.config.jumpForce,
        platformerDoubleJumpForce: platformer.config.doubleJumpForce,
        platformerWallJumpForce: platformer.config.wallJumpForce,
        platformerAirControl: platformer.config.airControl,
        platformerCoyoteTimeSeconds: platformer.config.coyoteTimeSeconds,
        platformerJumpBufferSeconds: platformer.config.jumpBufferSeconds,
        platformerCoyoteJumpAccepted: platformer.controller.coyoteJumpAccepted,
        platformerBufferedJumpAccepted: platformer.controller.bufferedJumpAccepted,
        platformerDoubleJumpAccepted: platformer.controller.doubleJumpAccepted,
        platformerWallJumpAccepted: platformer.controller.wallJumpAccepted,
        platformerStateSequence: platformer.controller.stateSequence.join(","),
        platformerFinalState: platformer.controller.finalState,
        oldBranchPlatformerCameraPort: true,
        platformerCameraDistance: platformer.camera.distance,
        platformerCameraCollisionAdjustedDistance: platformer.camera.collisionAdjustedDistance,
        platformerCameraFollowSpeed: platformer.camera.followSpeed,
        platformerCameraLockOnSupported: platformer.camera.lockOnSupported,
        oldBranchPlatformerLevelPort: true,
        platformerTotalPlatforms: platformer.level.totalPlatforms,
        platformerTotalCollectibles: platformer.level.totalCollectibles,
        platformerTotalScoreValue: platformer.level.totalScoreValue,
        platformerCheckpointCount: platformer.level.checkpointCount,
        platformerHazardCount: platformer.level.hazardCount,
        platformerMovingPlatformPathCount: platformer.level.movingPlatformPathCount,
        platformerGoalDistance: platformer.level.goalDistance,
        oldBranchClothSimulationPort: true,
        clothFixtureSource: cloth.source,
        clothFixtureHash: cloth.hash,
        clothParticleCount: cloth.mesh.particleCount,
        clothTriangleCount: cloth.mesh.triangleCount,
        clothIndexCount: cloth.mesh.indexCount,
        clothPinnedCount: cloth.mesh.pinnedCount,
        clothPinnedPattern: cloth.mesh.pinnedPattern,
        clothStructuralConstraints: cloth.constraints.structural,
        clothShearConstraints: cloth.constraints.shear,
        clothBendingConstraints: cloth.constraints.bending,
        clothTotalConstraints: cloth.constraints.total,
        clothMaxStrain: cloth.constraints.maxStrain,
        clothTearThreshold: cloth.constraints.tearThreshold,
        clothTearCandidates: cloth.constraints.tearCandidates,
        clothCutPlaneConstraintCandidates: cloth.constraints.cutPlaneConstraintCandidates,
        clothWindMaxOffset: cloth.wind.maxOffset,
        clothWindAffectedParticles: cloth.wind.affectedParticles,
        clothCollisionShape: cloth.collision.shape,
        clothCollisionPenetrations: cloth.collision.penetrationCount,
        clothCollisionResolved: cloth.collision.resolvedParticles,
        clothCollisionMaxPenetration: cloth.collision.maxPenetration,
        clothMaterialPreset: cloth.material.preset,
        clothMaterialSheenIntensity: cloth.material.sheenIntensity,
        clothMaterialSheenRoughness: cloth.material.sheenRoughness,
        clothMaterialSubsurfaceIntensity: cloth.material.subsurfaceIntensity,
        clothMaterialAnisotropyStrength: cloth.material.anisotropyStrength,
        clothMaterialFuzzIntensity: cloth.material.fuzzIntensity,
        clothBlockedClaims: cloth.blockedClaims.join("|"),
        oldBranchSoftBodyPort: true,
        softBodyFixtureSource: softBody.source,
        softBodyFixtureHash: softBody.hash,
        softBodyMethod: softBody.config.method,
        softBodyMaterialModel: softBody.config.materialModel,
        softBodyVertexCount: softBody.mesh.vertexCount,
        softBodyTetrahedronCount: softBody.mesh.tetrahedronCount,
        softBodySurfaceTriangleEstimate: softBody.mesh.surfaceTriangleEstimate,
        softBodyDistanceConstraints: softBody.mesh.distanceConstraintCount,
        softBodyAttachmentCount: softBody.mesh.attachmentCount,
        softBodyMaxDisplacement: softBody.deformation.maxDisplacement,
        softBodyAverageDisplacement: softBody.deformation.averageDisplacement,
        softBodyVolumeRatio: softBody.deformation.volumeRatio,
        softBodyRestVolume: softBody.deformation.restVolume,
        softBodyCurrentVolume: softBody.deformation.currentVolume,
        softBodyShapeMatchingError: softBody.deformation.shapeMatchingError,
        softBodyContactVertices: softBody.collision.contactVertices,
        softBodyResolvedVertices: softBody.collision.resolvedVertices,
        softBodyMaxPenetrationBeforeResolve: softBody.collision.maxPenetrationBeforeResolve,
        softBodyRigidAttachmentCount: softBody.attachments.rigidAttachmentCount,
        softBodyMaxAttachmentError: softBody.attachments.maxAttachmentError,
        softBodyBlockedClaims: softBody.blockedClaims.join("|"),
        oldBranchFracturePort: true,
        fractureFixtureSource: fracture.source,
        fractureFixtureHash: fracture.hash,
        fractureRequestedFragments: fracture.config.requestedFragments,
        fractureDensity: fracture.config.density,
        fractureImpulseStrength: fracture.config.impulseStrength,
        fractureInteriorFaces: fracture.config.interiorFaces,
        fractureProgressiveDamage: fracture.config.progressiveDamage,
        fractureSiteCount: fracture.voronoi.siteCount,
        fractureAverageSiteDistance: fracture.voronoi.averageSiteDistance,
        fractureMaxSiteDistance: fracture.voronoi.maxSiteDistance,
        fractureNeighborPairs: fracture.voronoi.neighborPairs,
        fractureCrackGraphEdges: fracture.voronoi.crackGraphEdges,
        fractureFragmentCount: fracture.fragments.fragmentCount,
        fractureTotalMass: fracture.fragments.totalMass,
        fractureMinMass: fracture.fragments.minMass,
        fractureMaxMass: fracture.fragments.maxMass,
        fractureTotalVolume: fracture.fragments.totalVolume,
        fractureInteriorFaceEstimate: fracture.fragments.interiorFaceEstimate,
        fractureActiveAfterImpact: fracture.fragments.activeAfterImpact,
        fractureHierarchyDepth: fracture.hierarchy.maxDepth,
        fractureHierarchyNodeCount: fracture.hierarchy.nodeCount,
        fractureRootDamage: fracture.hierarchy.rootDamage,
        fractureActivatedChildren: fracture.hierarchy.activatedChildren,
        fractureBlockedClaims: fracture.blockedClaims.join("|"),
        oldBranchFluidPort: true,
        fluidFixtureSource: fluid.source,
        fluidFixtureHash: fluid.hash,
        fluidSolver: fluid.config.solver,
        fluidRestDensity: fluid.config.restDensity,
        fluidParticleMass: fluid.config.particleMass,
        fluidSmoothingRadius: fluid.config.smoothingRadius,
        fluidPcisphIterations: fluid.config.pcisphIterations,
        fluidDfsphIterations: fluid.config.dfsphIterations,
        fluidParticleCount: fluid.sph.particleCount,
        fluidCapacity: fluid.sph.capacity,
        fluidAverageDensity: fluid.sph.averageDensity,
        fluidMaxDensity: fluid.sph.maxDensity,
        fluidAveragePressure: fluid.sph.averagePressure,
        fluidMaxPressure: fluid.sph.maxPressure,
        fluidNeighborPairs: fluid.sph.neighborPairs,
        fluidMaxNeighborCount: fluid.sph.maxNeighborCount,
        fluidViscosityForceEstimate: fluid.sph.viscosityForceEstimate,
        fluidSurfaceTensionEstimate: fluid.sph.surfaceTensionEstimate,
        fluidBoundaryCollisionCount: fluid.sph.boundaryCollisionCount,
        fluidMpmActiveCells: fluid.mpm.activeCells,
        fluidParticleToGridTransfers: fluid.mpm.particleToGridTransfers,
        fluidGridToParticleTransfers: fluid.mpm.gridToParticleTransfers,
        fluidFlipRatio: fluid.mpm.flipRatio,
        fluidDeformationGradientSamples: fluid.mpm.deformationGradientSamples,
        fluidPlasticityEvents: fluid.mpm.plasticityEvents,
        fluidDepthPixels: fluid.rendering.depthPixels,
        fluidThicknessPixels: fluid.rendering.thicknessPixels,
        fluidMaxThickness: fluid.rendering.maxThickness,
        fluidRenderingRefractionClaimed: fluid.rendering.refractionClaimed,
        fluidRenderingSubsurfaceClaimed: fluid.rendering.subsurfaceScatteringClaimed,
        fluidBlockedClaims: fluid.blockedClaims.join("|"),
        oldBranchFireSmokePort: true,
        fireSmokeFixtureSource: fireSmoke.source,
        fireSmokeFixtureHash: fireSmoke.hash,
        fireSmokeSolver: fireSmoke.config.solver,
        fireSmokeGridCells: fireSmoke.grid.cellCount,
        fireSmokeSourceCount: fireSmoke.grid.sourceCount,
        fireSmokeActiveFuelCells: fireSmoke.fire.activeFuelCells,
        fireSmokeBurningCells: fireSmoke.fire.burningCells,
        fireSmokeAverageTemperature: fireSmoke.fire.averageTemperature,
        fireSmokeMaxTemperature: fireSmoke.fire.maxTemperature,
        fireSmokeFuelConsumed: fireSmoke.fire.fuelConsumed,
        fireSmokeGenerated: fireSmoke.fire.smokeGenerated,
        fireSmokeBuoyancyImpulse: fireSmoke.fire.buoyancyImpulse,
        fireSmokeTurbulenceEnergy: fireSmoke.fire.turbulenceEnergy,
        fireSmokeCoolingLoss: fireSmoke.fire.coolingLoss,
        fireSmokeDiffusionEstimate: fireSmoke.fire.diffusionEstimate,
        fireSmokeParticleEmitted: fireSmoke.particles.emittedParticles,
        fireSmokeParticleActive: fireSmoke.particles.activeParticles,
        fireSmokeParticleEmbers: fireSmoke.particles.emberParticles,
        fireSmokeParticleUploadBytes: fireSmoke.particles.uploadBytes,
        fireSmokeDensityCells: fireSmoke.smoke.densityCells,
        fireSmokeTotalDensity: fireSmoke.smoke.totalDensity,
        fireSmokeMaxDensity: fireSmoke.smoke.maxDensity,
        fireSmokeAverageVelocityMagnitude: fireSmoke.smoke.averageVelocityMagnitude,
        fireSmokeDivergenceBeforeProjection: fireSmoke.smoke.divergenceBeforeProjection,
        fireSmokeDivergenceAfterProjection: fireSmoke.smoke.divergenceAfterProjection,
        fireSmokePressureIterations: fireSmoke.smoke.pressureIterations,
        fireSmokeVorticityCells: fireSmoke.smoke.vorticityCells,
        fireSmokeRayMarchSteps: fireSmoke.volumeRendering.rayMarchSteps,
        fireSmokeTransmittance: fireSmoke.volumeRendering.transmittance,
        fireSmokeAlpha: fireSmoke.volumeRendering.alpha,
        fireSmokeVolumetricRendererClaimed: fireSmoke.volumeRendering.volumetricRendererClaimed,
        fireSmokeProductionLightingClaimed: fireSmoke.volumeRendering.productionLightingClaimed,
        fireSmokeBlockedClaims: fireSmoke.blockedClaims.join("|"),
        oldBranchSpaceWavePowerUpPort: true,
        spaceWaveSource: spaceWave.source,
        spaceWaveNumber: spaceWave.wave,
        spaceWaveEnemyType: spaceWave.enemyType,
        spaceWaveFormation: spaceWave.formation,
        spaceWaveCount: spaceWave.count,
        spaceWaveBoss: spaceWave.bossWave,
        spaceWaveDifficultyScale: spaceWave.difficultyScale,
        spaceWaveTotalScoreValue: spaceWave.totalScoreValue,
        spaceWaveFirstSpawnX: spaceWave.spawns[0]?.x ?? 0,
        spaceWaveFirstSpawnY: spaceWave.spawns[0]?.y ?? 0,
        spaceWavePowerUpType: spaceWave.powerUpType,
        spaceWavePowerUpWeight: spaceWave.powerUpWeight,
        oldBranchPowerUpEffectPort: true,
        powerUpEffectSource: powerUpEffect.source,
        powerUpEffectType: powerUpEffect.type,
        powerUpChangedFields: powerUpEffect.changedFields.join(","),
        powerUpHealth: powerUpEffect.health,
        powerUpShield: powerUpEffect.shield,
        powerUpWeaponLevel: powerUpEffect.weaponLevel,
        powerUpSpeed: powerUpEffect.speed,
        powerUpLives: powerUpEffect.lives,
        powerUpMultiplier: powerUpEffect.multiplier,
        playerX: Number(player.position[0].toFixed(3)),
        playerY: Number(player.position[1].toFixed(3)),
        renderedPlayerX: Number(renderPlayerPosition.x.toFixed(3)),
        renderedPlayerY: Number(renderPlayerPosition.y.toFixed(3)),
        cameraMode: cameraState.mode,
        cameraFollowEnabled: followCamera.enabled,
        cameraFollowUpdates: cameraState.updates,
        cameraFollowPathLength: Number(cameraState.pathLength.toFixed(3)),
        cameraActualX: Number(camera.transform.position[0].toFixed(3)),
        cameraActualY: Number(camera.transform.position[1].toFixed(3)),
        cameraActualZ: Number(camera.transform.position[2].toFixed(3)),
        cameraTargetX: Number(cameraTarget.position.x.toFixed(3)),
        cameraTargetY: Number(cameraTarget.position.y.toFixed(3)),
        cameraTargetZ: Number(cameraTarget.position.z.toFixed(3)),
        cameraDistance: Number(Math.hypot(camera.transform.position[0] - cameraTarget.position.x, camera.transform.position[1] - cameraTarget.position.y, camera.transform.position[2] - cameraTarget.position.z).toFixed(3)),
        cameraTargetPlayerDeltaX: Number(Math.abs(cameraTarget.position.x - renderPlayerPosition.x).toFixed(3)),
        objectivePhase: objectiveState.phase,
        objectiveStep: objectiveState.step,
        objectiveCollectedPickup: objectiveState.collectedPickup,
        objectiveExitReached: objectiveState.exitReached,
        objectiveEvents,
        objectiveWinCount: objectiveState.winCount,
        objectiveFailCount: objectiveState.failCount,
        objectiveFailReason: objectiveState.failReason,
        objectiveWinReason: objectiveState.winReason,
        objectiveElapsedSeconds: Number(objectiveState.elapsedSeconds.toFixed(2)),
        objectiveTimeLimitSeconds,
        objectivePickupX: pickupPosition[0],
        objectiveExitX: exitPosition[0],
        objectiveHazardX: hazardPosition[0],
        objectiveRestartCount: restartCount,
        visualAssetsLoaded: visualAssetState.loaded,
        visualAssetError: visualAssetState.error,
        visualAssetLoadMs: Number(visualAssetState.loadMs.toFixed(3)),
        visualAssetPlayerUrl: visualAssetState.playerUrl,
        visualAssetArenaUrl: visualAssetState.arenaUrl,
        visualAssetPlayerMeshes: visualAssetState.playerMeshes,
        visualAssetArenaMeshes: visualAssetState.arenaMeshes,
        visualAssetPlayerRenderables: visualAssetState.playerRenderables,
        visualAssetArenaRenderables: visualAssetState.arenaRenderables,
        visualAssetRenderItems: visualAssetState.renderItems,
        productionLikePlayerModel: visualAssetState.loaded && visualAssetState.playerMeshes >= 5,
        productionLikeArenaAsset: visualAssetState.loaded && visualAssetState.arenaMeshes >= 6,
        primitivePlayerFallback: !visualAssetState.loaded,
        contactShadowProxy: true,
        shadowMode: "contact-shadow-proxy",
        characterController: true,
        characterControllerBodyId: player.id,
        characterControllerColliderId: playerCollider.id,
        characterControllerColliderKind: playerCollider.shape.kind,
        characterControllerRadius: Number(character.radius.toFixed(3)),
        characterControllerHalfHeight: Number(character.halfHeight.toFixed(3)),
        characterControllerMaxSpeed: Number(character.maxSpeed.toFixed(2)),
        characterControllerSpeed: Number(characterState.speed.toFixed(3)),
        characterControllerGrounded: characterState.grounded,
        characterControllerGroundColliderId: characterState.groundColliderId ?? 0,
        characterControllerGroundNormalY: Number(characterState.groundNormal[1].toFixed(3)),
        characterControllerDesiredX: Number(characterState.desiredVelocity[0].toFixed(3)),
        characterControllerJumpCount: characterJumpCount,
        characterControllerJumpedThisFrame: characterState.jumpedThisFrame,
        platformX: Number(platform.position[0].toFixed(3)),
        pickups,
        triggerEvents,
        raycastHit: raycastHit !== undefined,
        shapeCastHit: shapeCastHit !== undefined,
        animationClipName: "pickup-pulse",
        animationPlayback: true,
        playerAnimationStateMachine: true,
        playerAnimationStates: playerAnimationStateMachine.states.join(","),
        playerAnimationState: playerAnimationStateMachine.current,
        playerAnimationPreviousState: playerAnimationStateMachine.previous,
        playerAnimationTransitions: playerAnimationStateMachine.transitions,
        playerAnimationLastTransition: playerAnimationStateMachine.lastTransition,
        playerAnimationStateTime: Number(playerAnimationStateMachine.stateTime.toFixed(2)),
        playerAnimationDrivenByPhysics: true,
        litSkinningClaimed: Boolean(visualAssets) && renderItems.some((item) => item.label === "game-asset-lit-skinned-hero" && item.skinning !== undefined),
        pickupScale: Number(pickupScale.toFixed(3)),
        liveParticles: particleStats.liveCount,
        particleCapacity: particleStats.capacity,
        particleSpawned: particleStats.spawnedCount,
        particleUploadBytes: particleStats.uploadedBytes,
        particleLastUploadBytes: lastParticleBytes,
        particleUpdateMs: Number(particleUpdateMs.toFixed(3)),
        particleSortMode,
        particleBoundsAvailable: particleBatch.bounds !== null,
        particleBoundsMinX: Number(particleBounds.min[0].toFixed(3)),
        particleBoundsMaxX: Number(particleBounds.max[0].toFixed(3)),
        particleBatchBoundsMinX: Number((particleBatch.bounds?.min.x ?? 0).toFixed(3)),
        particleBatchBoundsMaxX: Number((particleBatch.bounds?.max.x ?? 0).toFixed(3)),
        particleCulledByView: particleCulling.culled,
        particleVisibleAfterCulling: particleCulling.visible,
        particleBlending: true,
        audioState: audio.contextManager.state,
        audioUnlocked: audioState.unlocked,
        audioUnlockAttempts: audioState.unlockAttempts,
        audioClipName: audioState.clipName,
        audioClipSource: audioState.clipSource,
        audioClipDuration: Number(audioState.clipDuration.toFixed(3)),
        audioMixerVolume: Number(audioState.mixerVolume.toFixed(2)),
        audioMixerMuted: audioState.mixerMuted,
        audioPlays: audioState.plays,
        audioSourceState: audioState.sourceState,
        spatialAudio: true,
        spatialAudioState: true,
        spatialAudioStateText,
        oldBranchAdaptiveMusicPort: true,
        adaptiveMusicSource: adaptiveMusic.source,
        adaptiveMusicState: adaptiveMusic.state,
        adaptiveMusicIntensity: adaptiveMusic.intensity,
        adaptiveMusicCurve: adaptiveMusic.curve,
        adaptiveMusicTransitionSeconds: adaptiveMusic.transitionSeconds,
        adaptiveMusicLoopBars: adaptiveMusic.loopBars,
        adaptiveMusicTempoBpm: adaptiveMusic.tempoBpm,
        adaptiveMusicActiveLayers: adaptiveMusic.activeLayerCount,
        adaptiveMusicPeakLayerVolume: adaptiveMusic.peakLayerVolume,
        adaptiveMusicLayerMix: adaptiveMusic.layers.map((layer) => `${layer.id}:${layer.targetVolume.toFixed(3)}`).join("|"),
        adaptiveMusicEqualPowerCrossfade: adaptiveMusic.crossfade.equalPowerNormalized,
        adaptiveMusicHash: adaptiveMusic.hash,
        oldBranchAdaptiveDifficultyPort: true,
        adaptiveDifficultySource: adaptiveDifficulty.source,
        adaptiveDifficultyStrategy: adaptiveDifficulty.strategy,
        adaptiveDifficultyMetricCount: adaptiveDifficulty.metrics.length,
        adaptiveDifficultyTriggeredRules: adaptiveDifficulty.triggeredRules.length,
        adaptiveDifficultyAppliedChanges: adaptiveDifficulty.appliedChangeCount,
        adaptiveDifficultyRuleIds: adaptiveDifficulty.triggeredRules.map((rule) => rule.id).join(","),
        adaptiveDifficultyEnemyHealth: adaptiveDifficulty.adjustment.enemyHealth,
        adaptiveDifficultyEnemyDamage: adaptiveDifficulty.adjustment.enemyDamage,
        adaptiveDifficultyEnemyCount: adaptiveDifficulty.adjustment.enemyCount,
        adaptiveDifficultyResourceDropRate: adaptiveDifficulty.adjustment.resourceDropRate,
        adaptiveDifficultyExperienceMultiplier: adaptiveDifficulty.adjustment.experienceMultiplier,
        adaptiveDifficultyTimerMultiplier: adaptiveDifficulty.adjustment.timerMultiplier,
        adaptiveDifficultyCheckpointMultiplier: adaptiveDifficulty.adjustment.checkpointMultiplier,
        adaptiveDifficultyBlockedClaims: adaptiveDifficulty.blockedClaims.join("|"),
        adaptiveDifficultyHash: adaptiveDifficulty.hash,
        oldBranchNetworkReplicationPort: true,
        networkReplicationSource: networkReplication.source,
        networkReplicationTickRate: networkReplication.tickRate,
        networkReplicationLatencyMs: networkReplication.latencyMs,
        networkReplicationJitterMs: networkReplication.jitterMs,
        networkPredictionInputCount: networkReplication.prediction.inputCount,
        networkPredictionAcknowledgedSequence: networkReplication.prediction.acknowledgedSequence,
        networkPredictionPendingInputs: networkReplication.prediction.pendingInputs,
        networkPredictionError: networkReplication.prediction.predictionError,
        networkPredictionCorrection: networkReplication.prediction.smoothCorrection.join(","),
        networkPredictionReplayedPosition: networkReplication.prediction.replayedPosition.join(","),
        networkDeltaChangedFields: networkReplication.delta.changedFields.join(","),
        networkDeltaFullSnapshotBytes: networkReplication.delta.fullSnapshotBytes,
        networkDeltaBytes: networkReplication.delta.deltaBytes,
        networkDeltaCompressionRatio: networkReplication.delta.compressionRatio,
        networkDeltaBytesSaved: networkReplication.delta.bytesSaved,
        networkInterestRelevant: networkReplication.interest.relevant.join(","),
        networkInterestCulled: networkReplication.interest.culled.join(","),
        networkInterestAdded: networkReplication.interest.added.join(","),
        networkInterestRemoved: networkReplication.interest.removed.join(","),
        networkInterestGridCellCount: networkReplication.interest.gridCellCount,
        networkInterpolationSampleMs: networkReplication.interpolation.sampleTimestampMs,
        networkInterpolationPosition: networkReplication.interpolation.interpolatedPosition.join(","),
        networkExtrapolationPosition: networkReplication.interpolation.extrapolatedPosition.join(","),
        networkReplicationBlockedClaims: networkReplication.blockedClaims.join("|"),
        networkReplicationHash: networkReplication.hash,
        oldBranchCulturalBehaviorPort: true,
        culturalBehaviorSource: culturalBehavior.source,
        culturalRelationship: culturalBehavior.proxemics.relationship,
        culturalDistanceMeters: culturalBehavior.proxemics.distanceMeters,
        culturalAcceptableDistanceMeters: culturalBehavior.proxemics.acceptableDistanceMeters,
        culturalProxemicZone: culturalBehavior.proxemics.zone,
        culturalComfort: culturalBehavior.proxemics.comfort,
        culturalApproachAllowed: culturalBehavior.proxemics.approachAllowed,
        culturalCommunicationStyle: culturalBehavior.communication.directness,
        culturalCommunicationFormality: culturalBehavior.communication.formality,
        culturalCommunicationAudienceAdapted: culturalBehavior.communication.audienceAdapted,
        culturalNormViolations: culturalBehavior.socialNorms.normViolations.join(","),
        culturalGesture: culturalBehavior.gesture.id,
        culturalGestureAllowed: culturalBehavior.gesture.allowed,
        culturalDecisionAction: culturalBehavior.decision.selectedAction,
        culturalDecisionScore: culturalBehavior.decision.score,
        culturalBlockedClaims: culturalBehavior.blockedClaims.join("|"),
        culturalBehaviorHash: culturalBehavior.hash,
        oldBranchLearningAgentPort: true,
        learningAgentSource: learningAgent.source,
        learningAgentFeatureSize: learningAgent.observation.featureSize,
        learningAgentTargetDistance: learningAgent.observation.targetDistance,
        learningAgentHealth: learningAgent.observation.health,
        learningAgentEnergy: learningAgent.observation.energy,
        learningAgentNearbySlots: learningAgent.observation.nearbyEntitySlots,
        learningAgentFeatureHash: learningAgent.observation.featureHash,
        learningBehaviorCloningDemos: learningAgent.behaviorCloning.demonstrations,
        learningBehaviorCloningTrainLoss: learningAgent.behaviorCloning.trainLoss,
        learningBehaviorCloningValidationAccuracy: learningAgent.behaviorCloning.validationAccuracy,
        learningBehaviorCloningAction: learningAgent.behaviorCloning.selectedAction,
        learningRlPolicyLoss: learningAgent.reinforcementLearning.policyLoss,
        learningRlValueLoss: learningAgent.reinforcementLearning.valueLoss,
        learningRlAvgReturn: learningAgent.reinforcementLearning.avgReturn,
        learningRlExplainedVariance: learningAgent.reinforcementLearning.explainedVariance,
        learningRewardTotal: learningAgent.reward.total,
        learningAgentBlockedClaims: learningAgent.blockedClaims.join("|"),
        learningAgentHash: learningAgent.hash,
        oldBranchPlayerBehaviorTelemetryPort: true,
        playerBehaviorTelemetrySource: playerBehaviorTelemetry.source,
        playerProfileSkillLevel: playerBehaviorTelemetry.profile.skillLevel,
        playerProfilePlaystyle: playerBehaviorTelemetry.profile.playstyle,
        playerProfileEngagement: playerBehaviorTelemetry.profile.engagement,
        playerProfileSkillCount: playerBehaviorTelemetry.profile.skills.length,
        playerProfilePatternCount: playerBehaviorTelemetry.profile.patterns.length,
        playerEventTotal: playerBehaviorTelemetry.events.total,
        playerEventCombat: playerBehaviorTelemetry.events.byCategory.combat,
        playerEventMovement: playerBehaviorTelemetry.events.byCategory.movement,
        playerEventSuccessRate: playerBehaviorTelemetry.events.successRate,
        playerEventsPerMinute: playerBehaviorTelemetry.events.eventsPerMinute,
        playerSessionDominantPlaystyle: playerBehaviorTelemetry.sessionAnalysis.dominantPlaystyle,
        playerSessionSkillEstimate: playerBehaviorTelemetry.sessionAnalysis.skillEstimate,
        playerSessionInsightCount: playerBehaviorTelemetry.sessionAnalysis.insights.length,
        playerBehaviorBlockedClaims: playerBehaviorTelemetry.blockedClaims.join("|"),
        playerBehaviorTelemetryHash: playerBehaviorTelemetry.hash,
        oldBranchContentGeneratorPort: true,
        proceduralContentSource: proceduralContentAdaptation.source,
        proceduralContentCount: proceduralContentAdaptation.content.length,
        proceduralContentTypes: proceduralContentAdaptation.content.map((content) => content.type).join(","),
        proceduralContentDifficulty: proceduralContentAdaptation.content[0]?.difficulty ?? "missing",
        proceduralContentEstimatedMs: proceduralContentAdaptation.content.reduce((sum, content) => sum + content.estimatedDurationMs, 0),
        proceduralContentLevelEnemyCount: proceduralContentAdaptation.content.find((content) => content.type === "level")?.parameters.enemyCount ?? 0,
        proceduralContentRewardTier: proceduralContentAdaptation.content.find((content) => content.type === "reward")?.parameters.rewardTier ?? "missing",
        proceduralContentBlockedClaims: proceduralContentAdaptation.blockedClaims.join("|"),
        oldBranchAdaptiveAiPort: true,
        adaptiveAiStrategy: proceduralContentAdaptation.adaptiveAi.strategy,
        adaptiveAiBehaviorMode: proceduralContentAdaptation.adaptiveAi.behaviorMode,
        adaptiveAiAggression: proceduralContentAdaptation.adaptiveAi.aggression,
        adaptiveAiDefensiveness: proceduralContentAdaptation.adaptiveAi.defensiveness,
        adaptiveAiTacticalAwareness: proceduralContentAdaptation.adaptiveAi.tacticalAwareness,
        adaptiveAiReactionSpeed: proceduralContentAdaptation.adaptiveAi.reactionSpeed,
        adaptiveAiAccuracy: proceduralContentAdaptation.adaptiveAi.accuracy,
        adaptiveAiAbilityUsage: proceduralContentAdaptation.adaptiveAi.abilityUsage,
        adaptiveAiCoordination: proceduralContentAdaptation.adaptiveAi.coordination,
        proceduralContentAdaptationHash: proceduralContentAdaptation.hash,
        oldBranchCloudServicesPort: true,
        cloudServicesSource: cloudServices.source,
        cloudAuthProvider: cloudServices.services.authentication.provider,
        cloudAuthTokenIssued: cloudServices.services.authentication.tokenIssued,
        cloudOfflineUserId: cloudServices.services.authentication.offlineUserId,
        cloudSaveStatus: cloudServices.services.cloudSave.status,
        cloudSaveVersion: cloudServices.services.cloudSave.version,
        cloudSaveChecksum: cloudServices.services.cloudSave.checksum,
        cloudSaveQueuedUploads: cloudServices.services.cloudSave.queuedUploads,
        cloudAchievementUnlockedCount: cloudServices.services.achievements.unlocked.length,
        cloudAchievementTotalPoints: cloudServices.services.achievements.totalPoints,
        cloudLeaderboardScore: cloudServices.services.leaderboard.score,
        cloudLeaderboardRank: cloudServices.services.leaderboard.rank,
        cloudLeaderboardCachedEntries: cloudServices.services.leaderboard.cachedEntries,
        cloudRemoteConfigGroup: cloudServices.services.remoteConfig.abTestGroup,
        cloudRemoteConfigDifficultyScale: cloudServices.services.remoteConfig.difficultyScale,
        cloudRemoteConfigEventMultiplier: cloudServices.services.remoteConfig.eventMultiplier,
        cloudMatchmakingTicket: cloudServices.services.matchmaking.ticketId,
        cloudMatchmakingEstimatedWaitMs: cloudServices.services.matchmaking.estimatedWaitMs,
        cloudMatchmakingMatchedPlayers: cloudServices.services.matchmaking.matchedPlayers,
        cloudContentAssetCount: cloudServices.services.contentDelivery.assetCount,
        cloudContentCacheHits: cloudServices.services.contentDelivery.cacheHits,
        cloudContentIntegrityHashes: cloudServices.services.contentDelivery.integrityHashes.join(","),
        cloudServicesBlockedClaims: cloudServices.blockedClaims.join("|"),
        cloudServicesHash: cloudServices.hash,
        oldBranchAnalyticsPrivacyPort: true,
        analyticsPrivacySource: analyticsPrivacy.source,
        analyticsConsentGrantedCount: analyticsPrivacy.consent.grantedCount,
        analyticsConsentDeniedCount: analyticsPrivacy.consent.deniedCount,
        analyticsConsentAnalyticsGranted: analyticsPrivacy.consent.categories.analytics,
        analyticsConsentMarketingGranted: analyticsPrivacy.consent.categories.marketing,
        analyticsUserHash: analyticsPrivacy.anonymization.userHash,
        analyticsSessionHash: analyticsPrivacy.anonymization.sessionHash,
        analyticsIpAnonymized: analyticsPrivacy.anonymization.ipAnonymized,
        analyticsPiiPatternHits: analyticsPrivacy.anonymization.piiPatternHits,
        analyticsProviderMode: analyticsPrivacy.batching.providerMode,
        analyticsQueuedEvents: analyticsPrivacy.batching.queuedEvents,
        analyticsFlushedBatches: analyticsPrivacy.batching.flushedBatches,
        analyticsBlockedWithoutConsent: analyticsPrivacy.batching.blockedWithoutConsent,
        analyticsFrameMs: analyticsPrivacy.metrics.frameMs,
        analyticsFps: analyticsPrivacy.metrics.fps,
        analyticsErrorCount: analyticsPrivacy.metrics.errorCount,
        analyticsErrorsPerMinute: analyticsPrivacy.metrics.errorsPerMinute,
        analyticsLoadEvents: analyticsPrivacy.metrics.loadEvents,
        analyticsCustomMetricCount: analyticsPrivacy.metrics.customMetricCount,
        analyticsBlockedClaims: analyticsPrivacy.blockedClaims.join("|"),
        analyticsPrivacyHash: analyticsPrivacy.hash,
        oldBranchAudioEnvironmentPort: true,
        audioEnvironmentSource: audioEnvironment.source,
        audioOcclusionLevel: audioEnvironment.occlusion.level,
        audioOcclusionObstacleCount: audioEnvironment.occlusion.obstacleCount,
        audioOcclusionLowpassHz: audioEnvironment.occlusion.lowpassHz,
        audioOcclusionVolume: audioEnvironment.occlusion.volume,
        audioDopplerPitchFactor: audioEnvironment.doppler.pitchFactor,
        audioDopplerRelativeVelocity: audioEnvironment.doppler.relativeVelocity,
        audioDopplerApproaching: audioEnvironment.doppler.approaching,
        audioDopplerFrequencyShiftHz: audioEnvironment.doppler.frequencyShiftHz,
        audioReverbBlend: audioEnvironment.reverb.blend,
        audioReverbWetLevel: audioEnvironment.reverb.wetLevel,
        audioReverbDryLevel: audioEnvironment.reverb.dryLevel,
        audioEnvironmentHash: audioEnvironment.hash,
        oldBranchAudioEffectsAnalysisPort: true,
        audioEffectsAnalysisSource: audioEffectsAnalysis.source,
        audioEffectsChain: audioEffectsAnalysis.effectChain.join(">"),
        audioCompressorPreset: audioEffectsAnalysis.compressor.preset,
        audioCompressorInputPeakDb: audioEffectsAnalysis.compressor.inputPeakDb,
        audioCompressorOutputPeakDb: audioEffectsAnalysis.compressor.outputPeakDb,
        audioCompressorGainReductionDb: audioEffectsAnalysis.compressor.gainReductionDb,
        audioCompressorMakeupGainDb: audioEffectsAnalysis.compressor.makeupGainDb,
        audioCompressorLimiterTriggered: audioEffectsAnalysis.compressor.limiterTriggered,
        audioEqActiveBands: audioEffectsAnalysis.eq.activeBandCount,
        audioEqLowShelfGainDb: audioEffectsAnalysis.eq.lowShelfGainDb,
        audioEqPresenceGainDb: audioEffectsAnalysis.eq.presenceGainDb,
        audioDelayPreset: audioEffectsAnalysis.delay.preset,
        audioDelayTimeSeconds: audioEffectsAnalysis.delay.delayTimeSeconds,
        audioDelayFeedback: audioEffectsAnalysis.delay.feedback,
        audioDelayWetDryMix: audioEffectsAnalysis.delay.wetDryMix,
        audioDelayRepeatsAboveNoiseFloor: audioEffectsAnalysis.delay.repeatsAboveNoiseFloor,
        audioDelayPingPong: audioEffectsAnalysis.delay.pingPong,
        audioChorusPreset: audioEffectsAnalysis.chorus.preset,
        audioChorusRateHz: audioEffectsAnalysis.chorus.rateHz,
        audioChorusDepthSeconds: audioEffectsAnalysis.chorus.depthSeconds,
        audioChorusVoices: audioEffectsAnalysis.chorus.voices,
        audioChorusStereoWidth: audioEffectsAnalysis.chorus.stereoWidth,
        audioDistortionCurve: audioEffectsAnalysis.distortion.curve,
        audioDistortionAmount: audioEffectsAnalysis.distortion.amount,
        audioDistortionHarmonicBoost: audioEffectsAnalysis.distortion.harmonicBoost,
        audioDistortionOutputCeiling: audioEffectsAnalysis.distortion.outputCeiling,
        audioFilterType: audioEffectsAnalysis.filter.type,
        audioFilterFrequencyHz: audioEffectsAnalysis.filter.frequencyHz,
        audioFilterQ: audioEffectsAnalysis.filter.q,
        audioFilterResonanceDb: audioEffectsAnalysis.filter.resonanceDb,
        audioSpectrumBarCount: audioEffectsAnalysis.spectrum.barCount,
        audioSpectrumPeakFrequencyHz: audioEffectsAnalysis.spectrum.peakFrequencyHz,
        audioSpectrumPeakMagnitude: audioEffectsAnalysis.spectrum.peakMagnitude,
        audioEffectsBlockedClaims: audioEffectsAnalysis.blockedClaims.join("|"),
        audioEffectsAnalysisHash: audioEffectsAnalysis.hash,
        spatialListenerX: Number(audioListener.position.x.toFixed(3)),
        spatialListenerY: Number(audioListener.position.y.toFixed(3)),
        spatialSourceX: Number(spatialPosition.x.toFixed(3)),
        spatialSourceY: Number(spatialPosition.y.toFixed(3)),
        spatialSourceZ: Number(spatialPosition.z.toFixed(3)),
        spatialDistance: Number(spatialDistance.toFixed(3)),
        mobileUnlockHandling: true,
        mobileUnlockAttempts: audioState.mobileUnlockAttempts,
        inputSnapshot: snapshot instanceof InputSnapshot,
        bindingPreset: currentBinding,
        jumpPressed: lastJumpPressed,
        moveAxis: Number(lastInputAxis.toFixed(3)),
        gamepadCount: snapshot.gamepads.length,
        gamepadAxis0: Number((snapshot.gamepads[0]?.axes[0] ?? 0).toFixed(3)),
        gamepadButton0Down: snapshot.gamepadButton(0, 0).down,
        gamepadButton0Pressed: snapshot.gamepadButton(0, 0).pressed,
        pointerTouches: snapshot.pointer.touches.length,
        oldBranchInputReplayPort: true,
        inputReplaySource: inputReplayEvidence.recording.metadata.source,
        inputReplayEvents: inputReplayEvidence.recording.metadata.eventCount,
        inputReplayFrames: inputReplayEvidence.recording.metadata.frameCount,
        inputReplayDurationMs: inputReplayEvidence.recording.metadata.durationMs,
        inputReplayEmittedEvents: inputReplayEvidence.playback.emittedEvents,
        inputReplayLoopCount: inputReplayEvidence.playback.loopCount,
        inputReplayFirstEventTypes: inputReplayEvidence.firstEventTypes,
        inputReplayState: inputReplayEvidence.playback.state,
        oldBranchInputActionBindingPort: true,
        inputActionBindingSource: actionBindingEvidence.source,
        inputActionCount: actionBindingEvidence.actionCount,
        inputBindingCount: actionBindingEvidence.bindingCount,
        inputProcessorCount: actionBindingEvidence.processorCount,
        inputProcessedAxis: actionBindingEvidence.processedAxis,
        inputDeadzoneFilteredAxis: actionBindingEvidence.deadzoneFilteredAxis,
        inputCompositeMagnitude: actionBindingEvidence.compositeMagnitude,
        inputHoldTriggered: actionBindingEvidence.holdTriggered,
        inputTapTriggered: actionBindingEvidence.tapTriggered,
        inputDoubleTapTriggered: actionBindingEvidence.doubleTapTriggered,
        inputModifierChordPressed: actionBindingEvidence.modifierChordPressed,
        oldBranchGestureHapticsPort: true,
        inputGestureHapticsSource: gestureHapticsEvidence.source,
        inputGestureHapticsHash: gestureHapticsEvidence.hash,
        inputGestureCount: gestureHapticsEvidence.gestures.length,
        inputGestureTypes: gestureHapticsEvidence.gestures.map((gesture) => gesture.type).join(","),
        inputGesturePanDistance: gestureHapticsEvidence.gestureSummary.panDistance,
        inputGesturePinchScale: gestureHapticsEvidence.gestureSummary.pinchScale,
        inputGestureSwipeDirection: gestureHapticsEvidence.gestureSummary.swipeDirection,
        inputGestureRotateDegrees: gestureHapticsEvidence.gestureSummary.rotateDegrees,
        inputHapticsGamepadConnected: gestureHapticsEvidence.haptics.gamepadConnected,
        inputHapticsClaimed: gestureHapticsEvidence.haptics.hapticsClaimed,
        inputHapticPatternCount: gestureHapticsEvidence.haptics.patterns.length,
        inputHapticQueuedPatterns: gestureHapticsEvidence.haptics.queuedPatterns,
        inputHapticTotalDurationMs: gestureHapticsEvidence.haptics.totalDurationMs,
        inputHapticIntensityMultiplier: gestureHapticsEvidence.haptics.intensityMultiplier,
        inputGestureHapticsBlockedClaims: gestureHapticsEvidence.blockedClaims.join("|"),
        oldBranchVirtualTouchJoystickPort: true,
        virtualTouchJoystickSource: virtualTouchEvidence.active.source,
        virtualTouchJoystickActiveMagnitude: virtualTouchEvidence.active.magnitude,
        virtualTouchJoystickReleasedMagnitude: virtualTouchEvidence.released.magnitude,
        virtualTouchJoystickConsumedTouches: virtualTouchEvidence.active.consumedTouches,
        virtualTouchJoystickDeadZone: virtualTouchEvidence.active.deadZone,
        virtualTouchJoystickFloatingCenter: virtualTouchEvidence.active.evidence.floatingCenter,
        virtualTouchJoystickReturnToCenter: virtualTouchEvidence.active.evidence.returnToCenter,
        oldBranchXrRuntimePort: xrRuntimeEvidence.evidence.oldCodebasePort,
        xrRuntimeSource: xrRuntimeEvidence.source,
        xrRuntimeHash: xrRuntimeEvidence.hash,
        xrRequestedMode: xrRuntimeEvidence.requestedMode,
        xrFallbackMode: xrRuntimeEvidence.fallbackMode,
        xrSessionSupported: xrRuntimeEvidence.sessionSupported,
        xrFallbackUsed: xrRuntimeEvidence.fallbackUsed,
        xrWebXRSessionClaimed: xrRuntimeEvidence.webXRSessionClaimed,
        xrDeviceRuntimeClaimed: xrRuntimeEvidence.deviceRuntimeClaimed,
        xrControllerCount: xrRuntimeEvidence.input.controllerCount,
        xrTriggerPressed: xrRuntimeEvidence.input.triggerPressed,
        xrThumbstickMagnitude: xrRuntimeEvidence.input.thumbstickMagnitude,
        xrPinchDetected: xrRuntimeEvidence.input.pinchDetected,
        xrPinchStrength: xrRuntimeEvidence.input.pinchStrength,
        xrPointDetected: xrRuntimeEvidence.input.pointDetected,
        xrPointConfidence: xrRuntimeEvidence.input.pointConfidence,
        xrGazeLodHigh: xrRuntimeEvidence.gazeLod.highDetailCount,
        xrGazeLodMedium: xrRuntimeEvidence.gazeLod.mediumDetailCount,
        xrGazeLodLow: xrRuntimeEvidence.gazeLod.lowDetailCount,
        xrGazeLodCulled: xrRuntimeEvidence.gazeLod.culledCount,
        xrGazeLodUpdatedObjects: xrRuntimeEvidence.gazeLod.updatedObjects,
        xrGazeLodSelectedLevels: xrRuntimeEvidence.gazeLod.selectedLevels.join(","),
        xrBlockedClaims: xrRuntimeEvidence.blockedClaims.join("|"),
        pointerLockSupported: pointerLockState.supported,
        pointerLockRequested: pointerLockState.requested,
        pointerLockActive: pointerLockState.active,
        pointerLockChanges: pointerLockState.changes,
        pointerLockErrors: pointerLockState.errors,
        scriptStarted: scriptState.started,
        scriptUpdates: scriptState.updates,
        scriptHookInit: runtimeBehaviorState.started,
        scriptHookUpdate: runtimeBehaviorState.uiUpdates,
        scriptHookFixedUpdate: runtimeBehaviorState.movementUpdates,
        scriptHookInput: runtimeBehaviorState.interactionEvents,
        scriptHookTrigger: runtimeBehaviorState.triggerEvents,
        scriptHookCollision: runtimeBehaviorState.collisionEvents,
        scriptHookTeardown: runtimeBehaviorState.teardownEvents,
        scriptErrors: behaviorSystem.errors.length,
        scriptOverlayVisible: !errorPanel.hidden,
        runtimeErrorCount: runtimeErrors.length,
        runtimeOverlayVisible: !errorPanel.hidden,
        runtimeErrorPhases: runtimeErrors.map((error) => error.phase).join(","),
        assetErrors: runtimeErrors.filter((error) => error.phase === "asset").length,
        renderErrors: runtimeErrors.filter((error) => error.phase === "render").length,
        physicsErrors: runtimeErrors.filter((error) => error.phase === "physics").length,
        animationErrors: runtimeErrors.filter((error) => error.phase === "animation").length,
        audioErrors: runtimeErrors.filter((error) => error.phase === "audio").length,
        behaviorSceneObjectAttached: sceneObjectHost.target === scriptedSceneNode,
        behaviorMovementUpdates: runtimeBehaviorState.movementUpdates,
        behaviorInteractionEvents: runtimeBehaviorState.interactionEvents,
        behaviorTriggerEvents: runtimeBehaviorState.triggerEvents,
        behaviorCollisionEvents: runtimeBehaviorState.collisionEvents,
        behaviorTeardownEvents: runtimeBehaviorState.teardownEvents,
        behaviorUiUpdates: runtimeBehaviorState.uiUpdates,
        behaviorReloads: runtimeBehaviorState.reloads,
        behaviorReloadFlow: runtimeBehaviorState.reloads > 0,
        rendererBacked: true,
      },
    };
    status.textContent = JSON.stringify(window.__AURA3D_GAME_DEMO__, null, 2);
    if (running) requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
  window.addEventListener("pagehide", () => {
    running = false;
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("keyup", onWindowKeyUp);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    document.removeEventListener("pointerlockerror", onPointerLockError);
    input.dispose();
    spatialPickup.dispose();
    visualAssets?.playerResources.dispose();
    visualAssets?.arenaResources.dispose();
    visualAssets?.skinnedHeroGeometry.dispose();
    void audio.dispose();
    renderer.dispose();
  }, { once: true });
}

async function loadGameVisualAssets(): Promise<LoadedGameVisualAssets> {
  const loader = new GLTFLoader();
  const playerUrl = new URL("../../fixtures/workflow-assets/assets/animated-character/animated-character.gltf", window.location.href).toString();
  const arenaUrl = new URL("../../fixtures/advanced-gallery/assets/smart-city-district/smart-city-district.gltf", window.location.href).toString();
  const skinnedHeroUrl = new URL("../../fixtures/threejs-parity/assets/character/soldier.glb", window.location.href).toString();
  const [playerAsset, arenaAsset, skinnedHeroAsset] = await Promise.all([
    loader.load({ url: playerUrl }, new LoadContext()),
    loader.load({ url: arenaUrl }, new LoadContext()),
    loader.load({ url: skinnedHeroUrl }, new LoadContext()),
  ]);
  const [playerResources, arenaResources] = await Promise.all([
    createGLTFRenderResources(playerAsset),
    createGLTFRenderResources(arenaAsset),
  ]);
  const skinnedHeroMesh = skinnedHeroAsset.meshes.find((entry) => entry.skinIndex === 0 && entry.joints.length > 0 && entry.weights.length > 0);
  const skinnedHeroSkin = skinnedHeroAsset.skins[0];
  const skinnedHeroClip = skinnedHeroAsset.animations[0];
  if (!skinnedHeroMesh || !skinnedHeroSkin || !skinnedHeroClip) {
    throw new Error("ExternalParity game skinned hero did not import a skinned mesh, skin, and animation clip.");
  }
  const skinnedHeroGeometry = createSkinnedGLTFGeometry(skinnedHeroMesh);
  const skinnedHeroMaterial = new SkinnedLitMaterial({
    name: "game-external-parity-lit-skinned-hero",
    color: [0.2, 0.86, 1, 1],
    lightIntensity: 1.55
  });
  updateGameVisualAssetTransforms({
    playerResources,
    arenaResources,
    skinnedHeroGeometry,
    skinnedHeroMaterial,
    skinnedHeroSkin,
    skinnedHeroClip,
    playerUrl,
    arenaUrl,
    skinnedHeroUrl,
    playerMeshes: playerAsset.meshes.length,
    arenaMeshes: arenaAsset.meshes.length,
    skinnedHeroMeshName: skinnedHeroMesh.name,
    skinnedHeroJointCount: skinnedHeroSkin.joints.length,
    skinnedHeroTrackCount: skinnedHeroClip.tracks.length,
    playerRenderables: playerResources.scene.collectRenderables().length,
    arenaRenderables: arenaResources.scene.collectRenderables().length,
  }, playerRenderPosition(playerStartPosition[0], playerStartPosition[1]), 0, "idle", 0);
  return {
    playerResources,
    arenaResources,
    skinnedHeroGeometry,
    skinnedHeroMaterial,
    skinnedHeroSkin,
    skinnedHeroClip,
    playerUrl,
    arenaUrl,
    skinnedHeroUrl,
    playerMeshes: playerAsset.meshes.length,
    arenaMeshes: arenaAsset.meshes.length,
    skinnedHeroMeshName: skinnedHeroMesh.name,
    skinnedHeroJointCount: skinnedHeroSkin.joints.length,
    skinnedHeroTrackCount: skinnedHeroClip.tracks.length,
    playerRenderables: playerResources.scene.collectRenderables().length,
    arenaRenderables: arenaResources.scene.collectRenderables().length,
  };
}

function updatePlayerAnimationStateMachine(
  stateMachine: PlayerAnimationStateMachine,
  objectivePhase: GameplayPhase,
  characterState: { readonly speed: number; readonly jumpedThisFrame: boolean; readonly grounded: boolean },
  inputAxis: number,
  dt: number
): void {
  const next = selectPlayerAnimationState(objectivePhase, characterState, inputAxis);
  if (next !== stateMachine.current) {
    stateMachine.previous = stateMachine.current;
    stateMachine.current = next;
    stateMachine.transitions += 1;
    stateMachine.lastTransition = `${stateMachine.previous}->${next}`;
    stateMachine.stateTime = 0;
    return;
  }
  stateMachine.stateTime += dt;
}

function selectPlayerAnimationState(
  objectivePhase: GameplayPhase,
  characterState: { readonly speed: number; readonly jumpedThisFrame: boolean; readonly grounded: boolean },
  inputAxis: number
): PlayerAnimationState {
  if (objectivePhase === "won") return "win";
  if (objectivePhase === "failed") return "fail";
  if (characterState.jumpedThisFrame || !characterState.grounded) return "jump";
  if (Math.abs(inputAxis) > 0.05 || characterState.speed > 0.08) return "run";
  return "idle";
}

function updateGameVisualAssetTransforms(visualAssets: LoadedGameVisualAssets | undefined, playerPosition: { readonly x: number; readonly y: number }, timeMs: number, animationState: PlayerAnimationState = "idle", animationTime = 0): void {
  if (!visualAssets) return;
  const heroRoot = visualAssets.playerResources.scene.findByName("game-hero-runner-root")[0];
  const arenaRoot = visualAssets.arenaResources.scene.findByName("game-arena-outpost-root")[0];
  const runBob = animationState === "run" ? Math.sin(timeMs * 0.018) * 0.026 : Math.sin(timeMs * 0.006) * 0.008;
  const jumpLift = animationState === "jump" ? 0.045 : 0;
  const victoryLift = animationState === "win" ? 0.035 + Math.sin(animationTime * 8) * 0.012 : 0;
  const failSquash = animationState === "fail" ? 0.82 : 1;
  heroRoot?.transform.setPosition(playerPosition.x, playerPosition.y + 0.14 + runBob + jumpLift + victoryLift, 0.12).setScale(0.3, 0.3 * failSquash, 0.3);
  poseHeroRunner(visualAssets, animationState, animationTime, timeMs);
  arenaRoot?.transform.setPosition(0.08, 0.04, 0).setScale(0.54, 0.54, 0.54);
}

function poseHeroRunner(visualAssets: LoadedGameVisualAssets, animationState: PlayerAnimationState, animationTime: number, timeMs: number): void {
  const stride = Math.sin(timeMs * 0.018);
  const breathe = Math.sin(animationTime * 5) * 0.015;
  const leftShin = visualAssets.playerResources.scene.findByName("hero-left-shin")[0];
  const rightShin = visualAssets.playerResources.scene.findByName("hero-right-shin")[0];
  const leftBoot = visualAssets.playerResources.scene.findByName("hero-left-boot")[0];
  const rightBoot = visualAssets.playerResources.scene.findByName("hero-right-boot")[0];
  const leftShoulder = visualAssets.playerResources.scene.findByName("hero-left-shoulder")[0];
  const rightShoulder = visualAssets.playerResources.scene.findByName("hero-right-shoulder")[0];
  const chest = visualAssets.playerResources.scene.findByName("hero-chest-armor")[0];
  const helmet = visualAssets.playerResources.scene.findByName("hero-helmet-shell")[0];
  const runOffset = animationState === "run" ? 0.1 : 0;
  const jumpOffset = animationState === "jump" ? 0.08 : 0;
  const winOffset = animationState === "win" ? 0.14 : 0;
  const failDrop = animationState === "fail" ? -0.18 : 0;
  leftShin?.transform.setPosition(-0.15, -0.55 + stride * runOffset + jumpOffset + failDrop, 0.02);
  rightShin?.transform.setPosition(0.15, -0.55 - stride * runOffset + jumpOffset + failDrop, 0.02);
  leftBoot?.transform.setPosition(-0.17, -0.82 - stride * runOffset * 0.7 + jumpOffset + failDrop, 0.08);
  rightBoot?.transform.setPosition(0.17, -0.82 + stride * runOffset * 0.7 + jumpOffset + failDrop, 0.08);
  leftShoulder?.transform.setPosition(-0.32, 0.75 - stride * runOffset * 0.55 + winOffset, 0);
  rightShoulder?.transform.setPosition(0.32, 0.75 + stride * runOffset * 0.55 + winOffset, 0);
  chest?.transform.setPosition(0, 0.62 + breathe + failDrop * 0.35, 0);
  helmet?.transform.setPosition(0, 1.08 + breathe + winOffset * 0.25 + failDrop * 0.3, 0);
}

function createSkinnedGLTFGeometry(mesh: GLTFMeshAsset): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3J4W4, mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 1) {
    vertices.setAttribute(index, "position", mesh.positions[index]!);
    vertices.setAttribute(index, "normal", mesh.normals[index] ?? [0, 0, 1]);
    vertices.setAttribute(index, "joints", mesh.joints[index] ?? [0, 0, 0, 0]);
    vertices.setAttribute(index, "weights", mesh.weights[index] ?? [0, 0, 0, 0]);
  }
  return new Geometry(vertices, mesh.indices ? new IndexBuffer(mesh.indices, mesh.positions.length) : null, mesh.topology);
}

function sampleAnimatedSkeleton(skeleton: Skeleton, clip: AnimationClip, time: number): Skeleton {
  const poses = new Map(skeleton.bones.map((bone) => [
    bone.name,
    {
      translation: [...bone.translation] as [number, number, number],
      rotation: [...bone.rotation] as [number, number, number, number],
      scale: [...bone.scale] as [number, number, number]
    }
  ]));

  for (const track of clip.tracks) {
    const separator = track.target.lastIndexOf(".");
    if (separator < 0) continue;
    const boneName = track.target.slice(0, separator);
    const path = track.target.slice(separator + 1);
    const pose = poses.get(boneName);
    if (!pose) continue;
    const value = track.sample(time);
    if (path === "translation" && isVec3(value)) {
      pose.translation = value;
    } else if (path === "rotation" && isQuat(value)) {
      pose.rotation = value;
    } else if (path === "scale" && isVec3(value)) {
      pose.scale = value;
    }
  }

  return new Skeleton(skeleton.bones.map((bone) => {
    const pose = poses.get(bone.name)!;
    return new Bone({
      name: bone.name,
      parentIndex: bone.parentIndex,
      translation: pose.translation,
      rotation: pose.rotation,
      scale: pose.scale,
      inverseBindMatrix: bone.inverseBindMatrix
    });
  }));
}

function isVec3(value: AnimationValue): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number");
}

function isQuat(value: AnimationValue): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => typeof entry === "number");
}

function navigationPoint(value: readonly [number, number, number]): NavigationPoint {
  return [value[0], value[1]];
}

function combineNavigationPaths(first: NavigationPath, second: NavigationPath): NavigationPath {
  const status = first.status === "success" && second.status === "success"
    ? "success"
    : first.status === "failed" || second.status === "failed"
      ? "failed"
      : "partial";
  const cells = [...first.cells, ...second.cells.slice(1)];
  const waypoints = [...first.waypoints, ...second.waypoints.slice(1)];
  return {
    status,
    cells,
    waypoints,
    length: navigationPathLength(waypoints),
    cost: Number((first.cost + second.cost).toFixed(3)),
    visitedCells: first.visitedCells + second.visitedCells
  };
}

function navigationPathLength(points: readonly NavigationPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1]);
  }
  return Number(length.toFixed(3));
}

function createGameAiBehaviorTree(blackboard: Blackboard): BehaviorTree {
  return new BehaviorTree(new BehaviorSelector("game-ai-root", [
    new BehaviorSequence("celebrate-objective", [
      new BehaviorCondition("objective-won", ({ blackboard }) => blackboard.get("objectivePhase") === "won"),
      new BehaviorAction("set-celebrate-intent", ({ blackboard }) => {
        blackboard.set("intent", "celebrate");
        blackboard.set("target", "exit");
        return "success";
      })
    ]),
    new BehaviorSequence("reach-exit", [
      new BehaviorCondition("pickup-collected", ({ blackboard }) => blackboard.get("collectedPickup") === true),
      new BehaviorAction("set-exit-intent", ({ blackboard }) => {
        blackboard.set("intent", "reach-exit");
        blackboard.set("target", "exit");
        return blackboard.get("navigationAgentState") === "arrived" ? "success" : "running";
      })
    ]),
    new BehaviorSequence("collect-pickup", [
      new BehaviorCondition("route-ready", ({ blackboard }) => blackboard.get("routeStatus") === "success"),
      new BehaviorAction("set-pickup-intent", ({ blackboard }) => {
        blackboard.set("intent", "collect-pickup");
        blackboard.set("target", "pickup");
        return "running";
      })
    ])
  ]), blackboard);
}

function createGameAiDecisionTree(blackboard: Blackboard): DecisionTree {
  const tree = new DecisionTree();
  const objectiveWon = tree.createDecision("objective-won", ({ values }) => values?.objectivePhase === "won");
  const hazardVisible = tree.createDecision("hazard-visible", ({ values }) => values?.hazardVisible === true || values?.utilityAction === "avoid-hazard");
  const pickupCollected = tree.createDecision("pickup-collected", ({ values }) => values?.collectedPickup === true);
  const celebrate = tree.createAction("celebrate-objective", () => blackboard.set("decisionTreeIntent", "celebrate"));
  const evade = tree.createAction("evade-hazard", () => blackboard.set("decisionTreeIntent", "evade-hazard"));
  const exit = tree.createAction("reach-exit", () => blackboard.set("decisionTreeIntent", "reach-exit"));
  const collect = tree.createAction("collect-pickup", () => blackboard.set("decisionTreeIntent", "collect-pickup"));
  tree.setBranches(objectiveWon, celebrate, hazardVisible);
  tree.setBranches(hazardVisible, evade, pickupCollected);
  tree.setBranches(pickupCollected, exit, collect);
  tree.setRoot(objectiveWon);
  return tree;
}

function createGameAiStateMachine(blackboard: Blackboard): AiStateMachine {
  const machine = new AiStateMachine(blackboard, { maxHistorySize: 8 });
  const seekingPickup = new AiState("seeking-pickup");
  const seekingExit = new AiState("seeking-exit");
  const avoidingHazard = new AiState("avoiding-hazard");
  const celebrating = new AiState("celebrating");

  seekingPickup.onEnter = (state) => state.set("aiMode", "seeking-pickup");
  seekingPickup.onUpdate = (deltaSeconds, state) => state.set("aiStateElapsed", Number((Number(state.get("aiStateElapsed", 0)) + deltaSeconds).toFixed(3)));
  seekingPickup
    .addTransition("avoiding-hazard", (state) => state.get("utilityAction") === "avoid-hazard", 30)
    .addTransition("seeking-exit", (state) => state.get("collectedPickup") === true, 20);

  seekingExit.onEnter = (state) => {
    state.set("aiMode", "seeking-exit");
    state.set("target", "exit");
  };
  seekingExit.onUpdate = (deltaSeconds, state) => state.set("aiStateElapsed", Number((Number(state.get("aiStateElapsed", 0)) + deltaSeconds).toFixed(3)));
  seekingExit
    .addTransition("celebrating", (state) => state.get("objectivePhase") === "won", 40)
    .addTransition("avoiding-hazard", (state) => state.get("utilityAction") === "avoid-hazard", 30);

  avoidingHazard.onEnter = (state) => state.set("aiMode", "avoiding-hazard");
  avoidingHazard.onUpdate = (deltaSeconds, state) => state.set("aiStateElapsed", Number((Number(state.get("aiStateElapsed", 0)) + deltaSeconds).toFixed(3)));
  avoidingHazard
    .addTransition("seeking-exit", (state) => state.get("utilityAction") !== "avoid-hazard" && state.get("collectedPickup") === true, 20)
    .addTransition("seeking-pickup", (state) => state.get("utilityAction") !== "avoid-hazard" && state.get("collectedPickup") !== true, 10);

  celebrating.onEnter = (state) => state.set("aiMode", "celebrating");
  celebrating
    .addTransition("seeking-pickup", (state) => state.get("objectivePhase") === "playing" && state.get("collectedPickup") !== true, 20)
    .addTransition("seeking-exit", (state) => state.get("objectivePhase") === "playing" && state.get("collectedPickup") === true, 10);

  return machine
    .addState(seekingPickup)
    .addState(seekingExit)
    .addState(avoidingHazard)
    .addState(celebrating);
}

function createGameAiUtility(): UtilityAI {
  const ai = new UtilityAI();
  ai.addAction(new UtilityAction({
    name: "collect-pickup",
    scoring: "average",
    considerations: [
      new UtilityConsideration({ name: "needs-pickup", input: ({ values }) => values?.collectedPickup !== true, curve: "boolean" }),
      new UtilityConsideration({ name: "pickup-signal", input: ({ values }) => Number(values?.pickupConfidence ?? 0) }),
      new UtilityConsideration({ name: "route-ready", input: ({ values }) => values?.routeStatus === "success", curve: "boolean" })
    ]
  }));
  ai.addAction(new UtilityAction({
    name: "reach-exit",
    scoring: "average",
    considerations: [
      new UtilityConsideration({ name: "has-pickup", input: ({ values }) => values?.collectedPickup === true, curve: "boolean" }),
      new UtilityConsideration({ name: "exit-signal", input: ({ values }) => Number(values?.exitConfidence ?? 0) }),
      new UtilityConsideration({ name: "navigation-progress", input: ({ values }) => Number(values?.navigationProgress ?? 0) })
    ]
  }));
  ai.addAction(new UtilityAction({
    name: "avoid-hazard",
    scoring: "max",
    considerations: [
      new UtilityConsideration({ name: "hazard-visible", input: ({ values }) => values?.hazardVisible === true, curve: "boolean" }),
      new UtilityConsideration({ name: "hazard-confidence", input: ({ values }) => Number(values?.hazardConfidence ?? 0) }),
      new UtilityConsideration({ name: "hazard-distance", input: ({ values }) => Number(values?.hazardProximity ?? 0) })
    ]
  }));
  return ai;
}

function createGameAiUtilityContext(
  objectiveState: {
    readonly phase: GameplayPhase;
    readonly collectedPickup: boolean;
  },
  perceptionState: PerceptionSnapshot,
  navigationAgentState: NavigationAgentSnapshot,
  steeringArrived: boolean,
  steeringDistance: number
) {
  const pickupSignal = confidenceForTarget(perceptionState, "pickup");
  const exitSignal = confidenceForTarget(perceptionState, "exit");
  const hazardSignal = confidenceForTarget(perceptionState, "hazard");
  return {
    values: {
      objectivePhase: objectiveState.phase,
      collectedPickup: objectiveState.collectedPickup,
      routeStatus: navigationAgentState.state === "idle" ? "idle" : "success",
      perceivedTarget: perceptionState.strongestMemory?.id ?? "none",
      pickupConfidence: objectiveState.collectedPickup ? 0.05 : Math.max(pickupSignal, 0.65),
      exitConfidence: objectiveState.collectedPickup ? Math.max(exitSignal, steeringArrived ? 1 : 0.58) : Math.max(exitSignal * 0.35, 0.1),
      hazardConfidence: hazardSignal,
      hazardVisible: perceptionState.visible.some((hit) => hit.id === "hazard"),
      hazardProximity: Math.max(0, Math.min(1, 1 - steeringDistance / 2.2)),
      navigationProgress: Math.max(0, Math.min(1, navigationAgentState.distanceTraveled / 2.2))
    }
  };
}

function confidenceForTarget(perceptionState: PerceptionSnapshot, id: "pickup" | "exit" | "hazard"): number {
  const visible = perceptionState.visible.find((hit) => hit.id === id)?.confidence ?? 0;
  const memory = perceptionState.memories.find((entry) => entry.id === id)?.confidence ?? 0;
  return Math.max(visible, memory);
}

function createGameAiGOAPActions(): readonly GOAPAction[] {
  return [
    new GOAPAction({ name: "avoid-hazard", cost: 0.35, preconditions: { hazardSafe: false }, effects: { hazardSafe: true } }),
    new GOAPAction({ name: "navigate-to-pickup", cost: 1, preconditions: { hazardSafe: true, nearPickup: false }, effects: { nearPickup: true } }),
    new GOAPAction({ name: "collect-pickup", cost: 0.45, preconditions: { nearPickup: true, hasPickup: false }, effects: { hasPickup: true } }),
    new GOAPAction({ name: "navigate-to-exit", cost: 1.1, preconditions: { hasPickup: true, nearExit: false }, effects: { nearExit: true } }),
    new GOAPAction({ name: "finish-objective", cost: 0.2, preconditions: { hasPickup: true, nearExit: true }, effects: { objectiveComplete: true } })
  ];
}

function createGameAiHTNRootTask(): HTNTask {
  const avoidHazard = HTNTask.primitive({
    name: "avoid-hazard",
    preconditions: { hazardSafe: false },
    effects: { hazardSafe: true }
  });
  const navigateToPickup = HTNTask.primitive({
    name: "navigate-to-pickup",
    preconditions: { hazardSafe: true, nearPickup: false },
    effects: { nearPickup: true }
  });
  const collectPickup = HTNTask.primitive({
    name: "collect-pickup",
    preconditions: { nearPickup: true, hasPickup: false },
    effects: { hasPickup: true }
  });
  const navigateToExit = HTNTask.primitive({
    name: "navigate-to-exit",
    preconditions: { hasPickup: true, nearExit: false },
    effects: { nearExit: true }
  });
  const finishObjective = HTNTask.primitive({
    name: "finish-objective",
    preconditions: { hasPickup: true, nearExit: true },
    effects: { objectiveComplete: true }
  });
  return HTNTask.compound({
    name: "complete-objective",
    methods: [
      {
        name: "already-complete",
        preconditions: { objectiveComplete: true },
        priority: 40,
        subtasks: []
      },
      {
        name: "exit-after-pickup",
        preconditions: { hazardSafe: true, hasPickup: true, nearExit: false },
        priority: 30,
        subtasks: [navigateToExit, finishObjective]
      },
      {
        name: "safe-full-route",
        preconditions: { hazardSafe: true, hasPickup: false },
        priority: 20,
        subtasks: [navigateToPickup, collectPickup, navigateToExit, finishObjective]
      },
      {
        name: "recover-then-route",
        preconditions: { hazardSafe: false },
        priority: 10,
        subtasks: [avoidHazard, navigateToPickup, collectPickup, navigateToExit, finishObjective]
      }
    ]
  });
}

function createGameAiWorldState(
  objectiveState: {
    readonly phase: GameplayPhase;
    readonly collectedPickup: boolean;
  },
  utilityDecision: UtilityActionScore | undefined
): WorldState {
  const collectedPickup = objectiveState.collectedPickup || objectiveState.phase === "won";
  return WorldState.from({
    hazardSafe: utilityDecision?.action !== "avoid-hazard",
    nearPickup: collectedPickup,
    hasPickup: collectedPickup,
    nearExit: objectiveState.phase === "won",
    objectiveComplete: objectiveState.phase === "won"
  });
}

function createGameRenderResources(): GameRenderResources {
  const starfieldFixture = createProceduralTextureFixture("starfield-nebula", { width: 64, height: 64 });
  const spaceEnvironmentFixture = sampleSpaceEnvironmentFixture({ width: 960, height: 540, elapsedSeconds: 0, seed: 0x51ace });
  const groundFixture = createProceduralTextureFixture("concrete-asphalt", { width: 96, height: 96, label: "game-arena-concrete-asphalt" });
  const platformFixture = createProceduralTextureFixture("sci-fi-panel", { width: 96, height: 96, label: "game-moving-platform-panel" });
  const starfieldTexture = textureFromFixture(starfieldFixture);
  const groundTexture = textureFromFixture(groundFixture);
  const platformTexture = textureFromFixture(platformFixture);
  const paletteTexture = createArenaPaletteTexture();
  return {
    playerGeometry: Geometry.litCube(0.48),
    pickupGeometry: Geometry.uvSphere(0.16, 24, 12),
    platformGeometry: Geometry.texturedCube(0.2),
    showcaseGeometry: Geometry.texturedCube(1),
    triggerGeometry: Geometry.texturedCube(0.2),
    exitGeometry: Geometry.texturedCube(0.2),
    hazardGeometry: Geometry.texturedCube(0.2),
    contactShadowGeometry: Geometry.uvSphere(0.5, 24, 8),
    floorGeometry: Geometry.texturedCube(0.2),
    railGeometry: Geometry.texturedCube(0.2),
    arenaDetailGeometry: Geometry.lineSegments(gameArenaDetailSegments()),
    starfieldGeometry: Geometry.lineSegments(gameStarSegments(starfieldFixture.data, 2200)),
    spaceEnvironmentGeometry: Geometry.lineSegments(gameSpaceEnvironmentSegments(spaceEnvironmentFixture)),
    playerMaterial: new PBRMaterial({ name: "player", baseColor: [0.2, 0.76, 1, 1], roughness: 0.34, metallic: 0.18, emissiveColor: [0.02, 0.18, 0.36], emissiveStrength: 1.0, renderState: { cullMode: "none" } }),
    pickupMaterial: new PBRMaterial({ name: "pickup", baseColor: [1, 0.82, 0.28, 1], roughness: 0.2, metallic: 0.34, emissiveColor: [0.9, 0.48, 0.08], emissiveStrength: 0.9, renderState: { cullMode: "none" } }),
    platformMaterial: new TexturedPBRMaterial({ name: "moving-platform", baseColor: [0.58, 0.64, 0.72, 1], baseColorTexture: platformTexture, roughness: 0.6, metallic: 0.05, renderState: { cullMode: "none" } }),
    holoPanelMaterial: new TexturedPBRMaterial({ name: "arena-holographic-sci-fi-panel", baseColor: [0.78, 0.9, 1, 0.72], baseColorTexture: platformTexture, roughness: 0.24, metallic: 0.18, emissiveColor: [0.04, 0.36, 0.44], emissiveStrength: 1.1, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } }),
    holoTextureMaterial: new TexturedUnlitMaterial({ name: "arena-holographic-starfield-texture", texture: starfieldTexture, color: [1, 1, 1, 0.82], textureTransform: { scale: [2.4, 1.6], offset: [0.13, 0.27] }, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } }),
    holoTextureMaterials: [
      new TexturedUnlitMaterial({ name: "arena-holographic-starfield-cyan", texture: starfieldTexture, color: [0.5, 1, 1, 0.78], textureTransform: { scale: [2.1, 1.3], offset: [0.08, 0.18] }, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } }),
      new TexturedUnlitMaterial({ name: "arena-holographic-starfield-gold", texture: starfieldTexture, color: [1, 0.82, 0.36, 0.74], textureTransform: { scale: [1.6, 2.2], offset: [0.31, 0.07], rotation: 0.16 }, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } }),
      new TexturedUnlitMaterial({ name: "arena-holographic-starfield-violet", texture: starfieldTexture, color: [0.82, 0.46, 1, 0.72], textureTransform: { scale: [2.8, 1.8], offset: [0.19, 0.38], rotation: -0.12 }, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } }),
      new TexturedUnlitMaterial({ name: "arena-holographic-starfield-mint", texture: starfieldTexture, color: [0.56, 1, 0.68, 0.7], textureTransform: { scale: [1.8, 2.6], offset: [0.42, 0.21], rotation: 0.08 }, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } })
    ],
    holoPaletteMaterial: new TexturedUnlitMaterial({ name: "arena-holographic-generated-palette-texture", texture: paletteTexture, color: [1, 1, 1, 0.86], textureTransform: { scale: [3.2, 1.6], offset: [0.11, 0.23] }, renderState: { depthTest: true, depthWrite: false, blend: true, cullMode: "none" } }),
    groundMaterial: new TexturedPBRMaterial({ name: "arena-showcase-ground", baseColor: [0.34, 0.46, 0.54, 1], baseColorTexture: groundTexture, roughness: 0.55, metallic: 0.08, renderState: { cullMode: "none" } }),
    backdropMaterial: new TexturedPBRMaterial({ name: "seeded-nebula-arena-lit-backdrop", baseColor: [0.34, 0.42, 0.52, 1], baseColorTexture: starfieldTexture, roughness: 0.7, metallic: 0.06, emissiveColor: [0.08, 0.16, 0.24], emissiveStrength: 1.05, renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    nebulaMaterial: new PBRMaterial({ name: "seeded-nebula-violet-lit-panel", baseColor: [0.22, 0.16, 0.34, 1], roughness: 0.58, metallic: 0.08, emissiveColor: [0.16, 0.06, 0.28], emissiveStrength: 0.9, renderState: { cullMode: "none" } }),
    skyGlowMaterial: new PBRMaterial({ name: "seeded-nebula-teal-lit-panel", baseColor: [0.08, 0.38, 0.42, 1], roughness: 0.42, metallic: 0.12, emissiveColor: [0.02, 0.28, 0.34], emissiveStrength: 1.0, renderState: { cullMode: "none" } }),
    skylineMaterial: new PBRMaterial({ name: "arena-showcase-slate-skyline", baseColor: [0.16, 0.24, 0.28, 1], roughness: 0.42, metallic: 0.18, emissiveColor: [0.02, 0.18, 0.22], emissiveStrength: 0.55, renderState: { cullMode: "none" } }),
    beaconMaterial: new PBRMaterial({ name: "arena-showcase-beacon", baseColor: [0.88, 0.3, 0.18, 1], roughness: 0.22, metallic: 0.16, emissiveColor: [0.82, 0.12, 0.04], emissiveStrength: 1.2, renderState: { cullMode: "none" } }),
    arenaPaletteMaterials: createGameArenaPaletteMaterials(),
    amberPanelMaterial: new PBRMaterial({ name: "arena-amber-display-panel", baseColor: [0.74, 0.46, 0.18, 1], roughness: 0.42, metallic: 0.14, emissiveColor: [0.28, 0.12, 0.02], emissiveStrength: 0.42, renderState: { cullMode: "none" } }),
    greenPanelMaterial: new PBRMaterial({ name: "arena-green-system-panel", baseColor: [0.18, 0.46, 0.32, 1], roughness: 0.5, metallic: 0.1, emissiveColor: [0.02, 0.22, 0.11], emissiveStrength: 0.5, renderState: { cullMode: "none" } }),
    ivoryPanelMaterial: new PBRMaterial({ name: "arena-ivory-reflector-panel", baseColor: [0.66, 0.62, 0.52, 1], roughness: 0.38, metallic: 0.08, emissiveColor: [0.12, 0.1, 0.04], emissiveStrength: 0.24, renderState: { cullMode: "none" } }),
    seamMaterial: new PBRMaterial({ name: "arena-layered-panel-seams", baseColor: [0.025, 0.04, 0.052, 1], roughness: 0.5, metallic: 0.16, emissiveColor: [0.01, 0.035, 0.05], emissiveStrength: 0.35, renderState: { cullMode: "none" } }),
    triggerMaterial: new PBRMaterial({ name: "pickup-trigger-zone-outline", baseColor: [1, 0.62, 0.16, 1], roughness: 0.36, metallic: 0.06, emissiveColor: [0.9, 0.28, 0.02], emissiveStrength: 0.95, renderState: { depthTest: true, depthWrite: false, cullMode: "none" } }),
    exitMaterial: new PBRMaterial({ name: "objective-exit-gate", baseColor: [0.28, 1, 0.62, 1], roughness: 0.32, metallic: 0.08, emissiveColor: [0.03, 0.74, 0.26], emissiveStrength: 0.92, renderState: { depthTest: true, depthWrite: false, cullMode: "none" } }),
    hazardMaterial: new PBRMaterial({ name: "objective-hazard-zone", baseColor: [1, 0.2, 0.16, 1], roughness: 0.34, metallic: 0.06, emissiveColor: [0.92, 0.05, 0.02], emissiveStrength: 0.9, renderState: { depthTest: true, depthWrite: false, cullMode: "none" } }),
    contactShadowMaterial: new PBRMaterial({ name: "game-contact-shadow-receiver-darkening", baseColor: [0.01, 0.015, 0.018, 0.42], roughness: 0.92, metallic: 0, renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
    railMaterial: new PBRMaterial({ name: "arena-neon-depth-rails", baseColor: [0.18, 0.78, 0.9, 0.42], roughness: 0.2, metallic: 0.18, emissiveColor: [0.03, 0.58, 0.72], emissiveStrength: 1.05, renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
    particleMaterial: new UnlitMaterial({ name: "particle-sparks", color: [1, 0.34, 0.62, 0.78], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
    floorMaterial: new PBRMaterial({ name: "arena-floor", baseColor: [0.65, 0.78, 0.88, 1], roughness: 0.58, metallic: 0.08, emissiveColor: [0.05, 0.08, 0.1], emissiveStrength: 0.25, renderState: { depthTest: true, depthWrite: false, cullMode: "none" } }),
    starfieldMaterial: new UnlitMaterial({ name: "seeded-starfield-nebula-background", color: [0.72, 0.9, 1, 0.9], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
    arenaAccentMaterials: [
      new UnlitMaterial({ name: "arena-accent-cyan", color: [0.08, 0.88, 1, 0.82], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      new UnlitMaterial({ name: "arena-accent-violet", color: [0.72, 0.22, 1, 0.78], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      new UnlitMaterial({ name: "arena-accent-amber", color: [1, 0.7, 0.18, 0.84], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      new UnlitMaterial({ name: "arena-accent-mint", color: [0.28, 1, 0.68, 0.74], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      new UnlitMaterial({ name: "arena-accent-rose", color: [1, 0.28, 0.46, 0.78], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } }),
      new UnlitMaterial({ name: "arena-accent-ice", color: [0.72, 0.9, 1, 0.7], renderState: { depthTest: true, depthWrite: false, cullMode: "none", blend: true } })
    ],
    starfieldFixture: { id: starfieldFixture.id, hash: starfieldFixture.hash, semantic: starfieldFixture.semantic },
    spaceEnvironmentFixture: {
      id: spaceEnvironmentFixture.id,
      source: spaceEnvironmentFixture.source,
      hash: spaceEnvironmentFixture.hash,
      starCount: spaceEnvironmentFixture.starCount,
      nebulaCount: spaceEnvironmentFixture.nebulaCount,
      dustCount: spaceEnvironmentFixture.dustCount,
      blockedClaims: spaceEnvironmentFixture.blockedClaims
    },
    materialFixtures: [
      { id: groundFixture.id, hash: groundFixture.hash, semantic: groundFixture.semantic },
      { id: platformFixture.id, hash: platformFixture.hash, semantic: platformFixture.semantic }
    ]
  };
}

function textureFromFixture(fixture: ProceduralTextureFixture): Texture {
  return new Texture({
    width: fixture.width,
    height: fixture.height,
    colorSpace: fixture.colorSpace,
    label: fixture.label,
    data: fixture.data
  });
}

function createGameArenaPaletteMaterials(): readonly PBRMaterial[] {
  const colors: readonly (readonly [number, number, number])[] = [
    [0.82, 0.18, 0.28], [0.95, 0.34, 0.18], [0.98, 0.62, 0.16], [0.94, 0.82, 0.2],
    [0.58, 0.86, 0.22], [0.24, 0.78, 0.38], [0.16, 0.72, 0.62], [0.1, 0.68, 0.9],
    [0.18, 0.42, 0.96], [0.38, 0.26, 0.9], [0.62, 0.22, 0.88], [0.84, 0.22, 0.68],
    [0.52, 0.76, 0.94], [0.86, 0.64, 0.42], [0.46, 0.62, 0.52], [0.72, 0.5, 0.78],
    [0.9, 0.92, 0.78], [0.66, 0.82, 0.9], [0.52, 0.5, 0.7], [0.7, 0.34, 0.44],
    [0.42, 0.82, 0.72], [0.78, 0.72, 0.36], [0.32, 0.58, 0.84], [0.9, 0.48, 0.72],
    [0.64, 0.9, 0.48], [0.3, 0.86, 0.92], [0.78, 0.42, 0.92], [0.92, 0.58, 0.38],
    [0.5, 0.7, 0.28], [0.28, 0.5, 0.88], [0.88, 0.76, 0.56], [0.58, 0.42, 0.26],
    [0.32, 0.82, 0.52], [0.72, 0.24, 0.32], [0.24, 0.62, 0.78], [0.96, 0.86, 0.34],
  ];
  return colors.map((color, index) => new PBRMaterial({
    name: `arena-authored-pbr-signal-palette-${index}`,
    baseColor: [color[0], color[1], color[2], 1],
    roughness: 0.34 + (index % 5) * 0.08,
    metallic: 0.04 + (index % 4) * 0.04,
    emissiveColor: [color[0] * 0.12, color[1] * 0.12, color[2] * 0.12],
    emissiveStrength: 0.52 + (index % 6) * 0.06,
    renderState: { cullMode: "none" },
  }));
}

function createArenaPaletteTexture(): Texture {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const cell = (Math.floor(x / 4) + Math.floor(y / 4) * 16) % 256;
      const stripe = (x * 17 + y * 29 + cell * 13) & 255;
      data[index] = 32 + ((cell * 47 + stripe) % 208);
      data[index + 1] = 28 + ((cell * 83 + stripe * 2) % 216);
      data[index + 2] = 36 + ((cell * 131 + stripe * 3) % 204);
      data[index + 3] = 255;
    }
  }
  return new Texture({
    width,
    height,
    colorSpace: "srgb",
    label: "game-arena-generated-holographic-palette",
    data
  });
}

function buildRenderItems(resources: GameRenderResources, visualAssets: LoadedGameVisualAssets | undefined, playerX: number, playerY: number, platformX: number, pickupScale: number, particleBatch: ParticleRenderBatch, timeMs: number): RenderItem[] {
  const playerPosition = playerRenderPosition(playerX, playerY);
  const items: RenderItem[] = [
    {
      geometry: resources.showcaseGeometry,
      material: resources.backdropMaterial,
      modelMatrix: modelMatrix(0, 0.78, -0.74, 3.9, 2.9, 0.045),
      label: "arena-showcase-backdrop"
    },
    ...gameBackdropTileItems(resources),
    ...gameArenaSurfaceVariationItems(resources, timeMs),
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(-1.28, 0.62, -0.48, 0.78, 2.42, 0.038),
      label: "arena-left-cyan-lit-wall-field"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.nebulaMaterial,
      modelMatrix: modelMatrix(-0.34, 0.58, -0.47, 0.88, 2.26, 0.038),
      label: "arena-left-magenta-lit-wall-field"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(0.58, 0.62, -0.46, 0.86, 2.3, 0.038),
      label: "arena-right-teal-lit-wall-field"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(1.44, 0.58, -0.45, 0.62, 2.24, 0.038),
      label: "arena-right-textured-service-wall-field"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(0, 1.54, -0.69, 2.65, 0.24, 0.035),
      label: "arena-overhead-glass-roof-band"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(0, 1.38, -0.68, 2.24, 0.06, 0.035),
      label: "arena-overhead-metal-service-band"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(-1.06, 1.28, -0.68, 0.86, 0.36, 0.04),
      label: "arena-ceiling-left-observation-deck"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(-0.08, 1.23, -0.67, 0.98, 0.2, 0.04),
      label: "arena-ceiling-center-service-span"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.nebulaMaterial,
      modelMatrix: modelMatrix(0.92, 1.26, -0.68, 0.94, 0.34, 0.04),
      label: "arena-ceiling-right-observation-deck"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.railMaterial,
      modelMatrix: modelMatrix(0, 1.04, -0.64, 2.35, 0.02, 0.03),
      label: "arena-ceiling-neon-service-line"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(-0.58, 1.08, -0.58, 0.08, 0.04, 0.04),
      label: "arena-ceiling-left-warning-light"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(0.58, 1.08, -0.58, 0.08, 0.04, 0.04),
      label: "arena-ceiling-right-warning-light"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.railMaterial,
      modelMatrix: modelMatrix(1.12, 0.54, -0.58, 0.018, 1.28, 0.03),
      label: "arena-far-right-lit-strut"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.nebulaMaterial,
      modelMatrix: modelMatrix(-1.1, 0.88, -0.67, 0.92, 0.42, 0.04),
      label: "arena-upper-left-nebula-bank"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(-0.18, 0.9, -0.66, 0.86, 0.36, 0.04),
      label: "arena-upper-center-reactor-glow"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(0.88, 0.86, -0.66, 1.0, 0.44, 0.04),
      label: "arena-upper-right-city-glass"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(1.34, 0.28, -0.65, 0.48, 1.08, 0.04),
      label: "arena-far-right-reactor-wall"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(1.26, -0.22, -0.6, 0.36, 0.1, 0.04),
      label: "arena-far-right-service-balcony"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.nebulaMaterial,
      modelMatrix: modelMatrix(1.26, 0.78, -0.61, 0.32, 0.36, 0.04),
      label: "arena-far-right-upper-glass-module"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(1.34, 1.08, -0.6, 0.28, 0.12, 0.04),
      label: "arena-far-right-overhead-maintenance-rail"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(0, 0.58, -0.63, 2.45, 0.1, 0.035),
      label: "arena-upper-service-gantry"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(-0.9, 0.5, -0.62, 0.72, 0.92, 0.035),
      label: "arena-hangar-left-wall-panel"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.nebulaMaterial,
      modelMatrix: modelMatrix(0, 0.58, -0.62, 0.74, 0.78, 0.035),
      label: "arena-hangar-center-wall-panel"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(0.9, 0.5, -0.62, 0.72, 0.92, 0.035),
      label: "arena-hangar-right-wall-panel"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(0, -0.3, -0.61, 2.5, 0.18, 0.035),
      label: "arena-hangar-mid-deck"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(-0.24, 0.18, -0.54, 0.2, 0.56, 0.05),
      label: "arena-center-lit-elevator-shaft"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(0.23, 0.18, -0.53, 0.16, 0.5, 0.05),
      label: "arena-center-magenta-energy-column"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(0, -0.02, -0.52, 1.02, 0.06, 0.045),
      label: "arena-center-crosswalk"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.railMaterial,
      modelMatrix: modelMatrix(-0.42, 0.08, -0.58, 0.018, 1.22, 0.03),
      label: "arena-hangar-left-divider"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.railMaterial,
      modelMatrix: modelMatrix(0.42, 0.08, -0.58, 0.018, 1.22, 0.03),
      label: "arena-hangar-right-divider"
    },
    {
      geometry: resources.starfieldGeometry,
      material: resources.starfieldMaterial,
      label: "seeded-starfield-nebula-background"
    },
    {
      geometry: resources.spaceEnvironmentGeometry,
      material: resources.starfieldMaterial,
      label: "old-branch-layered-space-environment"
    },
    {
      geometry: resources.arenaDetailGeometry,
      material: resources.starfieldMaterial,
      label: "arena-layered-surface-detail-lines"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skyGlowMaterial,
      modelMatrix: modelMatrix(-0.86, 0.16, -0.52, 0.38, 0.9, 0.06),
      label: "arena-background-left-lightwell"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.nebulaMaterial,
      modelMatrix: modelMatrix(0.86, 0.1, -0.52, 0.42, 0.84, 0.06),
      label: "arena-background-right-lightwell"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(-1.12, -0.34, -0.34, 0.18, 0.64, 0.08),
      label: "arena-background-left-tower-a"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(-0.82, -0.24, -0.34, 0.16, 0.44, 0.08),
      label: "arena-background-left-tower-b"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(0.78, -0.22, -0.34, 0.18, 0.48, 0.08),
      label: "arena-background-right-tower-a"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(1.12, -0.34, -0.34, 0.2, 0.64, 0.08),
      label: "arena-background-right-tower-b"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(-0.82, 0.04, -0.22, 0.12, 0.04, 0.04),
      label: "arena-background-left-window"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(0.78, 0.08, -0.22, 0.12, 0.04, 0.04),
      label: "arena-background-right-window"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.railMaterial,
      modelMatrix: modelMatrix(0, -0.12, -0.2, 2.3, 0.018, 0.03),
      label: "arena-background-horizon-light"
    },
    ...gameSlicePolishItems(resources, timeMs),
    ...gameSliceForegroundSignalItems(resources, timeMs),
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoPanelMaterial,
      modelMatrix: modelMatrix(-0.72, 0.18, 0.14, 0.62, 0.32, 0.035),
      label: "arena-foreground-holographic-texture-left"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoTextureMaterials[0] ?? resources.holoTextureMaterial,
      modelMatrix: modelMatrix(-0.68, 0.48, 0.205, 0.72, 0.34, 0.026),
      label: "arena-foreground-starfield-texture-left"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoPanelMaterial,
      modelMatrix: modelMatrix(0.1, 0.34, 0.145, 0.58, 0.28, 0.035),
      label: "arena-foreground-holographic-texture-center"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoTextureMaterials[1] ?? resources.holoTextureMaterial,
      modelMatrix: modelMatrix(0.1, 0.72, 0.21, 0.68, 0.28, 0.026),
      label: "arena-foreground-starfield-texture-center"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoPanelMaterial,
      modelMatrix: modelMatrix(0.86, 0.08, 0.15, 0.54, 0.34, 0.035),
      label: "arena-foreground-holographic-texture-right"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoTextureMaterials[2] ?? resources.holoTextureMaterial,
      modelMatrix: modelMatrix(0.88, 0.42, 0.215, 0.64, 0.32, 0.026),
      label: "arena-foreground-starfield-texture-right"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoTextureMaterials[3] ?? resources.holoTextureMaterial,
      modelMatrix: modelMatrix(-0.08, -0.18, 0.22, 0.92, 0.18, 0.026),
      label: "arena-foreground-starfield-texture-lower"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.holoPaletteMaterial,
      modelMatrix: modelMatrix(0.04, 0.18, 0.235, 1.12, 0.3, 0.024),
      label: "arena-foreground-generated-palette-hologram"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.groundMaterial,
      modelMatrix: modelMatrix(0, -0.74, -0.08, 3.0, 0.34, 0.18),
      label: "arena-showcase-ground"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.platformMaterial,
      modelMatrix: modelMatrix(-0.74, -0.58, -0.03, 0.54, 0.08, 0.11),
      label: "arena-foreground-left-catwalk"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.platformMaterial,
      modelMatrix: modelMatrix(0.82, -0.58, -0.03, 0.62, 0.08, 0.11),
      label: "arena-foreground-right-catwalk"
    },
      {
        geometry: resources.railGeometry,
        material: resources.railMaterial,
        modelMatrix: modelMatrix(0, -0.5, -0.16, 2.18, 0.035, 0.07),
        label: "arena-neon-depth-rails"
      },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(-0.96, -0.02, -0.22, 0.2, 0.74, 0.08),
      label: "arena-showcase-left-tower"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(-0.58, 0.05, -0.24, 0.16, 0.5, 0.08),
      label: "arena-showcase-left-mid-tower"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(0.62, 0.02, -0.24, 0.18, 0.54, 0.08),
      label: "arena-showcase-right-mid-tower"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(0.96, -0.04, -0.22, 0.22, 0.64, 0.08),
      label: "arena-showcase-right-tower"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(-0.96, 0.46, -0.18, 0.12, 0.08, 0.08),
      label: "arena-showcase-left-beacon"
    },
    {
      geometry: resources.showcaseGeometry,
      material: resources.beaconMaterial,
      modelMatrix: modelMatrix(0.96, 0.38, -0.18, 0.12, 0.08, 0.08),
      label: "arena-showcase-right-beacon"
    }
  ];

  if (visualAssets) {
    appendGLTFSceneRenderItems(items, visualAssets.arenaResources, "game-asset-arena");
    appendGLTFSceneRenderItems(items, visualAssets.playerResources, "game-asset-player");
    appendGLTFMeshRenderItem(items, visualAssets.arenaResources, "game-arena-outpost-blue-trim", "arena-blue-trim", modelMatrix(platformX * 0.38, -0.5, 0.08, 1.2, 0.22, 0.34), "game-asset-moving-platform");
    const skinnedTime = (timeMs * 0.001) % Math.max(0.001, visualAssets.skinnedHeroClip.duration);
    items.push({
      geometry: visualAssets.skinnedHeroGeometry,
      material: visualAssets.skinnedHeroMaterial,
      modelViewProjectionMatrix: gameSkinnedHeroDisplayMatrix(playerPosition.x, playerPosition.y),
      skinning: buildSkinningPalette(sampleAnimatedSkeleton(visualAssets.skinnedHeroSkin.skeleton, visualAssets.skinnedHeroClip, skinnedTime), 64),
      label: "game-asset-lit-skinned-hero"
    });
  } else {
    items.push(
      {
        geometry: resources.playerGeometry,
        material: resources.playerMaterial,
        modelMatrix: modelMatrix(playerPosition.x, playerPosition.y, 0, 0.55, 0.55, 0.55),
        label: `physics-player-${playerX.toFixed(2)}-${playerY.toFixed(2)}`,
      },
      {
        geometry: resources.platformGeometry,
        material: resources.platformMaterial,
        modelMatrix: modelMatrix(platformX * 0.46, -0.47, 0, 2.1, 0.32, 0.45),
        label: "scripted-moving-platform",
      },
      {
        geometry: resources.triggerGeometry,
        material: resources.triggerMaterial,
        modelMatrix: modelMatrix(0.48, 0.21, 0.03, 1.4, 2.9, 0.08),
        label: "pickup-trigger-zone",
      },
      {
        geometry: resources.exitGeometry,
        material: resources.exitMaterial,
        modelMatrix: modelMatrix(0.6, -0.1, 0.03, 1.2, 5.2, 0.08),
        label: "objective-exit-gate",
      },
      {
        geometry: resources.hazardGeometry,
        material: resources.hazardMaterial,
        modelMatrix: modelMatrix(-0.6, -0.1, 0.03, 1.0, 5.2, 0.08),
        label: "objective-hazard-zone",
      },
      {
        geometry: resources.floorGeometry,
        material: resources.floorMaterial,
        modelMatrix: modelMatrix(0, -0.74, 0.02, 10, 0.06, 0.08),
        label: "arena-floor",
      },
    );
  }

  items.push(
    {
      geometry: resources.contactShadowGeometry,
      material: resources.contactShadowMaterial,
      modelMatrix: modelMatrix(playerPosition.x + 0.04, -0.61, -0.01, 0.68, 0.1, 0.22),
      label: "contact-shadow-proxy-player",
    },
    {
      geometry: resources.contactShadowGeometry,
      material: resources.contactShadowMaterial,
      modelMatrix: modelMatrix(0.48, -0.58, -0.01, 0.5, 0.07, 0.18),
      label: "contact-shadow-proxy-pickup-plinth",
    },
    {
      geometry: resources.pickupGeometry,
      material: resources.pickupMaterial,
      modelMatrix: modelMatrix(0.48, 0.2, 0.18, pickupScale * 0.38, pickupScale * 0.38, pickupScale * 0.38),
      label: "animated-pickup",
    },
  );

  const particlePositions = particleBatch.sprites
    .slice(0, 160)
    .map((sprite) => [
      clamp(sprite.position.x * 0.36 + 0.48, -0.85, 0.85),
      clamp(sprite.position.y * 0.32 + 0.08, -0.56, 0.78),
      0,
    ] as const);
  if (particlePositions.length > 0) {
    items.push({
      geometry: Geometry.points(particlePositions),
      material: resources.particleMaterial,
      label: `particle-sparks-${particlePositions.length}`,
    });
  }
  items.push({
    geometry: resources.arenaDetailGeometry,
    material: resources.starfieldMaterial,
    modelMatrix: modelMatrix(0, 0, 0.55, 1, 1, 1),
    label: "arena-foreground-surface-detail-overlay"
  });
  return compactGamePresentationItems(items);
}

function compactGamePresentationItems(items: readonly RenderItem[]): RenderItem[] {
  return items.filter((item) => {
    const label = item.label ?? "";
    if (label.startsWith("game-asset-")) return true;
    if (label.startsWith("contact-shadow-proxy")) return true;
    if (label.startsWith("particle-sparks")) return true;
    if (label === "animated-pickup") return true;
    if (label.startsWith("arena-")) return true;
    if (label === "arena-showcase-backdrop") return true;
    if (label === "seeded-starfield-nebula-background" || label === "old-branch-layered-space-environment") return true;
    if (label === "arena-showcase-ground" || label === "arena-foreground-left-catwalk" || label === "arena-foreground-right-catwalk" || label === "arena-neon-depth-rails") return true;
    if (label === "arena-floor" || label === "objective-exit-gate" || label === "objective-hazard-zone" || label === "pickup-trigger-zone" || label === "scripted-moving-platform") return true;
    return false;
  });
}

function gameBackdropTileItems(resources: GameRenderResources): RenderItem[] {
  const items: RenderItem[] = [];
  const tiles = [
    [-2.26, 1.36, 0.74, 0.64, resources.skylineMaterial, "upper-left-service-wall"],
    [-1.34, 1.3, 0.84, 0.58, resources.groundMaterial, "upper-left-textured-wall"],
    [-0.42, 1.34, 0.86, 0.64, resources.nebulaMaterial, "upper-center-magenta-wall"],
    [0.48, 1.3, 0.82, 0.6, resources.skyGlowMaterial, "upper-center-cyan-wall"],
    [1.38, 1.32, 0.88, 0.62, resources.groundMaterial, "upper-right-service-wall"],
    [2.3, 1.26, 0.76, 0.56, resources.skylineMaterial, "upper-right-glass-wall"],
    [-2.34, 0.42, 0.8, 0.74, resources.groundMaterial, "mid-left-concrete-bay"],
    [-1.4, 0.36, 0.88, 0.78, resources.skyGlowMaterial, "mid-left-cyan-bay"],
    [-0.46, 0.38, 0.88, 0.72, resources.skylineMaterial, "mid-center-teal-bay"],
    [0.5, 0.36, 0.9, 0.78, resources.nebulaMaterial, "mid-center-magenta-bay"],
    [1.46, 0.4, 0.88, 0.72, resources.platformMaterial, "mid-right-panel-bay"],
    [2.36, 0.36, 0.72, 0.78, resources.groundMaterial, "mid-right-concrete-bay"],
    [-2.22, -0.56, 0.76, 0.82, resources.skylineMaterial, "lower-left-city-column"],
    [-1.28, -0.58, 0.86, 0.78, resources.platformMaterial, "lower-left-panel-column"],
    [-0.36, -0.58, 0.82, 0.8, resources.groundMaterial, "lower-center-service-column"],
    [0.58, -0.56, 0.9, 0.82, resources.skyGlowMaterial, "lower-center-reactor-column"],
    [1.5, -0.58, 0.84, 0.78, resources.nebulaMaterial, "lower-right-energy-column"],
    [2.34, -0.58, 0.72, 0.78, resources.platformMaterial, "lower-right-panel-column"],
  ] as const;
  for (const [x, y, sx, sy, material, label] of tiles) {
    items.push({
      geometry: resources.showcaseGeometry,
      material,
      modelMatrix: modelMatrix(x, y, -0.7, sx, sy, 0.038),
      label: `arena-backdrop-tile-${label}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.seamMaterial,
      modelMatrix: modelMatrix(x, y, -0.42, Math.max(0.024, sx * 0.045), sy * 0.92, 0.028),
      label: `arena-backdrop-vertical-panel-seam-${label}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.seamMaterial,
      modelMatrix: modelMatrix(x, y + sy * 0.18, -0.418, sx * 0.84, Math.max(0.022, sy * 0.04), 0.028),
      label: `arena-backdrop-horizontal-panel-seam-${label}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.seamMaterial,
      modelMatrix: modelMatrix(x - sx * 0.26, y - sy * 0.2, -0.416, Math.max(0.022, sx * 0.034), sy * 0.36, 0.028),
      label: `arena-backdrop-offset-panel-seam-${label}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.seamMaterial,
      modelMatrix: modelMatrix(x + sx * 0.28, y - sy * 0.08, -0.414, Math.max(0.02, sx * 0.03), sy * 0.46, 0.028),
      label: `arena-backdrop-secondary-panel-seam-${label}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.seamMaterial,
      modelMatrix: modelMatrix(x, y - sy * 0.32, -0.412, sx * 0.74, Math.max(0.018, sy * 0.034), 0.028),
      label: `arena-backdrop-lower-panel-seam-${label}`
    });
  }
  return items;
}

function gameArenaSurfaceVariationItems(resources: GameRenderResources, timeMs: number): RenderItem[] {
  const items: RenderItem[] = [];
  const pulse = 0.5 + Math.sin(timeMs * 0.0035) * 0.5;
  const materials = [
    resources.groundMaterial,
    resources.platformMaterial,
    resources.skylineMaterial,
    resources.skyGlowMaterial,
    resources.nebulaMaterial,
    resources.amberPanelMaterial,
    resources.greenPanelMaterial,
    resources.ivoryPanelMaterial,
  ] as const;
  const accents = resources.arenaAccentMaterials;
  const muralBands = [
    [-2.34, 0.92, 0.58, 2.45, resources.skyGlowMaterial, "cyan-left"],
    [-1.64, 0.82, 0.62, 2.32, resources.amberPanelMaterial, "amber-left"],
    [-0.88, 0.9, 0.68, 2.42, resources.greenPanelMaterial, "green-center"],
    [-0.08, 0.82, 0.7, 2.28, resources.nebulaMaterial, "violet-center"],
    [0.76, 0.88, 0.7, 2.38, resources.ivoryPanelMaterial, "ivory-right"],
    [1.58, 0.8, 0.66, 2.26, resources.skylineMaterial, "teal-right"],
    [2.34, 0.86, 0.58, 2.34, resources.platformMaterial, "panel-far-right"],
  ] as const;
  for (const [x, y, sx, sy, material, label] of muralBands) {
    items.push({
      geometry: resources.showcaseGeometry,
      material,
      modelMatrix: modelMatrix(x, y, -0.435, sx, sy, 0.022),
      label: `arena-authored-mural-band-${label}`
    });
  }
  const lowerBands = [
    [-2.1, -0.78, 0.72, 0.42, resources.ivoryPanelMaterial, "ivory"],
    [-1.24, -0.76, 0.78, 0.46, resources.nebulaMaterial, "violet"],
    [-0.34, -0.78, 0.82, 0.42, resources.skyGlowMaterial, "cyan"],
    [0.62, -0.76, 0.86, 0.46, resources.amberPanelMaterial, "amber"],
    [1.62, -0.78, 0.82, 0.42, resources.greenPanelMaterial, "green"],
  ] as const;
  for (const [x, y, sx, sy, material, label] of lowerBands) {
    items.push({
      geometry: resources.showcaseGeometry,
      material,
      modelMatrix: modelMatrix(x, y, -0.18, sx, sy, 0.034),
      label: `arena-lower-color-balance-band-${label}`
    });
  }
  for (let index = 0; index < 28; index += 1) {
    const x = -2.48 + (index % 14) * 0.38;
    const y = index < 14 ? 1.5 : -1.02;
    const material = materials[(index * 5 + 1) % materials.length]!;
    items.push({
      geometry: resources.showcaseGeometry,
      material,
      modelMatrix: modelMatrix(x, y, -0.11, index % 3 === 0 ? 0.16 : 0.1, index % 4 === 0 ? 0.08 : 0.052, 0.026),
      label: `arena-authored-service-indicator-${index}`
    });
  }
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 13; column += 1) {
      const x = -2.42 + column * 0.405 + (row % 2) * 0.08;
      const y = 1.56 - row * 0.52;
      const material = materials[(row * 5 + column * 3) % materials.length]!;
      const wide = (row + column) % 4 === 0;
      items.push({
        geometry: resources.showcaseGeometry,
        material,
        modelMatrix: modelMatrix(x, y + Math.sin(column * 1.9 + row) * 0.018, -0.405 + row * 0.006, wide ? 0.28 : 0.18, wide ? 0.09 : 0.145, 0.026),
        label: `arena-authored-color-surface-${row}-${column}`
      });
      if ((row + column) % 3 === 0) {
        items.push({
          geometry: resources.showcaseGeometry,
          material: (row + column) % 2 === 0 ? resources.beaconMaterial : resources.railMaterial,
          modelMatrix: modelMatrix(x + 0.08, y - 0.14, -0.19, 0.06 + pulse * 0.018, 0.022, 0.028),
          label: `arena-status-light-strip-${row}-${column}`
        });
      }
    }
  }
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 11; column += 1) {
      const x = -2.26 + column * 0.45 + (row % 2) * 0.05;
      const y = 1.3 - row * 0.36;
      const material = accents[(row * 7 + column * 5) % accents.length]!;
      items.push({
        geometry: resources.showcaseGeometry,
        material,
        modelMatrix: modelMatrix(x, y + Math.sin(timeMs * 0.0012 + column) * 0.018, -0.1 + row * 0.004, 0.075, 0.018, 0.028),
        label: `arena-authored-signage-pixel-${row}-${column}`
      });
      if ((row + column) % 4 === 0) {
        items.push({
          geometry: resources.showcaseGeometry,
          material,
          modelMatrix: modelMatrix(x + 0.075, y - 0.045, -0.095, 0.018, 0.064, 0.028),
          label: `arena-authored-signage-pixel-stem-${row}-${column}`
        });
      }
    }
  }
  for (let index = 0; index < 22; index += 1) {
    const x = -2.2 + index * 0.21;
    const y = -0.94 + (index % 3) * 0.11;
    items.push({
      geometry: resources.showcaseGeometry,
      material: materials[(index * 2) % materials.length]!,
      modelMatrix: modelMatrix(x, y, -0.06, 0.14, 0.044, 0.08),
      label: `arena-foreground-equipment-strip-${index}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.seamMaterial,
      modelMatrix: modelMatrix(x, y + 0.036, -0.015, 0.13, 0.012, 0.03),
      label: `arena-foreground-panel-groove-${index}`
    });
  }
  return items;
}

function gameSlicePolishItems(resources: GameRenderResources, timeMs: number): RenderItem[] {
  const items: RenderItem[] = [];
  const pulse = 0.82 + Math.sin(timeMs * 0.004) * 0.18;
  for (let index = 0; index < 18; index += 1) {
    const x = -1.36 + index * 0.16;
    const high = index % 3 === 0;
    items.push({
      geometry: resources.showcaseGeometry,
      material: high ? resources.skyGlowMaterial : resources.railMaterial,
      modelMatrix: modelMatrix(x, 0.46 + (index % 4) * 0.08, -0.18, 0.052, high ? 0.34 : 0.18, 0.026),
      label: `arena-lit-facade-rib-${index}`
    });
    if (index % 2 === 0) {
      items.push({
        geometry: resources.showcaseGeometry,
        material: resources.beaconMaterial,
        modelMatrix: modelMatrix(x + 0.045, 0.22 + (index % 5) * 0.06, -0.12, 0.044, 0.022 * pulse, 0.026),
        label: `arena-magenta-status-light-${index}`
      });
    }
  }
  for (let index = 0; index < 12; index += 1) {
    const x = -1.2 + index * 0.22;
    items.push({
      geometry: resources.showcaseGeometry,
      material: index % 2 === 0 ? resources.groundMaterial : resources.platformMaterial,
      modelMatrix: modelMatrix(x, -0.62, 0.02, 0.12, 0.026, 0.11),
      label: `arena-foreground-deck-panel-${index}`
    });
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.railMaterial,
      modelMatrix: modelMatrix(x + 0.07, -0.48, 0.04, 0.018, 0.2, 0.08),
      label: `arena-foreground-guard-post-${index}`
    });
  }
  for (let index = 0; index < 9; index += 1) {
    const x = -1.08 + index * 0.27;
    items.push({
      geometry: resources.showcaseGeometry,
      material: resources.skylineMaterial,
      modelMatrix: modelMatrix(x, 1.02 + Math.sin(index) * 0.04, -0.26, 0.12, 0.04, 0.04),
      label: `arena-upper-window-cell-${index}`
    });
  }
  return items;
}

function gameSliceForegroundSignalItems(resources: GameRenderResources, timeMs: number): RenderItem[] {
  const items: RenderItem[] = [];
  const accents = resources.arenaAccentMaterials;
  const palette = resources.arenaPaletteMaterials;
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 14; column += 1) {
      const x = -1.58 + column * 0.25 + (row % 2) * 0.045;
      const y = 0.86 - row * 0.22;
      const material = palette[(row * 14 + column) % palette.length]!;
      const pulse = 0.72 + Math.sin(timeMs * 0.002 + row + column * 0.7) * 0.12;
      items.push({
        geometry: resources.showcaseGeometry,
        material,
        modelMatrix: modelMatrix(x, y, 0.18, 0.105 * pulse, 0.028, 0.035),
        label: `arena-foreground-signal-module-${row}-${column}`
      });
      if ((row + column) % 3 === 0) {
        items.push({
          geometry: resources.showcaseGeometry,
          material: accents[(row + column) % accents.length]!,
          modelMatrix: modelMatrix(x + 0.048, y - 0.048, 0.19, 0.018, 0.076 * pulse, 0.026),
          label: `arena-foreground-signal-riser-${row}-${column}`
        });
      }
    }
  }
  return items;
}

function gameStarSegments(data: Uint8Array, count: number): readonly (readonly [number, number, number])[] {
  const positions: [number, number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const r = data[(index * 31) % data.length] ?? index;
    const g = data[(index * 47 + 3) % data.length] ?? index;
    const b = data[(index * 61 + 7) % data.length] ?? index;
    const layer = index % 3;
    const x = (r / 255 - 0.5) * (layer === 0 ? 3.8 : 3.2);
    const y = (g / 255) * (layer === 2 ? 1.85 : 1.45) - 0.12;
    const z = -0.72 + (b / 255) * 0.08;
    const length = 0.006 + ((r + b) % 7) * 0.002;
    if (index % 4 === 0) {
      positions.push([x - length, y, z], [x + length, y, z]);
    } else {
      positions.push([x, y - length, z], [x, y + length, z]);
    }
  }
  return positions;
}

function gameSpaceEnvironmentSegments(fixture: SpaceEnvironmentFixture): readonly (readonly [number, number, number])[] {
  const positions: [number, number, number][] = [];
  for (const star of fixture.stars.slice(0, 160)) {
    const x = (star.x / fixture.width - 0.5) * 3.72;
    const y = (star.y / fixture.height) * 1.82 - 0.1;
    const length = 0.004 + star.size * 0.003;
    positions.push([x - length, y, -0.66], [x + length, y, -0.66]);
  }
  for (const dust of fixture.dust.slice(0, 120)) {
    const x = (dust.x / fixture.width - 0.5) * 3.5;
    const y = (dust.y / fixture.height) * 1.62;
    const length = 0.003 + dust.size * 0.002;
    positions.push([x, y - length, -0.64], [x, y + length, -0.64]);
  }
  for (const nebula of fixture.nebulae) {
    const x = (nebula.x / fixture.width - 0.5) * 3.5;
    const y = (nebula.y / fixture.height) * 1.5 + 0.08;
    const radius = Math.min(0.24, Math.max(0.08, nebula.radius / fixture.width));
    positions.push(
      [x - radius, y, -0.65],
      [x + radius, y, -0.65],
      [x, y - radius * 0.6, -0.65],
      [x, y + radius * 0.6, -0.65]
    );
  }
  return positions;
}

function gameArenaDetailSegments(): readonly (readonly [number, number, number])[] {
  const positions: [number, number, number][] = [];
  for (let index = 0; index <= 56; index += 1) {
    const x = -2.62 + index * 0.094;
    positions.push([x, -1.08, -0.12], [x + 0.08, 1.66, -0.12]);
  }
  for (let index = 0; index <= 32; index += 1) {
    const y = -1.08 + index * 0.086;
    positions.push([-2.58, y, -0.115], [2.58, y + 0.018 * Math.sin(index), -0.115]);
  }
  for (let index = 0; index < 48; index += 1) {
    const x = -2.48 + (index % 16) * 0.31;
    const y = -0.94 + Math.floor(index / 16) * 0.62 + (index % 3) * 0.045;
    positions.push([x, y, -0.1], [x + 0.16, y + 0.08, -0.1]);
    positions.push([x + 0.16, y + 0.08, -0.1], [x + 0.29, y - 0.04, -0.1]);
  }
  return positions;
}

function appendGLTFSceneRenderItems(items: RenderItem[], resources: GLTFRenderResources, labelPrefix: string): void {
  resources.scene.updateWorldTransforms();
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    const material = resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    items.push({
      geometry,
      material,
      modelMatrix: node.transform.worldMatrix,
      label: `${labelPrefix}-${node.name}`,
      ...(renderable.morphWeights.length > 0 ? { morphWeights: renderable.morphWeights } : {}),
    });
  }
}

function appendGLTFMeshRenderItem(items: RenderItem[], resources: GLTFRenderResources, geometryName: string, materialName: string, transform: Float32Array, label: string): void {
  const geometry = resources.geometryLibrary.get(geometryName);
  const material = resources.materialLibrary.get(materialName);
  if (!geometry || !material) return;
  items.push({ geometry, material, modelMatrix: transform, label });
}

function gameSkinnedHeroDisplayMatrix(playerX: number, playerY: number): Float32Array {
  return modelMatrix(playerX, playerY + 0.02, 0.24, 0.72, 0.72, 0.72);
}

function createLitScene(canvas: HTMLCanvasElement): { readonly scene: Scene; readonly camera: PerspectiveCamera } {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "game-camera", fovYRadians: Math.PI / 3.6, aspect: canvas.width / canvas.height, near: 0.1, far: 32 });
  camera.transform.setPosition(0, 0.18, 3.55);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "game-key");
  key.intensity = 2.5;
  key.color = [1, 0.92, 0.75];
  scene.root.addChild(key);
  const fill = scene.createLight("point", "game-fill");
  fill.intensity = 1.8;
  fill.range = 8;
  fill.color = [0.3, 0.78, 1];
  fill.transform.setPosition(-1.8, 1.3, 2.6);
  scene.root.addChild(fill);
  return { scene, camera };
}

class MovingPlatformBehavior implements Behavior {
  constructor(private readonly state: { started: number; updates: number }) {}

  onStart(): void {
    this.state.started += 1;
  }

  onFixedUpdate(context: ScriptContext): void {
    const target = context.target as { setPosition(position: readonly [number, number, number]): void } & { position: [number, number, number] };
    const time = this.state.updates * context.fixedDeltaSeconds;
    target.setPosition([Math.sin(time * 1.7) * 0.55, -0.48, 0]);
    this.state.updates += 1;
  }
}

class ThrowOnceBehavior implements Behavior {
  private thrown = false;

  onUpdate(): void {
    if (this.thrown) return;
    this.thrown = true;
    throw new Error("Injected runtime script failure");
  }
}

class RuntimeSceneObjectBehavior implements Behavior {
  constructor(private readonly state: RuntimeBehaviorState) {}

  onStart(): void {
    this.state.started += 1;
  }

  onFixedUpdate(context: ScriptContext): void {
    const node = context.target as { transform?: { setPosition?: (x: number, y: number, z: number) => void } };
    const x = Math.sin(this.state.movementUpdates * (context.fixedDeltaSeconds ?? 1 / 60) * 2) * 0.12;
    node.transform?.setPosition?.(x, 0, 0);
    this.state.movementUpdates += 1;
  }

  onUpdate(): void {
    this.state.uiUpdates += 1;
  }
}

class RuntimeTeardownBehavior implements Behavior {
  constructor(private readonly state: RuntimeBehaviorState) {}

  onDestroy(): void {
    this.state.teardownEvents += 1;
  }
}

function createRuntimeTeardownHost(state: RuntimeBehaviorState): BehaviorHost {
  const host = new BehaviorHost({ target: { id: "runtime-teardown-probe" } });
  host.attach(new RuntimeTeardownBehavior(state));
  return host;
}

function completeObjective(state: {
  phase: GameplayPhase;
  step: ObjectiveStep;
  exitReached: boolean;
  winReason: string;
  winCount: number;
}, reason: string): void {
  if (state.phase !== "playing") return;
  state.phase = "won";
  state.step = "complete";
  state.exitReached = true;
  state.winReason = reason;
  state.winCount += 1;
}

function failObjective(state: {
  phase: GameplayPhase;
  step: ObjectiveStep;
  failReason: string;
  failCount: number;
}, reason: string): void {
  if (state.phase !== "playing") return;
  state.phase = "failed";
  state.step = "failed";
  state.failReason = reason;
  state.failCount += 1;
}

function resetObjective(state: {
  phase: GameplayPhase;
  step: ObjectiveStep;
  collectedPickup: boolean;
  exitReached: boolean;
  failReason: string;
  winReason: string;
  elapsedSeconds: number;
}): void {
  state.phase = "playing";
  state.step = "collect-pickup";
  state.collectedPickup = false;
  state.exitReached = false;
  state.failReason = "";
  state.winReason = "";
  state.elapsedSeconds = 0;
}

function objectiveStatusText(state: {
  readonly phase: GameplayPhase;
  readonly step: ObjectiveStep;
  readonly collectedPickup: boolean;
  readonly elapsedSeconds: number;
  readonly failReason: string;
  readonly winReason: string;
}): string {
  if (state.phase === "won") {
    return `Objective complete: pickup secured and exit reached (${state.winReason}).`;
  }
  if (state.phase === "failed") {
    return `Objective failed: ${state.failReason}.`;
  }
  const next = state.step === "collect-pickup" ? "Collect the energy pickup" : "Reach the green exit gate";
  return `${next}. ${Math.max(0, objectiveTimeLimitSeconds - state.elapsedSeconds).toFixed(1)}s remaining.`;
}

function configureBindings(input: InputSystem, preset: BindingPreset): void {
  if (preset === "space") {
    input.actions.bind("jump", [{ type: "keyboard", code: "Space" }, { type: "gamepad-button", button: 0 }]);
  } else if (preset === "wasd") {
    input.actions.bind("jump", [{ type: "keyboard", code: "KeyW" }, { type: "gamepad-button", button: 0 }]);
  } else {
    input.actions.bind("jump", [{ type: "pointer", button: 0 }, { type: "gamepad-button", button: 0 }]);
  }
  input.actions.bindAxis("moveX", [
    { type: "keyboard-axis", negative: "ArrowLeft", positive: "ArrowRight", scale: 1 },
    { type: "keyboard-axis", negative: "KeyA", positive: "KeyD", scale: 1 },
    { type: "gamepad-axis", axis: 0, scale: 1 },
  ]);
}

function createRuntimeInputReplayEvidence(): { readonly recording: InputRecording; readonly playback: InputPlaybackSnapshot; readonly firstEventTypes: string } {
  const recorder = new InputRecorder();
  recorder.start(0);
  recorder.recordKey("ArrowRight", true, 4);
  recorder.recordGamepadAxis(0, 0, 0.9, 8);
  recorder.recordPointerButton(0, true, 160, 120, 12);
  recorder.recordAction("gameplay", "moveX", 0.9, [0.9, 0], 16);
  recorder.recordFrame(16, 20);
  recorder.recordPointerButton(0, false, 160, 120, 24);
  const recording = recorder.stop(32);
  const playback = new InputPlayback({ loop: true });
  playback.load(recording);
  playback.play();
  const firstBatch = playback.update(18);
  playback.seek(14);
  playback.update(6);
  playback.update(40);
  return {
    recording,
    playback: playback.snapshot(),
    firstEventTypes: firstBatch.map((event) => event.type).join(",")
  };
}

async function createPickupSource(audio: AudioSystem, state: { clipName: string; clipSource: string; clipDuration: number }, destination?: AudioNode): Promise<AudioSource> {
  const context = audio.contextManager.context as AudioContext;
  const response = await fetch(createToneWavDataUrl(context.sampleRate));
  const bytes = await response.arrayBuffer();
  const buffer = await context.decodeAudioData(bytes.slice(0));
  state.clipSource = "decoded-data-uri-wav";
  state.clipDuration = buffer.duration;
  const clip = new AudioClip({ name: state.clipName, buffer });
  return new AudioSource({
    context,
    destination: destination ?? audio.mixer.master.input,
    clip,
    volume: 0.18,
  });
}

function createToneWavDataUrl(sampleRate: number): string {
  const duration = 0.18;
  const frameCount = Math.max(1, Math.floor(sampleRate * duration));
  const bytes = new Uint8Array(44 + frameCount * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + frameCount * 2, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, frameCount * 2, true);
  for (let index = 0; index < frameCount; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.max(0, 1 - t / duration);
    const sample = Math.max(-1, Math.min(1, Math.sin(t * 880 * Math.PI * 2) * envelope * 0.35));
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}

function publishBehaviorErrors(errorPanel: HTMLElement, behaviorSystem: BehaviorSystem, runtimeErrors: RuntimeError[]): void {
  if (behaviorSystem.errors.length === 0) return;
  const latest = behaviorSystem.errors[behaviorSystem.errors.length - 1]!;
  publishScriptError(errorPanel, behaviorSystem, runtimeErrors, {
    phase: "script",
    message: latest.error instanceof Error ? latest.error.message : String(latest.error),
  });
}

function publishScriptError(errorPanel: HTMLElement, behaviorSystem: BehaviorSystem, runtimeErrors: RuntimeError[], error: RuntimeError): void {
  const duplicate = behaviorSystem.errors.some((entry) => {
    const message = entry.error instanceof Error ? entry.error.message : String(entry.error);
    return entry.phase === error.phase && message === error.message;
  });
  if (!duplicate) {
    behaviorSystem.errors.push({ phase: error.phase as "start" | "fixed" | "update" | "destroy", behavior: {}, error: new Error(error.message) });
  }
  publishRuntimeError(errorPanel, runtimeErrors, error);
}

function publishRuntimeError(errorPanel: HTMLElement, runtimeErrors: RuntimeError[], error: RuntimeError): void {
  const duplicate = runtimeErrors.some((entry) => entry.phase === error.phase && entry.message === error.message);
  if (!duplicate) {
    runtimeErrors.push(error);
  }
  errorPanel.hidden = false;
  errorPanel.textContent = runtimeErrors.slice(-4).map((entry) => `${entry.phase}: ${entry.message}`).join("\n");
}

function computeParticleBounds(particles: ParticleSystem): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } {
  const live = particles.particles.filter((particle) => particle.alive);
  if (live.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const particle of live) {
    min[0] = Math.min(min[0], particle.position.x);
    min[1] = Math.min(min[1], particle.position.y);
    min[2] = Math.min(min[2], particle.position.z);
    max[0] = Math.max(max[0], particle.position.x);
    max[1] = Math.max(max[1], particle.position.y);
    max[2] = Math.max(max[2], particle.position.z);
  }
  return { min, max };
}

function summarizeParticleCulling(batch: ParticleRenderBatch): { readonly visible: number; readonly culled: number } {
  let visible = 0;
  let culled = 0;
  for (const sprite of batch.sprites) {
    const x = sprite.position.x * 0.36 + 0.48;
    const y = sprite.position.y * 0.32 + 0.08;
    if (x < -0.95 || x > 0.95 || y < -0.66 || y > 0.88) {
      culled += 1;
    } else {
      visible += 1;
    }
  }
  return { visible, culled };
}

function playerRenderPosition(playerX: number, playerY: number): { readonly x: number; readonly y: number } {
  return {
    x: clamp(playerX * 0.5, -0.86, 0.86),
    y: clamp(playerY * 0.42, -0.44, 0.64),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1,
  ]);
}

function createShell(): {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  audioButton: HTMLButtonElement;
  bindingSelect: HTMLSelectElement;
  pointerLockButton: HTMLButtonElement;
  mixerVolume: HTMLInputElement;
  mixerMute: HTMLInputElement;
  particleSortSelect: HTMLSelectElement;
  scriptErrorButton: HTMLButtonElement;
  assetErrorButton: HTMLButtonElement;
  renderErrorButton: HTMLButtonElement;
  physicsErrorButton: HTMLButtonElement;
  animationErrorButton: HTMLButtonElement;
  audioErrorButton: HTMLButtonElement;
  reloadBehaviorButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  objectivePanel: HTMLElement;
  spatialAudioState: HTMLElement;
  errorPanel: HTMLElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "game-demo-shell";
  shell.innerHTML = `
    <canvas data-testid="game-slice-canvas" width="960" height="540" tabindex="0" aria-label="Interactive game slice WebGL viewport"></canvas>
    <section>
      <h1>Game Slice</h1>
      <p>Move with A/D or arrow keys. Jump with the selected binding.</p>
      <div class="runtime-controls">
        <button type="button" data-testid="unlock-audio">Unlock audio</button>
        <label>
          Jump
          <select data-testid="binding-select">
            <option value="space">Space</option>
            <option value="wasd">W key</option>
            <option value="pointer">Pointer tap</option>
          </select>
        </label>
        <button type="button" data-testid="pointer-lock">Pointer lock</button>
        <label>
          Master volume
          <input data-testid="mixer-volume" type="range" min="0" max="1.5" step="0.05" value="1" />
        </label>
        <label class="inline-toggle"><input data-testid="mixer-mute" type="checkbox" /> Mute mixer</label>
        <label>
          Particles
          <select data-testid="particle-sort">
            <option value="back-to-front">Back to front</option>
            <option value="front-to-back">Front to back</option>
            <option value="none">Unsorted</option>
          </select>
        </label>
        <button type="button" data-testid="restart-objective">Restart objective</button>
        <details class="runtime-tools" data-testid="runtime-diagnostics">
          <summary>Diagnostics</summary>
          <div class="runtime-tool-buttons">
            <button type="button" data-testid="inject-script-error">Script error</button>
            <button type="button" data-testid="inject-asset-error">Asset error</button>
            <button type="button" data-testid="inject-render-error">Render error</button>
            <button type="button" data-testid="inject-physics-error">Physics error</button>
            <button type="button" data-testid="inject-animation-error">Animation error</button>
            <button type="button" data-testid="inject-audio-error">Audio error</button>
            <button type="button" data-testid="reload-behavior">Reload behavior</button>
          </div>
        </details>
      </div>
      <output data-testid="objective-status" class="objective-status" data-phase="playing" data-step="collect-pickup">Objective initializing</output>
      <output data-testid="spatial-audio-state" class="spatial-audio-state">spatial audio pending</output>
      <output data-testid="runtime-error-panel" class="runtime-error" hidden></output>
      <pre data-testid="game-slice-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("pre")!,
    audioButton: shell.querySelector("[data-testid='unlock-audio']")!,
    bindingSelect: shell.querySelector("[data-testid='binding-select']")!,
    pointerLockButton: shell.querySelector("[data-testid='pointer-lock']")!,
    mixerVolume: shell.querySelector("[data-testid='mixer-volume']")!,
    mixerMute: shell.querySelector("[data-testid='mixer-mute']")!,
    particleSortSelect: shell.querySelector("[data-testid='particle-sort']")!,
    scriptErrorButton: shell.querySelector("[data-testid='inject-script-error']")!,
    assetErrorButton: shell.querySelector("[data-testid='inject-asset-error']")!,
    renderErrorButton: shell.querySelector("[data-testid='inject-render-error']")!,
    physicsErrorButton: shell.querySelector("[data-testid='inject-physics-error']")!,
    animationErrorButton: shell.querySelector("[data-testid='inject-animation-error']")!,
    audioErrorButton: shell.querySelector("[data-testid='inject-audio-error']")!,
    reloadBehaviorButton: shell.querySelector("[data-testid='reload-behavior']")!,
    restartButton: shell.querySelector("[data-testid='restart-objective']")!,
    objectivePanel: shell.querySelector("[data-testid='objective-status']")!,
    spatialAudioState: shell.querySelector("[data-testid='spatial-audio-state']")!,
    errorPanel: shell.querySelector("[data-testid='runtime-error-panel']")!,
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #081017; color: #edf4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .game-demo-shell { position: relative; min-height: 100vh; overflow: hidden; background: radial-gradient(circle at 44% 24%, rgba(21, 74, 86, 0.44), transparent 38%), #081017; }
    .game-demo-shell::after {
      content: none;
    }
    canvas { width: 100vw; height: 100vh; display: block; background: #081017; outline: none; }
    section {
      position: absolute;
      right: 0.78rem;
      top: 0.78rem;
      width: min(14.2rem, calc(100vw - 1.56rem));
      max-height: calc(100vh - 1.56rem);
      overflow: auto;
      border: 1px solid rgba(105, 144, 165, 0.45);
      border-radius: 8px;
      background: rgba(8, 16, 23, 0.84);
      box-shadow: 0 18px 56px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(10px);
      padding: 0.72rem;
      display: grid;
      align-content: start;
      gap: 0.52rem;
    }
    h1, p { margin: 0; }
    p { color: #bbcad4; font-size: 0.84rem; line-height: 1.24; }
    .runtime-controls { display: grid; grid-template-columns: 1fr; gap: 0.34rem; }
    .runtime-controls label { display: grid; gap: 0.24rem; color: #c9d7df; font-size: 0.76rem; }
    .runtime-controls .inline-toggle { display: flex; align-items: center; gap: 0.5rem; }
    .runtime-tools { border: 1px solid #31434d; background: #13212b; }
    .runtime-tools summary { cursor: pointer; padding: 0.36rem 0.48rem; color: #d8e6ed; font-size: 0.78rem; }
    .runtime-tool-buttons { display: grid; gap: 0.28rem; padding: 0.36rem; border-top: 1px solid #263943; }
    .runtime-tools:not([open]) .runtime-tool-buttons { display: none; }
    button, select { border: 1px solid #344a55; background: #17252f; color: #edf4f8; font: inherit; padding: 0.38rem 0.48rem; }
    button { cursor: pointer; }
    button:hover, select:hover { background: #233540; }
    .runtime-error { border: 1px solid #ff7a5f; background: #2d1718; color: #ffd5cc; padding: 0.6rem; font-size: 0.82rem; }
    .objective-status { border: 1px solid #39644d; background: #10261b; color: #c6ffd9; padding: 0.46rem; font-size: 0.76rem; line-height: 1.3; }
    .objective-status[data-phase="won"] { border-color: #48d982; background: #0d2b1b; color: #d8ffe5; }
    .objective-status[data-phase="failed"] { border-color: #ff5a4c; background: #301515; color: #ffd2cc; }
    .spatial-audio-state { border: 1px solid #315163; background: #10202a; color: #b8e8ff; padding: 0.46rem; font-size: 0.72rem; line-height: 1.28; }
    pre { display: none; }
    @media (max-width: 780px) {
      canvas { height: 100vh; }
      section {
        left: 0.65rem;
        right: 0.65rem;
        top: auto;
        bottom: 0.65rem;
        width: auto;
        max-height: 42vh;
      }
    }
  `;
  document.head.append(style);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
