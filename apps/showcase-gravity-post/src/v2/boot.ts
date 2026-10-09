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

const stations = buildStations();
const pod: PodRuntimeState = createPodRuntime(CONTRACTS[0]!.originStationId, CONTRACTS[0]!.tuning.strengthScale);
const flyby = createFlybyState();

let contractIndex = 0;
let score = 0;
let failedContracts = 0;
let completedContracts = 0;
let shiftOver = false;
let campaignComplete = false;
let paused = false;
let aiming = false;
let warpActive = false;
let frame = 0;
let predictionSteps = 0;
let launchPrediction: readonly TrajectorySample[] = [];
let predictionComparedSamples = 0;
let predictionMaxDivergence = 0;
let launchedBy: LaunchedBy = null;
let lastDockHash: number | null = null;
let lastScoreCard: ScoreBreakdown | null = null;
let lastFailReason: string | null = null;
let lostCooldownSeconds = 0;
let sparkLife = 0;
let touchWarp = false;
let autopilotEnabled = autopilotRequested;
let autopilotFiredAt = -1;
const sceneSwaps = 0;
const bootedAtMs = performance.now();
const actualPath: Array<readonly [number, number]> = [];
const sparkDirections = Array.from({ length: SPARK_COUNT }, (_, index) => {
  const angle = (index / SPARK_COUNT) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const aimStart = { x: 0, y: 0 };
const aimCurrent = { x: 0, y: 0 };

const contract = () => CONTRACTS[contractIndex]!;
const originStation = () => stations.find((candidate) => candidate.id === contract().originStationId)!;
const destinationStation = () => stations.find((candidate) => candidate.id === contract().destinationStationId)!;

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

const audio = createGravityPostAudio();
const audioCueLog: string[] = [];
function pushCue(cue: Parameters<typeof audio.play>[0]): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  audio.play(cue);
}
const unlockAudio = () => void audio.unlock();
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

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
      "pod-lost": { asset: "gravityPostPodLostSfx" },
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
    "pod-lost": { hitStopMs: 60, trauma: 0.3 },
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
const POD_PROXY_ID = "mail-pod-body";
const collisionWorld = engineGame.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });
const dockSensorIds = new Set<string>();
let podProxyId = "";

