// apps/showcase-gravity-post/src/v2/boot.ts — QR-14 rebuild shell (T2.1-T2.6).
// Runs only under `?a3d-qr=route-gravity-post` / env A3D_QR_ROUTE_GRAVITY_POST.
// Full createGame port of the four-delivery courier shift: authored arcade
// gravity around six wells, Rapier kinematic pod + dock sensors for real
// trigger-driven captures, prediction beads vs flown-path truth, the §6.9.13
// orbit board rig, and the skippable flyby beats. Gameplay modules
// (contracts/pod/wells/prediction/scoring/flyby/stations/freightway) are
// imported, not modified; audio plays through the legacy cue controller on
// admitted sfx ids until C-25 lands (stand-in R-14-15).
import { game as engineGame, scene, type AuraCameraPose, type GameInputController } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { CONTRACTS, WELL_BODIES, stationById, stationPosition } from "../gameplay/contracts";
import { createFlybyState, flybyBody, requestFlyby, skipFlyby, updateFlyby } from "../gameplay/flyby";
import {
  ADRIFT_LIMIT_SECONDS,
  DOCK_SENSOR_RADIUS,
  applyCorrection,
  createPodRuntime,
  evaluateCapture,
  launch,
  resetPodForContract,
  updateCoast,
  type PodEvent,
  type PodRuntimeState
} from "../gameplay/pod";
import {
  PREDICTION_DIVERGENCE_TOLERANCE,
  PREDICTION_MAX_STEPS,
  buildPredictionBeads
} from "../gameplay/prediction";
import { SHIFT_FAIL_LIMIT, scoreContract, type ScoreBreakdown } from "../gameplay/scoring";
import { POD_BODY_SPEC, PLAY_PLANE_Y, buildStations } from "../gameplay/stations";
import { FIXED_DT, dockPointHash, integratePath, type TrajectorySample } from "../gameplay/wells";
import { createGravityPostAudio } from "../legacy/post-audio";
import direction from "../../art/direction";
import { gravityWorldNodes, ACTUAL_PATH_BEADS, FLYBY_DRONES, PREDICTION_BEADS, SPARK_COUNT, TRAIL_STREAKS } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createGravityRig, fallbackCameraNode } from "./scene/camera";
import { wireGravityFx } from "./scene/fx";
import { SPACE_BG } from "./scene/materials";
import { publishGravityEvidence, type GravityRunSnapshot, type LaunchedBy } from "./evidence";
import { applyGravityScenario } from "./scenarios";
import { createGravityCtx } from "./state";
import { createPostAudioBlock } from "./audio";
import { createGravityInput, wireGravityAim } from "./input";
import { wireGravityContracts } from "./contracts";
import { wireGravityPrediction } from "./prediction";
import { wireGravitySync } from "./sync";
import { wireGravityHud } from "./hud";
import { wireGravityUpdate } from "./update";

const ROUTE_FLAG = "A3D_QR_ROUTE_GRAVITY_POST" as const;
const MAX_LAUNCH_SPEED = 2.85;
const MIN_LAUNCH_POWER = 0.18;
const AIM_DRAG_PIXEL_RANGE = 190;
const KEYBOARD_AIM_RATE = 1.05;
const KEYBOARD_POWER_RATE = 0.5;
const KEYBOARD_MIN_POWER = 0.08;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";

// ------------------------------------------------------------ sim state -----

const ctx = createGravityCtx(autopilotRequested);
const sceneSwaps = 0;
const bootedAtMs = performance.now();

const contract = () => CONTRACTS[ctx.contractIndex]!;
const originStation = () => ctx.stations.find((candidate) => candidate.id === contract().originStationId)!;
const destinationStation = () => ctx.stations.find((candidate) => candidate.id === contract().destinationStationId)!;

function stationWorld(id: string): { readonly x: number; readonly z: number } {
  const spec = stationById(id);
  const position = stationPosition(spec);
  return { x: position[0], z: position[1] };
}

const world = gravityWorldNodes();