function buildCollisions(): void {
  collisionWorld.clear();
  const proxy = collisionWorld.add({
    id: POD_PROXY_ID,
    type: "dynamic",
    position: [pod.kinematic.position[0], PLAY_PLANE_Y, pod.kinematic.position[1]],
    shape: { kind: "sphere", radius: POD_BODY_SPEC.radius }
  });
  podProxyId = proxy.id;
  for (const station of stations) {
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

interface DockEventRecord {
  readonly stationId: string;
  readonly kind: "capture" | "bounce";
}
const pendingDocks: string[] = [];
const dockEventLog: DockEventRecord[] = [];
let dockEventCount = 0;

// ------------------------------------------------------------- input ---------

const input: GameInputController = engineGame.input({
  actions: {
    burnPrograde: ["KeyW", "ArrowUp"],
    burnRetro: ["KeyS", "ArrowDown"],
    warp: ["Space"],
    next: ["KeyN"],
    retry: ["KeyR"],
    pause: ["KeyP"],
    aimCounterClockwise: ["ArrowLeft", "KeyA"],
    aimClockwise: ["ArrowRight", "KeyD"],
    powerDown: ["KeyZ"],
    powerUp: ["KeyX"],
    // §6.9.13 P0 (wave-3 day-0): Enter launches along the active aim — the
    // drag gesture stays authoritative while a pointer is held.
    launch: ["Enter"]
  },
  bufferMs: 90
});

let keyboardAimBearing = 0;
let keyboardAimPower = 0.6;

function resetKeyboardAim(): void {
  const from = originStation();
  const to = destinationStation();
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  keyboardAimBearing = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : 0;
  keyboardAimPower = 0.6;
}
resetKeyboardAim();

function keyboardAimVector(): { dirX: number; dirZ: number; power: number } {
  return {
    dirX: Math.sin(keyboardAimBearing),
    dirZ: Math.cos(keyboardAimBearing),
    power: keyboardAimPower
  };
}

function currentAimVector(): { dirX: number; dirZ: number; power: number } | null {
  const dx = aimCurrent.x - aimStart.x;
  const dy = aimCurrent.y - aimStart.y;
  const lengthPx = Math.hypot(dx, dy);
  if (lengthPx < 6) return null;
  const power = Math.min(1, lengthPx / AIM_DRAG_PIXEL_RANGE);
  return { dirX: dx / lengthPx, dirZ: dy / lengthPx, power };
}

function activeAimVector(): { dirX: number; dirZ: number; power: number } | null {
  return aiming ? currentAimVector() : keyboardAimVector();
}

function steerKeyboardAim(dt: number): void {
  if (input.held("aimCounterClockwise")) keyboardAimBearing -= KEYBOARD_AIM_RATE * dt;
  if (input.held("aimClockwise")) keyboardAimBearing += KEYBOARD_AIM_RATE * dt;
  if (input.held("powerUp")) keyboardAimPower = Math.min(1, keyboardAimPower + KEYBOARD_POWER_RATE * dt);
  if (input.held("powerDown")) keyboardAimPower = Math.max(KEYBOARD_MIN_POWER, keyboardAimPower - KEYBOARD_POWER_RATE * dt);
}

function launchActiveAim(by: "pointer" | "keyboard" | "autopilot"): boolean {
  const vector = activeAimVector();
  if (!vector || vector.power < MIN_LAUNCH_POWER) return false;
  const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  launchWithPrediction([vector.dirX, vector.dirZ], speed, by);
  return true;
}

const canvas = game.app.canvas;
if (canvas) {
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    unlockAudio();
    if (pod.state !== "ready" || paused || flyby.active) return;
    aiming = true;
    aimStart.x = event.clientX;
    aimStart.y = event.clientY;
    aimCurrent.x = event.clientX;
    aimCurrent.y = event.clientY;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic evidence pointers may have no native capture target.
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!aiming) return;
    aimCurrent.x = event.clientX;
    aimCurrent.y = event.clientY;
  });
  const releaseAim = (): void => {
    if (!aiming) return;
    aiming = false;
    const vector = currentAimVector();
    if (vector && vector.power >= MIN_LAUNCH_POWER) {
      const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
      launchWithPrediction([vector.dirX, vector.dirZ], speed, "pointer");
    }
  };
  canvas.addEventListener("pointerup", releaseAim);
  canvas.addEventListener("pointercancel", releaseAim);
}

window.addEventListener("keydown", () => {
  unlockAudio();
  if (flyby.active) {
    skipFlyby(flyby);
    updateFlyby(flyby, 0);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// -------------------------------------------------- events + contracts ------

const rigState = { podX: pod.kinematic.position[0], podZ: pod.kinematic.position[1], inFlight: false };

function emitPodEvents(events: readonly PodEvent[]): void {
  for (const event of events) {
    if (event.type === "launch") {
      pushCue("launch-whoosh");
      fx.launch(pod.kinematic.position[0], pod.kinematic.position[1]);
    } else if (event.type === "assist") {
      pushCue("assist-chime");
    } else if (event.type === "correction") {
      pushCue("burn-loop");
      fx.correction(pod.kinematic.position[0], pod.kinematic.position[1]);
    } else if (
      event.type === "planet-strike" || event.type === "solar-escape"
        || event.type === "stranded" || event.type === "timeout"
    ) {
      pushCue("pod-lost");
      fx.podLost(pod.kinematic.position[0], pod.kinematic.position[1]);
    } else if (event.type === "too-fast") {
      pushCue("bounce-off");
      fx.bounce(pod.kinematic.position[0], pod.kinematic.position[1]);
    }
  }
}

function registerFail(reason: string): void {
  lastFailReason = reason;
  failedContracts += 1;
  lostCooldownSeconds = 1.4;
  if (failedContracts >= SHIFT_FAIL_LIMIT) shiftOver = true;
}

function handleDock(stationId: string): void {
  if (pod.state !== "coasting") return;
  if (stationId !== contract().destinationStationId) return;
  const outcome = evaluateCapture(pod, contract(), stationId);
  dockEventCount += 1;
  const core = stationWorld(contract().destinationStationId);
  if (outcome.docked) {
    dockEventLog.push({ stationId, kind: "capture" });
    pushCue("dock-lock");
    pushCue("contract-clear");
    fx.dockClamp(core.x, core.z);
    fx.delivery(core.x, core.z);
    lastDockHash = dockPointHash([core.x, core.z]);
    lastScoreCard = scoreContract({
      propellant: pod.propellant,
      distanceToCore: outcome.distanceToCore,
      dockRadius: DOCK_SENSOR_RADIUS,
      assists: pod.assists,
      bonusBodyHit: contract().bonusBodyId !== null && pod.flybys.has(contract().bonusBodyId!)
    });
    score += lastScoreCard.total;
    completedContracts += 1;
    sparkLife = 0.7;
    hidePrediction();
  } else {
    dockEventLog.push({ stationId, kind: "bounce" });
  }
  if (dockEventLog.length > 12) dockEventLog.shift();
}

function resetCampaign(): void {
  lastFailReason = null;
  contractIndex = 0;
  score = 0;
  failedContracts = 0;
  completedContracts = 0;
  shiftOver = false;
  campaignComplete = false;
  lastScoreCard = null;
  launchedBy = null;
  flyby.visited.clear();
  flyby.beatsRun = 0;
  dockEventLog.length = 0;
  dockEventCount = 0;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
  resetKeyboardAim();
  hidePrediction();
  pushCue("ui-confirm");
}

function nextContract(): void {
  if (pod.state !== "docked") return;
  pushCue("ui-confirm");
  if (contractIndex >= CONTRACTS.length - 1) {
    campaignComplete = true;
    return;
  }
  contractIndex += 1;
  lastScoreCard = null;
  launchedBy = null;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
  resetKeyboardAim();
}

function retryContract(): void {
  if (shiftOver || campaignComplete) {
    resetCampaign();
    return;
  }
  if (flyby.active) {
    skipFlyby(flyby);
    updateFlyby(flyby, 0);
  }
  paused = false;
  aiming = false;
  launchedBy = null;
  pushCue("ui-confirm");
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
  resetKeyboardAim();
}

// ----------------------------------------------------- prediction lines -----

function resetPredictionTelemetry(): void {
  launchPrediction = [];
  predictionComparedSamples = 0;
  predictionMaxDivergence = 0;
  actualPath.length = 0;
  syncActualPath();
}

function launchWithPrediction(direction2: readonly [number, number], speed: number, by: LaunchedBy): void {
  const result = launch(pod, direction2, speed);
  if (result.length === 0) return;
  launchedBy = by;
  launchPrediction = integratePath({
    bodies: WELL_BODIES,
    tuning: contract().tuning,
    start: pod.kinematic.position,
    velocity: pod.kinematic.velocity,
    steps: PREDICTION_MAX_STEPS
  }).samples;
  syncLaunchPredictionPath();
  predictionComparedSamples = 0;
  predictionMaxDivergence = 0;
  actualPath.length = 0;
  actualPath.push([pod.kinematic.position[0], pod.kinematic.position[1]]);
  syncActualPath();
  emitPodEvents(result);
}

function recordActualPath(): void {
  const last = actualPath[actualPath.length - 1];
  if (last && Math.hypot(last[0] - pod.kinematic.position[0], last[1] - pod.kinematic.position[1]) < 0.12) return;
  actualPath.push([pod.kinematic.position[0], pod.kinematic.position[1]]);
  if (actualPath.length > ACTUAL_PATH_BEADS) actualPath.shift();
  syncActualPath();
}

function syncActualPath(): void {
  for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
    const bead = world.pools.actualBeads[index]!;
    const point = actualPath[index];
    if (!point) {
      bead.scale = [0, 0, 0];
      continue;
    }
    bead.position = [point[0], PLAY_PLANE_Y + 0.025, point[1]];
    bead.scale = [0.052, 0.02, 0.052];
  }
}

function samplePredictionDivergence(): void {
  if (pod.correctionsUsed > 0 || launchPrediction.length === 0) return;
  const sampleIndex = Math.max(0, Math.round(pod.simulationSeconds / FIXED_DT) - 1);
  if (sampleIndex >= launchPrediction.length) return;
  if (sampleIndex < predictionComparedSamples) return;
  const expected = launchPrediction[sampleIndex]!.position;
  const error = Math.hypot(expected[0] - pod.kinematic.position[0], expected[1] - pod.kinematic.position[1]);
  predictionComparedSamples = sampleIndex + 1;
  predictionMaxDivergence = Math.max(predictionMaxDivergence, error);
}

function updatePrediction(): void {
  const vector = aiming ? currentAimVector() : null;
  if (!vector || pod.state !== "ready") {
    // During coast the launch prediction stays as cyan route markers so the
    // player can compare it with the cream flown path.
    if (!aiming && pod.state !== "coasting") hidePrediction();
    return;
  }
  const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  const path = integratePath({
    bodies: WELL_BODIES,
    tuning: contract().tuning,
    start: pod.kinematic.position,
    velocity: [vector.dirX * speed, vector.dirZ * speed],
    steps: PREDICTION_MAX_STEPS
  });
  predictionSteps = path.samples.length;
  const beads = buildPredictionBeads({ samples: path.samples, maxBeads: PREDICTION_BEADS });
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    const slot = world.pools.predBeads[index]!;
    const bead = beads[index];
    if (!bead) {
      slot.scale = [0, 0, 0];
      continue;
    }
    slot.position = [bead.x, PLAY_PLANE_Y + 0.03, bead.z];
    slot.scale = [0.028, 0.014, 0.028];
  }
}

function syncLaunchPredictionPath(): void {
  const beads = buildPredictionBeads({ samples: launchPrediction, maxBeads: PREDICTION_BEADS });
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    const slot = world.pools.predBeads[index]!;
    const bead = beads[index];
    if (!bead) {
      slot.scale = [0, 0, 0];
      continue;
    }
    slot.position = [bead.x, PLAY_PLANE_Y - 0.045, bead.z];
    slot.scale = [0.052, 0.052, 0.052];
  }
}