function buildScene() {
  return scene()
    .background(SPACE_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ------------------------------------------------------------------ audio ---

const audioBlock = createPostAudioBlock();
const { audio, audioCueLog, pushCue, unlockAudio } = audioBlock;

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-gravity-post",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.16,
    widgets: [
      { id: "contract", kind: "label", anchor: "top", label: "DISPATCH" },
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "fuel", kind: "gauge", anchor: "top-right", label: "PROPELLANT" },
      { id: "status", kind: "label", anchor: "bottom", label: "STATUS" },
      { id: "speed", kind: "label", anchor: "bottom-left", label: "SPEED" },
      { id: "tokens", kind: "label", anchor: "bottom-right", label: "TOKENS" }
    ]
  },
  touch: {
    preset: "aim-drag",
    bindings: {
      aim: "drag",
      launch: "release-drag",
      warp: "hold",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      "launch": { asset: "gravityPostLaunchWhooshSfx" },
      "burn": { asset: "gravityPostBurnLoopSfx" },
      "dock": { asset: "gravityPostDockLockSfx" },
      "bounce": { asset: "gravityPostBounceOffSfx" },
      "ctx.pod-lost": { asset: "gravityPostPodLostSfx" },
      "contract-clear": { asset: "gravityPostContractClearSfx" },
      "assist": { asset: "gravityPostAssistChimeSfx" },
      "warp": { asset: "gravityPostWarpHumSfx" },
      "ui-confirm": { asset: "gravityPostUiConfirmSfx" },
      "ambient": { asset: "gravityPostAmbientSpaceSfx" }
    }
  },
  juice: {
    "launch": { trauma: 0.1 },
    "dock-clamp": { hitStopMs: 35, trauma: 0.12 },
    "delivery": { hitStopMs: 40, trauma: 0.18 },
    "ctx.pod-lost": { hitStopMs: 60, trauma: 0.3 },
    "assist": { trauma: 0.06 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_gravity_post` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-gravity-post`).
    flags: ["route_gravity_post", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireGravityFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- physics ------
// Rapier witness world: one dynamic pod proxy driven by the authored
// integrator + one static sensor sphere per station. Real overlap events
// (sensor begin) dispatch the dock capture/bounce path — same rule as the
// legacy app.physics sensor layer, routed through collisionWorld.
const POD_PROXY_ID = "mail-ctx.pod-body";
const collisionWorld = engineGame.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });
const dockSensorIds = new Set<string>();

function buildCollisions(): void {
  collisionWorld.clear();
  const proxy = collisionWorld.add({
    id: POD_PROXY_ID,
    type: "dynamic",
    position: [ctx.pod.kinematic.position[0], PLAY_PLANE_Y, ctx.pod.kinematic.position[1]],
    shape: { kind: "sphere", radius: POD_BODY_SPEC.radius }
  });
  ctx.podProxyId = proxy.id;
  for (const station of ctx.stations) {
    const sensor = collisionWorld.add({
      id: station.sensorBodyName,
      type: "static",
      position: [station.x, PLAY_PLANE_Y, station.z],
      shape: { kind: "sphere", radius: station.dockRadius },
      sensor: true
    });
    dockSensorIds.add(sensor.id);
  }
}
buildCollisions();


// ------------------------------------------------------------- input ---------

const input = createGravityInput();
const aim = wireGravityAim(ctx, {
  game, input, unlockAudio, originStation, destinationStation,
  launchWithPrediction: (dir, speed, by) => launchWithPrediction(dir, speed, by)
});
const { resetKeyboardAim, currentAimVector, steerKeyboardAim, launchActiveAim } = aim;

// -------------------------------------------------- events + contracts ------

const rigState = { podX: ctx.pod.kinematic.position[0], podZ: ctx.pod.kinematic.position[1], inFlight: false };

const contractsFlow = wireGravityContracts(ctx, {
  game, pushCue, fx, contract, stationWorld,
  resetPredictionTelemetry: () => resetPredictionTelemetry(),
  resetKeyboardAim,
  hidePrediction: () => hidePrediction()
});
const { emitPodEvents, registerFail, handleDock, resetCampaign, nextContract, retryContract } = contractsFlow;