function hidePrediction(): void {
  predictionSteps = 0;
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    world.pools.predBeads[index]!.scale = [0, 0, 0];
  }
}

// ---------------------------------------------------------- visual sync -----

function syncPodVisual(): void {
  const podNode = handle("mail-pod");
  const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  const yaw = speed > 1e-4 ? Math.atan2(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) : 0;
  podNode?.setPosition(pod.kinematic.position[0], PLAY_PLANE_Y + 0.06, pod.kinematic.position[1]);
  if (speed > 1e-4) podNode?.setRotation(0, yaw, 0);
  podNode?.setVisible(pod.state !== "lost");
  // Thrust cone while a correction burns or launch just fired.
  const cone = handle("pod-thrust-cone");
  const burning = pod.state === "coasting" && pod.correctionsUsed > 0 && pod.correctionTokensRemaining === 0 && speed > 0;
  if (cone) {
    cone.setVisible(burning);
    if (burning) {
      cone.setPosition(
        pod.kinematic.position[0] - pod.kinematic.velocity[0] * 0.14,
        PLAY_PLANE_Y + 0.06,
        pod.kinematic.position[1] - pod.kinematic.velocity[1] * 0.14
      ).setRotation(Math.PI / 2, 0, yaw);
    }
  }
  // Trail streaks trail the flown velocity while coasting.
  for (let index = 0; index < TRAIL_STREAKS; index += 1) {
    const streak = world.pools.trailStreaks[index]!;
    const active = pod.state === "coasting" && speed > 0.05 && actualPath.length > index + 1;
    if (!active) {
      streak.scale = [0, 0, 0];
      continue;
    }
    const back = actualPath[actualPath.length - 1 - index]!;
    streak.position = [back[0], PLAY_PLANE_Y + 0.03, back[1]];
    streak.rotation = [0, yaw, 0];
    streak.scale = [0.05 - index * 0.004, 0.012, 0.12 - index * 0.012];
  }
}

function syncStationPulses(): void {
  const destination = destinationStation();
  for (const station of stations) {
    const pulse = handle(station.pulseNodeId);
    if (!pulse) continue;
    const distance = Math.hypot(pod.kinematic.position[0] - station.x, pod.kinematic.position[1] - station.z);
    const isOpen = station.id === destination.id && pod.state === "coasting"
      && distance < station.dockRadius * 3.2
      && Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) < contract().captureLimit * 1.2;
    const breathe = isOpen ? 1.25 + Math.sin(frame * 0.35) * 0.22 : 1;
    const scale = station.dockRadius * 2.8 * breathe;
    pulse.setScale([scale, scale, 0.014]);
  }
}

function syncSparks(dt: number): void {
  if (sparkLife > 0) sparkLife = Math.max(0, sparkLife - dt);
  const core = stationWorld(contract().destinationStationId);
  for (let index = 0; index < SPARK_COUNT; index += 1) {
    const spark = world.pools.dockSparks[index]!;
    if (sparkLife <= 0) {
      spark.position = [0, -4, 0];
      spark.scale = [0, 0, 0];
      continue;
    }
    const travel = (0.7 - sparkLife) * 1.4;
    const dir = sparkDirections[index]!;
    spark.position = [
      core.x + dir[0] * travel,
      PLAY_PLANE_Y + 0.05 + sparkLife * 0.3,
      core.z + dir[1] * travel
    ];
    spark.scale = [0.05, 0.05, 0.05];
  }
}

function syncFlybyDrones(progress: number | null): void {
  const body = flybyBody(flyby.bodyId);
  for (let index = 0; index < FLYBY_DRONES; index += 1) {
    const drone = world.pools.flybyDrones[index]!;
    if (progress === null || !body) {
      drone.position = [0, -4, 0];
      drone.scale = [0, 0, 0];
      continue;
    }
    const angle = (index / FLYBY_DRONES) * Math.PI * 2 + progress * 2.4;
    const radius = body.visualRadius + 0.32 - progress * 0.12;
    const yLift = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 0.22;
    drone.position = [
      body.position[0] + Math.cos(angle) * radius,
      PLAY_PLANE_Y + yLift,
      body.position[1] + Math.sin(angle) * radius
    ];
    drone.scale = [0.06, 0.03, 0.06];
  }
}

// ------------------------------------------------------------------ HUD ------

let lastHudKey = "";
function syncHud(): void {
  const active = contract();
  const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  const fuelPct = Math.round(pod.propellant);
  const adriftLeft = Math.max(0, Math.ceil(ADRIFT_LIMIT_SECONDS - pod.adriftSeconds));
  let status: string;
  if (shiftOver) status = "SHIFT OVER — press R to reset";
  else if (campaignComplete) status = "SHIFT COMPLETE — press R to fly again";
  else if (pod.state === "docked") status = "DELIVERED — press N for next dispatch";
  else if (pod.state === "lost") status = "HULL LOST — " + (lastFailReason ?? "route failure");
  else if (flyby.active) status = "FLYBY — any key to skip";
  else if (pod.state === "ready") status = aiming ? "RELEASE TO LAUNCH" : "DRAG TO AIM · ARROWS STEER · ENTER LAUNCH";
  else if (pod.propellant <= 0) status = "TANK DRY — ADRIFT " + adriftLeft + "s";
  else status = pod.correctionTokensRemaining > 0
    ? "COASTING — W/S CORRECT · SPACE WARP"
    : "COASTING — SPACE WARP";
  const key = [
    contractIndex, score, fuelPct, status,
    Math.round(speed * 100), pod.correctionTokensRemaining
  ].join("|");
  if (key === lastHudKey) return;
  lastHudKey = key;
  game.hud.set("contract", active.title.toUpperCase());
  game.hud.set("score", String(score));
  game.hud.set("fuel", fuelPct + "%");
  game.hud.set("status", status);
  game.hud.set("speed", speed.toFixed(2) + " u/s");
  game.hud.set("tokens", "✦".repeat(Math.max(0, pod.correctionTokensRemaining)) || "—");
}

// ------------------------------------------------------------- tick ----------