// ----------------------------------------------------- prediction lines -----

const prediction = wireGravityPrediction(ctx, {
  handle, contract, emitPodEvents, currentAimVector
});
const { resetPredictionTelemetry, launchWithPrediction, recordActualPath, syncActualPath,
        samplePredictionDivergence, updatePrediction, syncLaunchPredictionPath, hidePrediction } = prediction;

// ---------------------------------------------------------- visual sync -----

const sync = wireGravitySync(ctx, { handle, world, fx, rigState, reducedMotion, contract, destinationStation, stationWorld });
const { syncPodVisual, syncStationPulses, syncSparks, syncFlybyDrones } = sync;

// ------------------------------------------------------------------ HUD ------

const hud = wireGravityHud(ctx, { game, contract });
const { syncHud } = hud;
const update = wireGravityUpdate(ctx, {
  game, input, pushCue, contract, collisionWorld, dockSensorIds, reducedMotion, rigState,
  contracts: contractsFlow, prediction, sync, aim, hud
});
const { updateGameplay } = update;

// ------------------------------------------------------------- tick ----------


// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = {
  ...lookManifest(game.lookSource()),
  id: direction.id,
  genre: direction.genre,
  rig: "gravity-post.orbit",
  fov: 46,
  background: SPACE_BG,
  hdri: "data_galaxy_deep_space_1k",
  palette: direction.palette,
  signatureEffect: direction.signatureEffect
};

const runSnapshot = (): GravityRunSnapshot => ({
  contractIndex: ctx.contractIndex,
  contract: contract(),
  pod: ctx.pod,
  score: ctx.score,
  failedContracts: ctx.failedContracts,
  completedContracts: ctx.completedContracts,
  shiftOver: ctx.shiftOver,
  campaignComplete: ctx.campaignComplete,
  paused: ctx.paused,
  aiming: ctx.aiming,
  warping: ctx.warpActive,
  launchedBy: ctx.launchedBy,
  lastScoreCard: ctx.lastScoreCard,
  lastFailReason: ctx.lastFailReason,
  dockEventCount: ctx.dockEventCount,
  dockEvents: ctx.dockEventLog.map((record) => record.stationId + ":" + record.kind),
  flybyBeatsRun: ctx.flyby.beatsRun,
  flybyActive: ctx.flyby.active,
  visitedFlybys: [...ctx.flyby.visited],
  predictionSteps: ctx.predictionSteps,
  predictionComparedSamples: ctx.predictionComparedSamples,
  predictionMaxDivergence: ctx.predictionMaxDivergence,
  predictionTolerance: PREDICTION_DIVERGENCE_TOLERANCE,
  actualPathPoints: ctx.actualPath.length
});

publishGravityEvidence({
  game,
  run: runSnapshot,
  stations: () => ctx.stations,
  lastRigPose: () => game.app.camera?.evidence?.().pose ?? null,
  sceneSwaps: () => sceneSwaps,
  appliedLook,
  frameCount: () => ctx.frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const scenarioParam = routeParams.get("scenario");
if (scenarioParam) {
  applyGravityScenario(scenarioParam, {
    loadContract: (index) => {
      ctx.contractIndex = Math.min(Math.max(0, index), CONTRACTS.length - 1);
      ctx.lastScoreCard = null;
      ctx.launchedBy = null;
      resetPodForContract(ctx.pod, contract());
      resetPredictionTelemetry();
      resetKeyboardAim();
    },
    launchKeyboardAim: () => {
      launchActiveAim("keyboard");
    }
  });
}

// ------------------------------------------------------------------- boot ----

game.app.onFrame?.(({ dt: rawDt }) => {
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  updateGameplay(Math.min(0.05, Math.max(0.001, frameDt)));
});

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createGravityRig(rigState), { blend: 0.4 });
  // C-05 output: deep-space grade; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "space",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return ctx.frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