function updateGameplay(dt: number): void {
  frame += 1;
  input.update(dt);

  if (input.pressed("pause")) paused = !paused;
  if (input.pressed("retry")) retryContract();
  if (input.pressed("next")) nextContract();
  if (paused) {
    warpActive = false;
    syncHud();
    return;
  }

  // Autopilot: one keyboard-path launch on the seeded origin→destination
  // bearing — the same code Enter runs, so launchedBy stays honest.
  if (autopilotEnabled && pod.state === "ready" && autopilotFiredAt < 0) {
    autopilotFiredAt = frame;
  }
  if (autopilotEnabled && pod.state === "ready" && autopilotFiredAt >= 0 && frame - autopilotFiredAt > 45) {
    launchActiveAim("keyboard");
  }

  // Skippable flyby beat: gameplay frozen while the drone sweep runs.
  const beatProgress = updateFlyby(flyby, dt);
  if (flyby.active) {
    syncFlybyDrones(reducedMotion ? null : beatProgress);
    syncHud();
    return;
  }
  syncFlybyDrones(null);

  if (lostCooldownSeconds > 0) {
    lostCooldownSeconds = Math.max(0, lostCooldownSeconds - dt);
    if (lostCooldownSeconds === 0 && pod.state === "lost") {
      resetPodForContract(pod, contract());
      launchedBy = null;
      hidePrediction();
    }
  }

  if (pod.state === "coasting" && input.pressed("burnPrograde")) emitPodEvents(applyCorrection(pod, 1));
  if (pod.state === "coasting" && input.pressed("burnRetro")) emitPodEvents(applyCorrection(pod, -1));
  warpActive = (input.held("warp") || touchWarp) && pod.state === "coasting";
  if (warpActive) pushCue("warp-hum");

  if (pod.state === "ready") {
    steerKeyboardAim(dt);
    if (input.pressed("launch")) launchActiveAim("keyboard");
    updatePrediction();
  } else if (pod.state === "coasting") {
    const events = updateCoast({ pod, contract: contract(), bodies: WELL_BODIES, dt, warpActive });
    samplePredictionDivergence();
    recordActualPath();
    for (const flybyId of pod.flybys) {
      if (requestFlyby(flyby, flybyId, { reducedMotion })) {
        pushCue("ui-confirm");
        break;
      }
    }
    emitPodEvents(events);
    for (const event of events) {
      if (event.type === "planet-strike") { registerFail("planet-strike:" + (event.bodyId ?? "")); break; }
      if (event.type === "solar-escape") { registerFail("solar-escape"); break; }
      if (event.type === "stranded") { registerFail("stranded"); break; }
      if (event.type === "timeout") { registerFail("timeout"); break; }
    }
    updatePrediction();
  }

  // Drive the pod proxy from the authored pose so Rapier witnesses real
  // sensor overlaps; drain dock triggers after the step.
  const proxyBody = collisionWorld.require(podProxyId);
  proxyBody.setPosition([pod.kinematic.position[0], PLAY_PLANE_Y, pod.kinematic.position[1]]);
  proxyBody.setVelocity([pod.kinematic.velocity[0], 0, pod.kinematic.velocity[1]]);
  const contactEvents = collisionWorld.step(dt);
  for (const eventItem of contactEvents) {
    if (eventItem.type !== "begin") continue;
    const involvesPod = eventItem.a.id === podProxyId || eventItem.b.id === podProxyId;
    if (!involvesPod) continue;
    const other = eventItem.a.id === podProxyId ? eventItem.b : eventItem.a;
    if (!other.sensor && !dockSensorIds.has(other.id)) continue;
    pendingDocks.push(other.id.slice("dock-sensor-".length));
  }
  while (pendingDocks.length > 0) {
    handleDock(pendingDocks.shift()!);
  }

  rigState.podX = pod.kinematic.position[0];
  rigState.podZ = pod.kinematic.position[1];
  rigState.inFlight = pod.state === "coasting";

  syncPodVisual();
  syncStationPulses();
  syncSparks(dt);
  syncHud();
}

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
  contractIndex,
  contract: contract(),
  pod,
  score,
  failedContracts,
  completedContracts,
  shiftOver,
  campaignComplete,
  paused,
  aiming,
  warping: warpActive,
  launchedBy,
  lastScoreCard,
  lastFailReason,
  dockEventCount,
  dockEvents: dockEventLog.map((record) => record.stationId + ":" + record.kind),
  flybyBeatsRun: flyby.beatsRun,
  flybyActive: flyby.active,
  visitedFlybys: [...flyby.visited],
  predictionSteps,
  predictionComparedSamples,
  predictionMaxDivergence,
  predictionTolerance: PREDICTION_DIVERGENCE_TOLERANCE,
  actualPathPoints: actualPath.length
});

publishGravityEvidence({
  game,
  run: runSnapshot,
  stations: () => stations,
  lastRigPose: () => game.app.camera?.evidence?.().pose ?? null,
  sceneSwaps: () => sceneSwaps,
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const scenarioParam = routeParams.get("scenario");
if (scenarioParam) {
  applyGravityScenario(scenarioParam, {
    loadContract: (index) => {
      contractIndex = Math.min(Math.max(0, index), CONTRACTS.length - 1);
      lastScoreCard = null;
      launchedBy = null;
      resetPodForContract(pod, contract());
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
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
